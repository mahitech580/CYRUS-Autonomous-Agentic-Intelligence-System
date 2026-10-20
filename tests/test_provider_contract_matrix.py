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
