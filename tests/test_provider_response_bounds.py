"""Response-size safeguards for the live provider adapter."""
import json
import unittest
from unittest.mock import patch

from providers import MAX_PROVIDER_RESPONSE_BYTES, OpenAICompatibleProvider, ProviderError


class FakeResponse:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self, size=-1):
        return self.body if size < 0 else self.body[:size]


def provider():
    return OpenAICompatibleProvider(
        api_key="synthetic-test-key",
        base_url="https://provider.example/v1",
        model="synthetic-model",
    )


class ProviderResponseBoundTests(unittest.TestCase):
    def test_response_over_limit_is_rejected_before_json_parsing(self):
        body = b"x" * (MAX_PROVIDER_RESPONSE_BYTES + 1)
        with patch("providers.urlopen", return_value=FakeResponse(body)):
            with self.assertRaisesRegex(ProviderError, "exceeded.*limit"):
                provider()._chat("system", "user")

    def test_response_size_limit_is_two_megabytes(self):
        self.assertEqual(MAX_PROVIDER_RESPONSE_BYTES, 2_000_000)

    def test_response_at_limit_is_read_without_size_rejection(self):
        payload = json.dumps({"choices": [{"message": {"content": "ok"}}]}).encode("utf-8")
        body = b" " * (MAX_PROVIDER_RESPONSE_BYTES - len(payload)) + payload
        self.assertEqual(len(body), MAX_PROVIDER_RESPONSE_BYTES)
        with patch("providers.urlopen", return_value=FakeResponse(body)):
            self.assertEqual(provider()._chat("system", "user"), "ok")

    def test_small_valid_response_still_returns_content(self):
        body = json.dumps({"choices": [{"message": {"content": "valid response"}}]}).encode("utf-8")
        with patch("providers.urlopen", return_value=FakeResponse(body)):
            self.assertEqual(provider()._chat("system", "user"), "valid response")


if __name__ == "__main__":
    unittest.main()
