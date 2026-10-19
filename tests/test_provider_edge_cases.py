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


if __name__ == "__main__":
    unittest.main()


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
