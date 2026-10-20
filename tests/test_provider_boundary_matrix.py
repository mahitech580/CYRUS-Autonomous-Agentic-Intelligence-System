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

    def test_https_allowed_root_path(self):
        self.assertTrue(_provider_url_is_allowed("https://provider.example/"))

    def test_https_allowed_without_path(self):
        self.assertTrue(_provider_url_is_allowed("https://provider.example"))

    def test_https_allowed_standard_port(self):
        self.assertTrue(_provider_url_is_allowed("https://provider.example:443/v1"))

    def test_https_allowed_custom_port(self):
        self.assertTrue(_provider_url_is_allowed("https://provider.example:8443/v1"))

    def test_https_allowed_uppercase_scheme(self):
        self.assertTrue(_provider_url_is_allowed("HTTPS://PROVIDER.EXAMPLE/v1"))

    def test_https_allowed_models_endpoint(self):
        self.assertTrue(_provider_url_is_allowed("https://provider.example/v1/models"))

    def test_https_allowed_nested_subdomain(self):
        self.assertTrue(_provider_url_is_allowed("https://api.eu.provider.example/v1"))

    def test_https_allowed_low_port(self):
        self.assertTrue(_provider_url_is_allowed("https://provider.example:1/v1"))

    def test_https_allowed_documentation_ipv4(self):
        self.assertTrue(_provider_url_is_allowed("https://192.0.2.10/v1"))

    def test_https_allowed_ipv6_literal(self):
        self.assertTrue(_provider_url_is_allowed("https://[2001:db8::1]/v1"))

    def test_https_allowed_ipv6_loopback_over_tls(self):
        self.assertTrue(_provider_url_is_allowed("https://[::1]:443/v1"))

    def test_http_allowed_localhost(self):
        self.assertTrue(_provider_url_is_allowed("http://localhost:8080/v1"))

    def test_http_allowed_uppercase_localhost(self):
        self.assertTrue(_provider_url_is_allowed("http://LOCALHOST:8080/v1"))

    def test_http_allowed_ipv4_loopback(self):
        self.assertTrue(_provider_url_is_allowed("http://127.0.0.1:8080/v1"))

    def test_http_allowed_second_ipv4_loopback(self):
        self.assertTrue(_provider_url_is_allowed("http://127.0.0.2:8080/v1"))

    def test_http_allowed_ipv4_loopback_subnet(self):
        self.assertTrue(_provider_url_is_allowed("http://127.1.2.3:8080/v1"))

    def test_http_allowed_high_ipv4_loopback(self):
        self.assertTrue(_provider_url_is_allowed("http://127.254.10.20:8080/v1"))

    def test_http_allowed_last_ipv4_loopback(self):
        self.assertTrue(_provider_url_is_allowed("http://127.255.255.255:8080/v1"))

    def test_http_allowed_ipv4_loopback_max_port(self):
        self.assertTrue(_provider_url_is_allowed("http://127.3.4.5:65535/v1"))

    def test_http_allowed_ipv6_loopback(self):
        self.assertTrue(_provider_url_is_allowed("http://[::1]:8080/v1"))

    def test_http_allowed_expanded_ipv6_loopback(self):
        self.assertTrue(_provider_url_is_allowed("http://[0:0:0:0:0:0:0:1]:8080/v1"))

    def test_http_allowed_localhost_root(self):
        self.assertTrue(_provider_url_is_allowed("http://localhost/"))

    def test_http_allowed_localhost_no_path(self):
        self.assertTrue(_provider_url_is_allowed("http://localhost"))

    def test_http_allowed_localhost_port_80(self):
        self.assertTrue(_provider_url_is_allowed("http://localhost:80/v1"))

    def test_http_allowed_localhost_uppercase_scheme(self):
        self.assertTrue(_provider_url_is_allowed("HTTP://localhost:8080/v1"))

    def test_http_allowed_ipv4_loopback_no_port(self):
        self.assertTrue(_provider_url_is_allowed("http://127.0.0.1/v1"))

    def test_http_allowed_ipv4_loopback_root(self):
        self.assertTrue(_provider_url_is_allowed("http://127.0.0.1/"))

    def test_http_allowed_ipv4_loopback_host_case_irrelevant(self):
        self.assertTrue(_provider_url_is_allowed("http://LOCALHOST/v1"))

    def test_https_allowed_unicode_path(self):
        self.assertTrue(_provider_url_is_allowed("https://provider.example/v1/chat/completions"))

    def test_https_allowed_trailing_dot_host(self):
        self.assertTrue(_provider_url_is_allowed("https://provider.example./v1"))

    def test_https_allowed_punycode_host(self):
        self.assertTrue(_provider_url_is_allowed("https://xn--bcher-kva.example/v1"))

    def test_https_allowed_ipv4_loopback_literal(self):
        self.assertTrue(_provider_url_is_allowed("https://127.0.0.1/v1"))

    def test_reject_none_input(self):
        self.assertFalse(_provider_url_is_allowed(None))

    def test_reject_integer_input(self):
        self.assertFalse(_provider_url_is_allowed(123))

    def test_reject_empty_url(self):
        self.assertFalse(_provider_url_is_allowed(""))

    def test_reject_whitespace_url(self):
        self.assertFalse(_provider_url_is_allowed("   \t  "))

    def test_reject_newline_only_url(self):
        self.assertFalse(_provider_url_is_allowed("\n\t"))

    def test_reject_missing_scheme(self):
        self.assertFalse(_provider_url_is_allowed("provider.example/v1"))
