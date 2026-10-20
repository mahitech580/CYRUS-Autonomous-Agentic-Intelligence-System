"""Network error messaging must not echo credential-like values."""
import io
import unittest
from unittest.mock import patch
from urllib.error import URLError

from providers import OpenAICompatibleProvider, ProviderError


def make_provider():
    return OpenAICompatibleProvider(
        api_key="synthetic-test-key",
        base_url="https://provider.example/v1",
        model="synthetic-model",
    )


class ProviderNetworkErrorTests(unittest.TestCase):
    def test_url_error_redacts_bearer_value(self):
        secret = "network-bearer-secret"
        with patch("providers.urlopen", side_effect=URLError("connection refused; Bearer " + secret)):
            with self.assertRaises(ProviderError) as caught:
                make_provider()._chat("system", "user")
        self.assertNotIn(secret, str(caught.exception))
        self.assertIn("Could not reach", str(caught.exception))

    def test_url_error_redacts_api_key_assignment(self):
        secret = "network-api-key-secret"
        with patch("providers.urlopen", side_effect=URLError("api_key=" + secret)):
            with self.assertRaises(ProviderError) as caught:
                make_provider()._chat("system", "user")
        self.assertNotIn(secret, str(caught.exception))

    def test_os_error_redacts_authorization_header(self):
        secret = "socket-bearer-secret"
        with patch("providers.urlopen", side_effect=OSError("Authorization: Bearer " + secret)):
            with self.assertRaises(ProviderError) as caught:
                make_provider()._chat("system", "user")
        self.assertNotIn(secret, str(caught.exception))
        self.assertIn("network request failed", str(caught.exception))

    def test_os_error_keeps_safe_network_diagnostic(self):
        with patch("providers.urlopen", side_effect=OSError("connection reset by peer")):
            with self.assertRaises(ProviderError) as caught:
                make_provider()._chat("system", "user")
        self.assertIn("connection reset by peer", str(caught.exception))

    def test_url_error_without_reason_uses_safe_fallback(self):
        with patch("providers.urlopen", side_effect=URLError("")):
            with self.assertRaises(ProviderError) as caught:
                make_provider()._chat("system", "user")
        self.assertIn("Could not reach", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
