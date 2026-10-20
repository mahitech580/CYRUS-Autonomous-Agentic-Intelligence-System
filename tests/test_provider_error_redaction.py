"""Regression coverage for credential scrubbing in third-party provider errors."""
import unittest

from providers import _redact_provider_error_detail


class ProviderErrorRedactionTests(unittest.TestCase):
    def assert_redacted(self, detail, secret):
        result = _redact_provider_error_detail(detail)
        self.assertNotIn(secret, result)
        self.assertIn("[redacted]", result)

    def test_redacts_json_authorization_bearer_value(self):
        secret = "example-authorization-secret"
        self.assert_redacted('{"authorization": "Bearer ' + secret + '"}', secret)

    def test_redacts_quoted_json_api_key_value(self):
        secret = "example-api-key-value"
        self.assert_redacted('{"api_key": "' + secret + '"}', secret)

    def test_redacts_plain_authorization_header(self):
        secret = "plain-header-secret"
        self.assert_redacted("Authorization: Bearer " + secret, secret)

    def test_redacts_inline_bearer_value(self):
        secret = "inline-bearer-secret"
        self.assert_redacted("Request failed with Bearer " + secret, secret)

    def test_redacts_access_token_in_query_string(self):
        secret = "query-access-token-secret"
        self.assert_redacted("https://provider.example/error?access_token=" + secret + "&retry=1", secret)

    def test_redacts_client_secret_assignment(self):
        secret = "client-secret-value"
        self.assert_redacted("client_secret=" + secret, secret)

    def test_redacts_openai_style_key(self):
        secret = "sk-" + ("a" * 28)
        result = _redact_provider_error_detail("provider rejected " + secret)
        self.assertNotIn(secret, result)
        self.assertIn("[redacted-api-key]", result)

    def test_redacts_aws_access_key_pattern(self):
        secret = "AKIA" + ("A" * 16)
        result = _redact_provider_error_detail("provider returned " + secret)
        self.assertNotIn(secret, result)
        self.assertIn("[redacted-access-key]", result)

    def test_redacts_private_key_block(self):
        secret = "private-key-material-line"
        detail = "begin -----BEGIN PRIVATE KEY-----\n" + secret + "\n-----END PRIVATE KEY----- end"
        result = _redact_provider_error_detail(detail)
        self.assertNotIn(secret, result)
        self.assertIn("[redacted-private-key-block]", result)

    def test_preserves_safe_diagnostic_context(self):
        detail = '{"error":"rate limited","retry_after":15}'
        self.assertEqual(_redact_provider_error_detail(detail), detail)

    def test_caps_output_length(self):
        result = _redact_provider_error_detail("x" * 1200)
        self.assertEqual(len(result), 350)

    def test_handles_missing_detail(self):
        self.assertEqual(_redact_provider_error_detail(None), "")


if __name__ == "__main__":
    unittest.main()
