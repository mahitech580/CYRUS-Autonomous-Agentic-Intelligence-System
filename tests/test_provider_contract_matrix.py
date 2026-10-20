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

