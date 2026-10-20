"""Expanded regression matrix for provider URL safety and response parsing."""
import unittest

from providers import (
    ProviderError,
    OpenAICompatibleProvider,
    _provider_url_is_allowed,
    _redact_provider_error_detail,
)


class ProviderBoundaryMatrixTests(unittest.TestCase):
    """Focused, offline-only boundary tests; no external provider requests."""


    def test_https_allowed_base_path(self):
        self.assertTrue(_provider_url_is_allowed("https://provider.example/v1"))

    def test_https_allowed_api_subdomain(self):
        self.assertTrue(_provider_url_is_allowed("https://api.provider.example/v1"))
