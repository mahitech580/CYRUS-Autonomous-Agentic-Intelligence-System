import io
import json
import os
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

import providers


class StubResponse:
    def __init__(self, payload):
        self.payload = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, limit=-1):
        return self.payload[:limit]


class ProviderConfigurationTests(unittest.TestCase):
    def test_missing_key_uses_honest_deterministic_demo(self):
        with patch.dict(os.environ, {}, clear=True):
            provider = providers.get_provider()
        self.assertEqual(provider.mode, "DEMO")
        self.assertEqual(provider.name, "deterministic")
        self.assertEqual(provider.status, "ready")

    def test_configured_https_openai_compatible_provider_is_selected(self):
        environment = {
            "CYRUS_LLM_PROVIDER": "auto",
            "CYRUS_LLM_API_KEY": "test-secret",
            "CYRUS_LLM_BASE_URL": "https://provider.example/v1",
            "CYRUS_LLM_MODEL": "test-model",
        }
        with patch.dict(os.environ, environment, clear=True):
            provider = providers.get_provider()
        self.assertEqual(provider.mode, "LIVE")
        self.assertEqual(provider.name, "openai-compatible")
        self.assertEqual(provider.model, "test-model")
        self.assertNotIn("test-secret", repr(provider))

    def test_explicit_demo_mode_never_uses_a_configured_key(self):
        environment = {
            "CYRUS_LLM_PROVIDER": "deterministic",
            "CYRUS_LLM_API_KEY": "test-secret",
        }
        with patch.dict(os.environ, environment, clear=True):
            provider = providers.get_provider()
        self.assertEqual(provider.mode, "DEMO")

    def test_remote_http_provider_is_rejected_to_protect_credentials(self):
        environment = {
            "CYRUS_LLM_API_KEY": "test-secret",
            "CYRUS_LLM_BASE_URL": "http://provider.example/v1",
            "CYRUS_LLM_MODEL": "test-model",
        }
        with patch.dict(os.environ, environment, clear=True):
            provider = providers.get_provider()
        self.assertEqual(provider.mode, "DEMO")

    def test_live_provider_sends_authenticated_chat_request_and_parses_plan(self):
        expected_steps = [
            "Define acceptance criteria",
            "Inspect service boundaries",
            "Draft implementation",
            "Plan verification",
            "Review failure modes",
            "Document delivery",
        ]
        reply = {"choices": [{"message": {"content": json.dumps({"steps": expected_steps})}}]}
        provider = providers.OpenAICompatibleProvider(
            api_key="unit-test-secret",
            base_url="https://provider.example/v1",
            model="unit-model",
            timeout_seconds=5,
        )
        with patch("providers.urlopen", return_value=StubResponse(reply)) as mocked:
            result = provider.plan("Build a production-ready task API")
        self.assertEqual(result, expected_steps)
        request = mocked.call_args.args[0]
        self.assertEqual(request.full_url, "https://provider.example/v1/chat/completions")
        self.assertEqual(request.get_header("Authorization"), "Bearer unit-test-secret")
        self.assertEqual(json.loads(request.data)["model"], "unit-model")
        self.assertNotIn("unit-test-secret", repr(result))

    def test_url_error_is_typed_as_connection_failure(self):
        provider = providers.OpenAICompatibleProvider(
            api_key="unit-test-secret",
            base_url="https://provider.example/v1",
            model="unit-model",
        )
        with patch("providers.urlopen", side_effect=URLError("Bearer network-private-secret-12345")):
            with self.assertRaises(providers.ProviderConnectionError) as raised:
                provider.plan("Build a safe API")
        self.assertIn("Could not reach", str(raised.exception))
        self.assertNotIn("network-private-secret-12345", str(raised.exception))
        self.assertIn("[redacted]", str(raised.exception).lower())

    def test_provider_timeout_is_typed_for_recovery_guidance(self):
        provider = providers.OpenAICompatibleProvider(
            api_key="unit-test-secret",
            base_url="https://provider.example/v1",
            model="unit-model",
        )
        with patch("providers.urlopen", side_effect=TimeoutError()):
            with self.assertRaises(providers.ProviderTimeoutError) as raised:
                provider.plan("Build a safe API")
        self.assertIn("timed out", str(raised.exception).lower())
        self.assertNotIn("unit-test-secret", str(raised.exception))

    def test_http_5xx_is_typed_as_provider_unavailable(self):
        provider = providers.OpenAICompatibleProvider(
            api_key="unit-test-secret",
            base_url="https://provider.example/v1",
            model="unit-model",
        )
        for status in (500, 502, 503, 504):
            with self.subTest(status=status):
                error = HTTPError(
                    "https://provider.example/v1/chat/completions",
                    status,
                    "provider unavailable",
                    {},
                    io.BytesIO(b'upstream overloaded'),
                )
                expected = (
                    providers.ProviderTimeoutError
                    if status == 504
                    else providers.ProviderUnavailableError
                )
                with patch("providers.urlopen", side_effect=error):
                    with self.assertRaises(expected) as raised:
                        provider.plan("Build a safe API")
                self.assertIn("HTTP " + str(status), str(raised.exception))

    def test_http_429_preserves_rate_limit_category_and_safe_retry_after(self):
        provider = providers.OpenAICompatibleProvider(
            api_key="unit-test-secret",
            base_url="https://provider.example/v1",
            model="unit-model",
        )
        error = HTTPError(
            "https://provider.example/v1/chat/completions",
            429,
            "too many requests",
            {"Retry-After": "15"},
            io.BytesIO(b'{"error":"quota exceeded","authorization":"Bearer private-provider-secret-12345"}'),
        )
        with patch("providers.urlopen", side_effect=error):
            with self.assertRaises(providers.ProviderRateLimitError) as raised:
                provider.plan("Build a safe API")
        message = str(raised.exception)
        self.assertIn("HTTP 429", message)
        self.assertNotIn("private-provider-secret-12345", message)
        self.assertIn("[redacted]", message.lower())

    def test_http_401_and_403_preserve_authentication_error_type(self):
        provider = providers.OpenAICompatibleProvider(
            api_key="unit-test-secret",
            base_url="https://provider.example/v1",
            model="unit-model",
        )
        for status in (401, 403):
            with self.subTest(status=status):
                error = HTTPError(
                    "https://provider.example/v1/chat/completions",
                    status,
                    "provider rejected credentials",
                    {},
                    io.BytesIO(b'{"message":"Bearer provider-secret-token-123456789"}'),
                )
                with patch("providers.urlopen", side_effect=error):
                    with self.assertRaises(providers.ProviderAuthenticationError) as raised:
                        provider.plan("Build a safe API")
                self.assertIsInstance(raised.exception, providers.ProviderError)
                self.assertNotIn("provider-secret-token-123456789", str(raised.exception))
                self.assertIn("[redacted]", str(raised.exception).lower())

    def test_invalid_provider_json_uses_typed_response_failure(self):
        class InvalidJsonResponse:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, limit=-1): return b"{invalid json"

        provider = providers.OpenAICompatibleProvider(
            api_key="unit-test-secret",
            base_url="https://provider.example/v1",
            model="unit-model",
        )
        with patch("providers.urlopen", return_value=InvalidJsonResponse()):
            with self.assertRaises(providers.ProviderResponseError) as raised:
                provider.plan("Build a safe API")
        self.assertIn("invalid JSON", str(raised.exception))
        self.assertNotIn("unit-test-secret", str(raised.exception))

    def test_live_provider_parses_markdown_fenced_json(self):
        result = providers.OpenAICompatibleProvider._json(
            "   ```json\n{\"checks\":[\"happy path\",\"bad input\"]}\n```   "
        )
        self.assertEqual(result, {"checks": ["happy path", "bad input"]})

    def test_deterministic_provider_proposes_checks_without_claiming_execution(self):
        provider = providers.DeterministicProvider()
        checks = provider.validation_plan("Build an API", "Draft only")
        review = provider.review("Build an API", [], "Draft only", checks)
        self.assertGreaterEqual(len(checks), 5)
        self.assertEqual(review["quality"], 0)
        self.assertIn("not", " ".join(review["findings"]).lower())


if __name__ == "__main__":
    unittest.main()
