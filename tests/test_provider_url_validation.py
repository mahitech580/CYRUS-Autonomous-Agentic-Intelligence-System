"""Regression tests for safe OpenAI-compatible provider URL selection."""
import unittest
from unittest.mock import patch

from providers import (
    DeterministicProvider,
    OpenAICompatibleProvider,
    _provider_url_is_allowed,
    get_provider,
)


class ProviderUrlValidationTests(unittest.TestCase):
    def test_remote_https_provider_is_allowed(self):
        self.assertTrue(_provider_url_is_allowed("https://provider.example/v1"))

    def test_loopback_ipv4_http_provider_is_allowed(self):
        self.assertTrue(_provider_url_is_allowed("http://127.0.0.1:8080/v1"))

    def test_loopback_ipv6_http_provider_is_allowed(self):
        self.assertTrue(_provider_url_is_allowed("http://[::1]:8080/v1"))

    def test_exact_localhost_http_provider_is_allowed(self):
        self.assertTrue(_provider_url_is_allowed("http://localhost:8080/v1"))

    def test_localhost_lookalike_domain_is_rejected(self):
        self.assertFalse(_provider_url_is_allowed("http://localhost.attacker.example/v1"))

    def test_loopback_ipv4_lookalike_domain_is_rejected(self):
        self.assertFalse(_provider_url_is_allowed("http://127.0.0.1.attacker.example/v1"))

    def test_non_loopback_http_ip_is_rejected(self):
        self.assertFalse(_provider_url_is_allowed("http://192.0.2.10/v1"))

    def test_plain_http_remote_domain_is_rejected(self):
        self.assertFalse(_provider_url_is_allowed("http://provider.example/v1"))

    def test_non_http_scheme_is_rejected(self):
        self.assertFalse(_provider_url_is_allowed("ftp://provider.example/v1"))

    def test_url_userinfo_is_rejected(self):
        self.assertFalse(_provider_url_is_allowed("https://user:password@provider.example/v1"))

    def test_url_query_is_rejected(self):
        self.assertFalse(_provider_url_is_allowed("https://provider.example/v1?api_key=do-not-put-secrets-in-url"))

    def test_url_fragment_is_rejected(self):
        self.assertFalse(_provider_url_is_allowed("https://provider.example/v1#fragment"))

    def test_malformed_port_is_rejected(self):
        self.assertFalse(_provider_url_is_allowed("https://provider.example:bad/v1"))

    def test_empty_url_is_rejected(self):
        self.assertFalse(_provider_url_is_allowed("  "))

    def test_remote_http_lookalike_falls_back_to_deterministic_provider(self):
        env = {
            "CYRUS_LLM_PROVIDER": "auto",
            "CYRUS_LLM_API_KEY": "synthetic-test-key",
            "CYRUS_LLM_BASE_URL": "http://localhost.attacker.example/v1",
            "CYRUS_LLM_MODEL": "synthetic-model",
        }
        with patch.dict("os.environ", env, clear=True):
            self.assertIsInstance(get_provider(), DeterministicProvider)

    def test_loopback_http_provider_can_be_configured_for_local_development(self):
        env = {
            "CYRUS_LLM_PROVIDER": "auto",
            "CYRUS_LLM_API_KEY": "synthetic-test-key",
            "CYRUS_LLM_BASE_URL": "http://127.0.0.1:8080/v1",
            "CYRUS_LLM_MODEL": "synthetic-model",
        }
        with patch.dict("os.environ", env, clear=True):
            provider = get_provider()
        self.assertIsInstance(provider, OpenAICompatibleProvider)
        self.assertEqual(provider.base_url, "http://127.0.0.1:8080/v1")


    def test_localhost_hostname_is_case_insensitive(self):
        self.assertTrue(_provider_url_is_allowed("http://LOCALHOST:8080/v1"))

    def test_high_ipv4_loopback_address_is_allowed(self):
        self.assertTrue(_provider_url_is_allowed("http://127.254.10.20:8080/v1"))

    def test_missing_scheme_is_rejected(self):
        self.assertFalse(_provider_url_is_allowed("provider.example/v1"))

    def test_url_with_empty_hostname_is_rejected(self):
        self.assertFalse(_provider_url_is_allowed("https:///v1"))

    def test_http_localhost_with_userinfo_is_rejected(self):
        self.assertFalse(_provider_url_is_allowed("http://user@localhost:8080/v1"))

    def test_url_with_empty_query_delimiter_is_rejected(self):
        self.assertFalse(_provider_url_is_allowed("https://provider.example/v1?"))


    def test_url_with_empty_fragment_delimiter_is_rejected(self):
        self.assertFalse(_provider_url_is_allowed("https://provider.example/v1#"))


    def test_url_with_empty_port_delimiter_is_rejected(self):
        self.assertFalse(_provider_url_is_allowed("https://provider.example:/v1"))


if __name__ == "__main__":
    unittest.main()
