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
