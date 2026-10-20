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

    def test_reject_relative_path(self):
        self.assertFalse(_provider_url_is_allowed("/v1/chat/completions"))

    def test_reject_ftp_scheme(self):
        self.assertFalse(_provider_url_is_allowed("ftp://provider.example/v1"))

    def test_reject_file_scheme(self):
        self.assertFalse(_provider_url_is_allowed("file:///tmp/provider.json"))

    def test_reject_data_scheme(self):
        self.assertFalse(_provider_url_is_allowed("data:text/plain,provider"))

    def test_reject_websocket_scheme(self):
        self.assertFalse(_provider_url_is_allowed("ws://provider.example/v1"))

    def test_reject_secure_websocket_scheme(self):
        self.assertFalse(_provider_url_is_allowed("wss://provider.example/v1"))

    def test_reject_mailto_scheme(self):
        self.assertFalse(_provider_url_is_allowed("mailto:ops@example.com"))

    def test_reject_https_empty_hostname(self):
        self.assertFalse(_provider_url_is_allowed("https:///v1"))

    def test_reject_http_empty_hostname(self):
        self.assertFalse(_provider_url_is_allowed("http:///v1"))

    def test_reject_http_remote_domain(self):
        self.assertFalse(_provider_url_is_allowed("http://provider.example/v1"))

    def test_reject_http_public_ipv4(self):
        self.assertFalse(_provider_url_is_allowed("http://8.8.8.8/v1"))

    def test_reject_http_private_10_range(self):
        self.assertFalse(_provider_url_is_allowed("http://10.0.0.1/v1"))

    def test_reject_http_private_192_168_range(self):
        self.assertFalse(_provider_url_is_allowed("http://192.168.1.20/v1"))

    def test_reject_http_private_172_16_range(self):
        self.assertFalse(_provider_url_is_allowed("http://172.16.0.1/v1"))

    def test_reject_http_private_172_31_range(self):
        self.assertFalse(_provider_url_is_allowed("http://172.31.255.254/v1"))

    def test_reject_http_link_local_ipv4(self):
        self.assertFalse(_provider_url_is_allowed("http://169.254.10.20/v1"))

    def test_reject_http_global_ipv6(self):
        self.assertFalse(_provider_url_is_allowed("http://[2001:4860:4860::8888]/v1"))

    def test_reject_http_unique_local_ipv6(self):
        self.assertFalse(_provider_url_is_allowed("http://[fc00::1]/v1"))

    def test_reject_http_link_local_ipv6(self):
        self.assertFalse(_provider_url_is_allowed("http://[fe80::1]/v1"))

    def test_reject_localhost_lookalike_domain(self):
        self.assertFalse(_provider_url_is_allowed("http://localhost.evil/v1"))

    def test_reject_localhost_hyphen_suffix(self):
        self.assertFalse(_provider_url_is_allowed("http://localhost-attacker.example/v1"))

    def test_reject_localhost_nested_suffix(self):
        self.assertFalse(_provider_url_is_allowed("http://localhost.attacker.example/v1"))

    def test_reject_loopback_ip_lookalike_domain(self):
        self.assertFalse(_provider_url_is_allowed("http://127.0.0.1.attacker.example/v1"))

    def test_reject_localhost_trailing_dot(self):
        self.assertFalse(_provider_url_is_allowed("http://localhost./v1"))

    def test_reject_subdomain_localhost_suffix(self):
        self.assertFalse(_provider_url_is_allowed("http://foo.localhost/v1"))

    def test_reject_non_numeric_port(self):
        self.assertFalse(_provider_url_is_allowed("https://provider.example:bad/v1"))

    def test_reject_out_of_range_port(self):
        self.assertFalse(_provider_url_is_allowed("https://provider.example:99999/v1"))

    def test_reject_malformed_ipv6_bracket(self):
        self.assertFalse(_provider_url_is_allowed("http://[::1/v1"))

    def test_reject_url_username(self):
        self.assertFalse(_provider_url_is_allowed("https://user@provider.example/v1"))

    def test_reject_url_username_and_password(self):
        self.assertFalse(_provider_url_is_allowed("https://user:pass@provider.example/v1"))

    def test_reject_percent_encoded_userinfo(self):
        self.assertFalse(_provider_url_is_allowed("https://%75ser@provider.example/v1"))

    def test_reject_query_api_key(self):
        self.assertFalse(_provider_url_is_allowed("https://provider.example/v1?api_key=not-for-urls"))

    def test_reject_query_access_token(self):
        self.assertFalse(_provider_url_is_allowed("https://provider.example/v1?access_token=not-for-urls"))

    def test_reject_fragment(self):
        self.assertFalse(_provider_url_is_allowed("https://provider.example/v1#credentials"))

    def test_reject_gopher_scheme(self):
        self.assertFalse(_provider_url_is_allowed("gopher://provider.example/v1"))

    def test_reject_https_empty_host_with_query(self):
        self.assertFalse(_provider_url_is_allowed("https://?missing-host=1"))

    def test_reject_encoded_localhost_lookalike(self):
        self.assertFalse(_provider_url_is_allowed("http://localhost%2eattacker.example/v1"))

    def test_reject_integer_encoded_loopback(self):
        self.assertFalse(_provider_url_is_allowed("http://2130706433/v1"))

    def test_reject_short_ipv4_loopback_form(self):
        self.assertFalse(_provider_url_is_allowed("http://127.1/v1"))

    def test_redacts_api_key_assignment(self):
        result = _redact_provider_error_detail("api_key=matrix-api-key-secret-080")
        self.assertNotIn("matrix-api-key-secret-080", result)
        self.assertIn("[redacted", result.lower())

    def test_redacts_access_token_assignment(self):
        result = _redact_provider_error_detail("access_token: matrix-access-token-secret-081")
        self.assertNotIn("matrix-access-token-secret-081", result)
        self.assertIn("[redacted", result.lower())

    def test_redacts_refresh_token_assignment(self):
        result = _redact_provider_error_detail("refresh_token=matrix-refresh-token-secret-082")
        self.assertNotIn("matrix-refresh-token-secret-082", result)
        self.assertIn("[redacted", result.lower())

    def test_redacts_client_secret_assignment(self):
        result = _redact_provider_error_detail("client_secret=matrix-client-secret-083")
        self.assertNotIn("matrix-client-secret-083", result)
        self.assertIn("[redacted", result.lower())

    def test_redacts_token_assignment(self):
        result = _redact_provider_error_detail("token=matrix-token-secret-084")
        self.assertNotIn("matrix-token-secret-084", result)
        self.assertIn("[redacted", result.lower())

    def test_redacts_generic_secret_assignment(self):
        result = _redact_provider_error_detail("secret=matrix-generic-secret-085")
        self.assertNotIn("matrix-generic-secret-085", result)
        self.assertIn("[redacted", result.lower())

    def test_redacts_password_assignment(self):
        result = _redact_provider_error_detail("password=matrix-password-secret-086")
        self.assertNotIn("matrix-password-secret-086", result)
        self.assertIn("[redacted", result.lower())

    def test_redacts_credential_assignment(self):
        result = _redact_provider_error_detail("credential=matrix-credential-secret-087")
        self.assertNotIn("matrix-credential-secret-087", result)
        self.assertIn("[redacted", result.lower())
