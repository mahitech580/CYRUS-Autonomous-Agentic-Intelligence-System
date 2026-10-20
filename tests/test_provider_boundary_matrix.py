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

