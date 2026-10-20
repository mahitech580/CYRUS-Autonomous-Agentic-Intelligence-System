"""Contract regression matrix for provider parsing and diagnostic redaction.

These tests are offline and use only the provider's pure parsing helpers.
"""
import unittest

from providers import (
    ProviderError,
    OpenAICompatibleProvider,
    _redact_provider_error_detail,
)


class ProviderContractMatrixTests(unittest.TestCase):
    """Lock down edge-case behavior at the provider response boundary."""


    def test_string_list_accepts_two_items(self):
        self.assertEqual(OpenAICompatibleProvider._string_list(["alpha", "beta"]), ["alpha", "beta"])

    def test_string_list_accepts_unicode(self):
        self.assertEqual(OpenAICompatibleProvider._string_list(["café", "東京"]), ["café", "東京"])

    def test_string_list_trims_newline_padding(self):
        self.assertEqual(OpenAICompatibleProvider._string_list(["\n alpha \n"]), ["alpha"])

    def test_string_list_retains_internal_newlines(self):
        self.assertEqual(OpenAICompatibleProvider._string_list(["alpha\nbeta"]), ["alpha\nbeta"])

    def test_string_list_retains_duplicates(self):
        self.assertEqual(OpenAICompatibleProvider._string_list(["same", "same"]), ["same", "same"])

    def test_string_list_supports_considerations_key(self):
        self.assertEqual(OpenAICompatibleProvider._string_list({"considerations": ["risk one", "risk two"]}), ["risk one", "risk two"])

    def test_string_list_supports_checks_key(self):
        self.assertEqual(OpenAICompatibleProvider._string_list({"checks": ["check one", "check two"]}), ["check one", "check two"])

    def test_string_list_supports_steps_key_precedence(self):
        self.assertEqual(OpenAICompatibleProvider._string_list({"steps": ["step"], "checks": ["check"]}), ["step"])

    def test_string_list_rejects_tuple(self):
        with self.assertRaisesRegex(ProviderError, "unexpected list format"):
                    OpenAICompatibleProvider._string_list(("alpha", "beta"))

    def test_string_list_rejects_string(self):
        with self.assertRaisesRegex(ProviderError, "unexpected list format"):
                    OpenAICompatibleProvider._string_list("alpha")

    def test_string_list_rejects_integer(self):
        with self.assertRaisesRegex(ProviderError, "unexpected list format"):
                    OpenAICompatibleProvider._string_list(3)

    def test_string_list_rejects_none(self):
        with self.assertRaisesRegex(ProviderError, "unexpected list format"):
                    OpenAICompatibleProvider._string_list(None)

    def test_string_list_rejects_empty_list(self):
        with self.assertRaisesRegex(ProviderError, "too few usable list items"):
                    OpenAICompatibleProvider._string_list([])

    def test_string_list_rejects_list_of_non_strings(self):
        with self.assertRaisesRegex(ProviderError, "too few usable list items"):
                    OpenAICompatibleProvider._string_list([1, None, False])

    def test_string_list_enforces_custom_minimum(self):
        with self.assertRaisesRegex(ProviderError, "too few usable list items"):
                    OpenAICompatibleProvider._string_list(["one", "two"], minimum=3)

    def test_json_ignores_outer_whitespace(self):
        self.assertEqual(OpenAICompatibleProvider._json('  \n {"ok": true} \t '), {"ok": True})

    def test_json_preserves_unicode_values(self):
        self.assertEqual(OpenAICompatibleProvider._json('{"city": "東京"}'), {"city": "東京"})

    def test_json_parses_nested_objects(self):
        self.assertEqual(OpenAICompatibleProvider._json('{"review": {"risk": "LOW"}}'), {"review": {"risk": "LOW"}})

    def test_json_parses_nested_arrays(self):
        self.assertEqual(OpenAICompatibleProvider._json('{"checks": [["one"], ["two"]]}'), {"checks": [["one"], ["two"]]})

    def test_json_parses_boolean_false(self):
        self.assertEqual(OpenAICompatibleProvider._json('{"enabled": false}'), {"enabled": False})

    def test_json_parses_null(self):
        self.assertEqual(OpenAICompatibleProvider._json('{"value": null}'), {"value": None})

    def test_json_parses_escaped_quotes(self):
        self.assertEqual(OpenAICompatibleProvider._json('{"message": "say \\\"hello\\\""}'), {"message": 'say "hello"'})

    def test_json_parses_empty_object(self):
        self.assertEqual(OpenAICompatibleProvider._json('{}'), {})

    def test_json_parses_empty_array(self):
        self.assertEqual(OpenAICompatibleProvider._json('[]'), [])

    def test_json_extracts_array_after_prose(self):
        self.assertEqual(OpenAICompatibleProvider._json('Checks: ["input", "output"]'), ["input", "output"])

    def test_json_extracts_nested_object_after_prose(self):
        self.assertEqual(OpenAICompatibleProvider._json('Draft JSON follows: {"meta": {"count": 2}}'), {"meta": {"count": 2}})

    def test_json_accepts_uppercase_fence_label(self):
        self.assertEqual(OpenAICompatibleProvider._json('```JSON\n{"ok": true}\n```'), {"ok": True})

    def test_json_accepts_fence_without_label(self):
        self.assertEqual(OpenAICompatibleProvider._json('```\n{"ok": true}\n```'), {"ok": True})

    def test_json_rejects_incomplete_object(self):
        with self.assertRaisesRegex(ProviderError, "incomplete JSON"):
                    OpenAICompatibleProvider._json('{"value": 1')

    def test_json_rejects_malformed_object(self):
        with self.assertRaisesRegex(ProviderError, "invalid JSON"):
                    OpenAICompatibleProvider._json('{"value": }')

    def test_string_list_caps_default_length_at_eight(self):
        values = ["item " + str(i) for i in range(10)]
                self.assertEqual(len(OpenAICompatibleProvider._string_list(values)), 8)

    def test_string_list_honors_custom_maximum(self):
        values = ["one", "two", "three", "four"]
                self.assertEqual(OpenAICompatibleProvider._string_list(values, maximum=2), ["one", "two"])

    def test_string_list_honors_maximum_one(self):
        self.assertEqual(OpenAICompatibleProvider._string_list(["one", "two"], maximum=1), ["one"])

    def test_string_list_truncates_items_to_five_hundred_chars(self):
        long_item = "x" * 600
                result = OpenAICompatibleProvider._string_list([long_item])[0]
                self.assertEqual(len(result), 500)
                self.assertEqual(result, "x" * 500)

    def test_string_list_keeps_item_at_exact_limit(self):
        item = "z" * 500
                self.assertEqual(OpenAICompatibleProvider._string_list([item]), [item])

    def test_string_list_truncates_item_over_limit_by_one(self):
        item = "z" * 501
                self.assertEqual(len(OpenAICompatibleProvider._string_list([item])[0]), 500)

    def test_string_list_enforces_minimum_exactly(self):
        self.assertEqual(OpenAICompatibleProvider._string_list(["one", "two"], minimum=2), ["one", "two"])

    def test_string_list_rejects_below_custom_minimum(self):
        with self.assertRaisesRegex(ProviderError, "too few usable list items"):
                    OpenAICompatibleProvider._string_list(["one", "two", "three"], minimum=4)

    def test_string_list_rejects_dictionary_without_known_key(self):
        with self.assertRaisesRegex(ProviderError, "unexpected list format"):
                    OpenAICompatibleProvider._string_list({"items": ["one"]})

    def test_string_list_rejects_steps_key_with_none(self):
        with self.assertRaisesRegex(ProviderError, "unexpected list format"):
                    OpenAICompatibleProvider._string_list({"steps": None, "checks": ["ignored"]})

    def test_string_list_filters_booleans_and_numbers(self):
        self.assertEqual(OpenAICompatibleProvider._string_list([True, 42, "valid"]), ["valid"])

    def test_string_list_filters_whitespace_only_items(self):
        self.assertEqual(OpenAICompatibleProvider._string_list(["   ", "\n", "valid"]), ["valid"])

    def test_string_list_keeps_order_of_valid_values(self):
        self.assertEqual(OpenAICompatibleProvider._string_list(["third", 5, "first", "second"]), ["third", "first", "second"])

    def test_string_list_supports_minimum_zero_for_empty_list(self):
        self.assertEqual(OpenAICompatibleProvider._string_list([], minimum=0), [])

    def test_string_list_returns_trimmed_result_without_mutating_input(self):
        values = [" one ", " two "]
                before = values.copy()
                self.assertEqual(OpenAICompatibleProvider._string_list(values), ["one", "two"])
                self.assertEqual(values, before)

    def test_redaction_returns_empty_for_empty_string(self):
        self.assertEqual(_redact_provider_error_detail(""), "")

    def test_redaction_returns_empty_for_none(self):
        self.assertEqual(_redact_provider_error_detail(None), "")

    def test_redaction_preserves_safe_diagnostic_text(self):
        self.assertEqual(_redact_provider_error_detail("connection refused by upstream"), "connection refused by upstream")

    def test_redaction_scrubs_lowercase_authorization(self):
        result = _redact_provider_error_detail("authorization: Bearer abcdef12345")
                self.assertNotIn("abcdef12345", result)
                self.assertIn("[redacted]", result)

    def test_redaction_scrubs_api_key_with_hyphen(self):
        result = _redact_provider_error_detail("api-key: abcdef12345")
                self.assertNotIn("abcdef12345", result)
                self.assertIn("[redacted]", result)

    def test_redaction_scrubs_api_key_with_space(self):
        result = _redact_provider_error_detail("api key = abcdef12345")
                self.assertNotIn("abcdef12345", result)
                self.assertIn("[redacted]", result)

    def test_redaction_scrubs_quoted_password_value(self):
        result = _redact_provider_error_detail('{"password": "private-pass-123"}')
                self.assertNotIn("private-pass-123", result)
                self.assertIn("[redacted]", result)

    def test_redaction_scrubs_quoted_client_secret_value(self):
        result = _redact_provider_error_detail('{"client_secret": "client-secret-123"}')
                self.assertNotIn("client-secret-123", result)

    def test_redaction_scrubs_bearer_with_mixed_case(self):
        result = _redact_provider_error_detail("bEaReR MixedCaseToken12345")
                self.assertNotIn("MixedCaseToken12345", result)
                self.assertIn("[redacted]", result)

    def test_redaction_scrubs_multiple_bearer_values(self):
        result = _redact_provider_error_detail("Bearer tokenFirst123 Bearer tokenSecond456")
                self.assertNotIn("tokenFirst123", result)
                self.assertNotIn("tokenSecond456", result)

    def test_redaction_scrubs_rsa_private_key_block(self):
        detail = "-----BEGIN RSA PRIVATE KEY-----\\nkey-private-body\\n-----END RSA PRIVATE KEY-----"
                self.assertNotIn("key-private-body", _redact_provider_error_detail(detail))

    def test_redaction_scrubs_ec_private_key_block(self):
        detail = "-----BEGIN EC PRIVATE KEY-----\\nkey-private-body-ec\\n-----END EC PRIVATE KEY-----"
                self.assertNotIn("key-private-body-ec", _redact_provider_error_detail(detail))

    def test_redaction_scrubs_openssh_private_key_block(self):
        detail = "-----BEGIN OPENSSH PRIVATE KEY-----\\nkey-private-body-ssh\\n-----END OPENSSH PRIVATE KEY-----"
                self.assertNotIn("key-private-body-ssh", _redact_provider_error_detail(detail))

    def test_redaction_returns_empty_for_empty_string(self):
        self.assertEqual(_redact_provider_error_detail(""), "")
