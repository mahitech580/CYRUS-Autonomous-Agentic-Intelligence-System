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
