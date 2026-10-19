"""Focused edge-case tests for the OpenAI-compatible provider boundary."""
import io
import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from providers import (
    DeterministicProvider,
    OpenAICompatibleProvider,
    ProviderError,
    get_provider,
)


class FakeResponse:
    def __init__(self, body):
        self.body = body if isinstance(body, bytes) else body.encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self, limit=-1):
        return self.body if limit < 0 else self.body[:limit]


def make_provider(**overrides):
    values = {
        "api_key": "unit-test-api-key",
        "base_url": "https://provider.example/v1",
        "model": "test-model",
        "timeout_seconds": 13.0,
    }
    values.update(overrides)
    return OpenAICompatibleProvider(**values)


def fake_chat_response(content):
    body = json.dumps({"choices": [{"message": {"content": content}}]})
    return FakeResponse(body)


class ProviderEdgeCaseTests(unittest.TestCase):
    def test_http_error_redacts_complete_authorization_bearer_value(self):
        secret = "never-display-this-bearer-token"
        error = HTTPError(
            "https://provider.example/v1/chat/completions",
            401,
            "Unauthorized",
            {},
            io.BytesIO(json.dumps({"error": f"Authorization: Bearer {secret}"}).encode()),
        )
        with patch("providers.urlopen", side_effect=error):
            with self.assertRaises(ProviderError) as caught:
                make_provider()._chat("system", "user")
        self.assertIn("401", str(caught.exception))
        self.assertNotIn(secret, str(caught.exception))

    def test_json_parser_accepts_valid_object(self):
        self.assertEqual(OpenAICompatibleProvider._json('{"steps":["one"]}'), {"steps": ["one"]})



    def test_json_parser_accepts_array(self):
        self.assertEqual(OpenAICompatibleProvider._json('["a", "b"]'), ["a", "b"])


    def test_json_parser_trims_outer_whitespace(self):
        self.assertEqual(OpenAICompatibleProvider._json('  \n {"ok": true} \t'), {"ok": True})


    def test_json_parser_accepts_json_fence(self):
        self.assertEqual(OpenAICompatibleProvider._json('```json\n{"ok": true}\n```'), {"ok": True})


    def test_json_parser_accepts_uppercase_fence_label(self):
        self.assertEqual(OpenAICompatibleProvider._json('```JSON\n{"count": 2}\n```'), {"count": 2})


    def test_json_parser_recovers_object_from_prose(self):
        self.assertEqual(OpenAICompatibleProvider._json('Result follows: {"ready": true} End.'), {"ready": True})


    def test_json_parser_recovers_array_from_prose(self):
        self.assertEqual(OpenAICompatibleProvider._json('Items: ["alpha", "beta"] done'), ["alpha", "beta"])


    def test_json_parser_accepts_integer_primitive(self):
        self.assertEqual(OpenAICompatibleProvider._json("42"), 42)


    def test_json_parser_accepts_boolean_primitive(self):
        self.assertIs(OpenAICompatibleProvider._json("true"), True)


    def test_json_parser_preserves_nested_structure(self):
        value = {"plan": [{"name": "api", "checks": [1, 2]}]}
        self.assertEqual(OpenAICompatibleProvider._json(json.dumps(value)), value)


    def test_json_parser_rejects_prose_without_structure(self):
        with self.assertRaisesRegex(ProviderError, "did not contain"):
            OpenAICompatibleProvider._json("No structured response was provided.")


    def test_json_parser_reports_incomplete_structure(self):
        with self.assertRaisesRegex(ProviderError, "incomplete JSON"):
            OpenAICompatibleProvider._json('{"steps": [')


    def test_json_parser_reports_malformed_embedded_json(self):
        with self.assertRaisesRegex(ProviderError, "invalid JSON"):
            OpenAICompatibleProvider._json('Response: {"steps": [broken]}')


    def test_string_list_reads_steps_key(self):
        self.assertEqual(OpenAICompatibleProvider._string_list({"steps": ["one", "two"]}), ["one", "two"])


    def test_string_list_reads_considerations_key(self):
        self.assertEqual(OpenAICompatibleProvider._string_list({"considerations": ["risk", "rollback"]}), ["risk", "rollback"])


    def test_string_list_reads_checks_key(self):
        self.assertEqual(OpenAICompatibleProvider._string_list({"checks": ["unit", "integration"]}), ["unit", "integration"])


    def test_string_list_prefers_steps_key(self):
        value = {"steps": ["plan"], "considerations": ["other"]}
        self.assertEqual(OpenAICompatibleProvider._string_list(value), ["plan"])


    def test_string_list_trims_whitespace(self):
        self.assertEqual(OpenAICompatibleProvider._string_list(["  first  ", "\tsecond\n"]), ["first", "second"])


    def test_string_list_drops_blank_items(self):
        self.assertEqual(OpenAICompatibleProvider._string_list(["first", "", "   ", "second"]), ["first", "second"])


    def test_string_list_ignores_non_string_items(self):
        self.assertEqual(OpenAICompatibleProvider._string_list(["first", 7, None, {"x": 1}, "second"]), ["first", "second"])


    def test_string_list_caps_each_item_length(self):
        result = OpenAICompatibleProvider._string_list(["x" * 510])
        self.assertEqual(len(result[0]), 500)


    def test_string_list_caps_item_count(self):
        result = OpenAICompatibleProvider._string_list([f"item-{n}" for n in range(12)])
        self.assertEqual(result, [f"item-{n}" for n in range(8)])


    def test_string_list_enforces_minimum_items(self):
        with self.assertRaisesRegex(ProviderError, "too few"):
            OpenAICompatibleProvider._string_list(["only one"], minimum=2)


    def test_string_list_rejects_non_list_input(self):
        with self.assertRaisesRegex(ProviderError, "unexpected list format"):
            OpenAICompatibleProvider._string_list("not a list")


    def test_string_list_rejects_blank_only_items(self):
        with self.assertRaisesRegex(ProviderError, "too few"):
            OpenAICompatibleProvider._string_list(["", "   "])


    def test_string_list_allows_empty_when_minimum_zero(self):
        self.assertEqual(OpenAICompatibleProvider._string_list([], minimum=0), [])


    def test_string_list_does_not_mutate_input(self):
        original = [" first ", "", "second"]
        OpenAICompatibleProvider._string_list(original)
        self.assertEqual(original, [" first ", "", "second"])


    def test_chat_returns_valid_assistant_content(self):
        with patch("providers.urlopen", return_value=fake_chat_response("Provider answer")):
            self.assertEqual(make_provider()._chat("system", "user"), "Provider answer")


    def test_chat_joins_text_content_parts(self):
        response = FakeResponse(json.dumps({"choices": [{"message": {"content": [{"text": "hello "}, {"text": "world"}]}}]}))
        with patch("providers.urlopen", return_value=response):
            self.assertEqual(make_provider()._chat("s", "u"), "hello world")


    def test_chat_ignores_non_mapping_content_parts(self):
        response = FakeResponse(json.dumps({"choices": [{"message": {"content": [{"text": "useful"}, "ignored", None]}}]}))
        with patch("providers.urlopen", return_value=response):
            self.assertEqual(make_provider()._chat("s", "u"), "useful")


    def test_chat_strips_response_whitespace(self):
        with patch("providers.urlopen", return_value=fake_chat_response("  answer \n")):
            self.assertEqual(make_provider()._chat("s", "u"), "answer")


    def test_chat_caps_response_length(self):
        with patch("providers.urlopen", return_value=fake_chat_response("x" * 18100)):
            self.assertEqual(len(make_provider()._chat("s", "u")), 18000)


    def test_chat_builds_post_request_with_model(self):
        captured = []
        def send(request, timeout):
            captured.append((request, timeout))
            return fake_chat_response("ok")
        with patch("providers.urlopen", side_effect=send):
            make_provider(base_url="https://provider.example/v1/")._chat("sys", "usr", 700)
        request, _ = captured[0]
        body = json.loads(request.data.decode("utf-8"))
        self.assertEqual(request.method, "POST")
        self.assertEqual(request.full_url, "https://provider.example/v1/chat/completions")
        self.assertEqual(body["model"], "test-model")



    def test_chat_request_uses_system_user_roles_and_temperature(self):
        captured = []
        with patch("providers.urlopen", side_effect=lambda req, timeout: (captured.append(req) or fake_chat_response("ok"))):
            make_provider()._chat("system prompt", "user prompt")
        body = json.loads(captured[0].data.decode("utf-8"))
        self.assertEqual([message["role"] for message in body["messages"]], ["system", "user"])
        self.assertEqual([message["content"] for message in body["messages"]], ["system prompt", "user prompt"])
        self.assertEqual(body["temperature"], 0.2)



    def test_chat_clamps_max_tokens_to_minimum(self):
        captured = []
        with patch("providers.urlopen", side_effect=lambda req, timeout: (captured.append(req) or fake_chat_response("ok"))):
            make_provider()._chat("s", "u", -10)
        self.assertEqual(json.loads(captured[0].data)["max_tokens"], 128)



    def test_chat_clamps_max_tokens_to_maximum(self):
        captured = []
        with patch("providers.urlopen", side_effect=lambda req, timeout: (captured.append(req) or fake_chat_response("ok"))):
            make_provider()._chat("s", "u", 9000)
        self.assertEqual(json.loads(captured[0].data)["max_tokens"], 5000)



    def test_chat_passes_configured_timeout(self):
        captured = []
        def send(request, timeout):
            captured.append(timeout)
            return fake_chat_response("ok")
        with patch("providers.urlopen", side_effect=send):
            make_provider(timeout_seconds=17.5)._chat("s", "u")
        self.assertEqual(captured, [17.5])



    def test_chat_rejects_top_level_array_response(self):
        with patch("providers.urlopen", return_value=FakeResponse("[]")):
            with self.assertRaisesRegex(ProviderError, "no assistant message"):
                make_provider()._chat("s", "u")



    def test_chat_rejects_empty_choices(self):
        with patch("providers.urlopen", return_value=FakeResponse('{"choices": []}')):
            with self.assertRaisesRegex(ProviderError, "no assistant message"):
                make_provider()._chat("s", "u")



    def test_chat_rejects_missing_message_object(self):
        with patch("providers.urlopen", return_value=FakeResponse('{"choices": [{"text": "answer"}]}')):
            with self.assertRaisesRegex(ProviderError, "no assistant message"):
                make_provider()._chat("s", "u")



    def test_chat_rejects_non_string_content(self):
        with patch("providers.urlopen", return_value=FakeResponse('{"choices": [{"message": {"content": 123}}]}')):
            with self.assertRaisesRegex(ProviderError, "empty answer"):
                make_provider()._chat("s", "u")



    def test_chat_rejects_empty_string_content(self):
        with patch("providers.urlopen", return_value=fake_chat_response("")):
            with self.assertRaisesRegex(ProviderError, "empty answer"):
                make_provider()._chat("s", "u")



    def test_chat_rejects_whitespace_only_content(self):
        with patch("providers.urlopen", return_value=fake_chat_response(" \t\n ")):
            with self.assertRaisesRegex(ProviderError, "empty answer"):
                make_provider()._chat("s", "u")



    def test_chat_rejects_invalid_json_body(self):
        with patch("providers.urlopen", return_value=FakeResponse("{broken")):
            with self.assertRaisesRegex(ProviderError, "invalid JSON"):
                make_provider()._chat("s", "u")



    def test_chat_rejects_invalid_utf8_body(self):
        with patch("providers.urlopen", return_value=FakeResponse(b"\xff")):
            with self.assertRaisesRegex(ProviderError, "invalid JSON"):
                make_provider()._chat("s", "u")



    def test_chat_converts_timeout_to_safe_error(self):
        with patch("providers.urlopen", side_effect=TimeoutError("slow")):
            with self.assertRaisesRegex(ProviderError, "timed out"):
                make_provider()._chat("s", "u")



    def test_chat_converts_url_error_to_safe_error(self):
        with patch("providers.urlopen", side_effect=URLError("connection refused")):
            with self.assertRaisesRegex(ProviderError, "Could not reach"):
                make_provider()._chat("s", "u")



    def test_chat_converts_os_error_to_safe_error(self):
        with patch("providers.urlopen", side_effect=OSError("socket closed")):
            with self.assertRaisesRegex(ProviderError, "network request failed"):
                make_provider()._chat("s", "u")



    def test_chat_redacts_api_key_assignment_in_http_error(self):
        secret = "provider-secret-do-not-log"
        error = HTTPError("https://provider.example", 401, "Unauthorized", {}, io.BytesIO(json.dumps({"message": f"api_key={secret}"}).encode()))
        with patch("providers.urlopen", side_effect=error):
            with self.assertRaises(ProviderError) as caught:
                make_provider()._chat("s", "u")
        self.assertNotIn(secret, str(caught.exception))



    def test_chat_redacts_secret_assignment_in_http_error(self):
        secret = "credential-value-must-not-escape"
        error = HTTPError("https://provider.example", 403, "Forbidden", {}, io.BytesIO(json.dumps({"detail": f"secret={secret}"}).encode()))
        with patch("providers.urlopen", side_effect=error):
            with self.assertRaises(ProviderError) as caught:
                make_provider()._chat("s", "u")
        self.assertNotIn(secret, str(caught.exception))



    def test_chat_redacts_bearer_token_in_http_error(self):
        secret = "standalone-bearer-private-value"
        error = HTTPError("https://provider.example", 401, "Unauthorized", {}, io.BytesIO(json.dumps({"detail": f"Bearer {secret}"}).encode()))
        with patch("providers.urlopen", side_effect=error):
            with self.assertRaises(ProviderError) as caught:
                make_provider()._chat("s", "u")
        self.assertNotIn(secret, str(caught.exception))

if __name__ == "__main__":
    unittest.main()
