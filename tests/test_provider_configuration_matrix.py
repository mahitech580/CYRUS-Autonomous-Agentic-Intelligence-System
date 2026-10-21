"""Offline configuration-matrix tests for provider selection and timeout bounds."""
import unittest
from unittest.mock import patch

from providers import DeterministicProvider, OpenAICompatibleProvider, get_provider


BASE_ENV = {
    "CYRUS_LLM_PROVIDER": "auto",
    "CYRUS_LLM_API_KEY": "synthetic-test-key",
    "CYRUS_LLM_BASE_URL": "https://provider.example/v1",
    "CYRUS_LLM_MODEL": "synthetic-model",
    "CYRUS_LLM_TIMEOUT_SECONDS": "25",
}


def provider_with_env(**overrides):
    env = dict(BASE_ENV)
    env.update({key: str(value) for key, value in overrides.items()})
    with patch.dict("os.environ", env, clear=True):
        return get_provider()


class ProviderConfigurationMatrixTests(unittest.TestCase):
    """Verify offline/live selection and clamped provider timeout settings."""


    def test_no_api_key_uses_demo(self):
        self.assertIsInstance(provider_with_env(CYRUS_LLM_API_KEY=""), DeterministicProvider)

    def test_explicit_demo_mode_overrides_api_key(self):
        self.assertIsInstance(provider_with_env(CYRUS_LLM_PROVIDER="demo"), DeterministicProvider)

    def test_explicit_deterministic_mode_uses_demo(self):
        self.assertIsInstance(provider_with_env(CYRUS_LLM_PROVIDER="deterministic"), DeterministicProvider)

    def test_explicit_offline_mode_uses_demo(self):
        self.assertIsInstance(provider_with_env(CYRUS_LLM_PROVIDER="offline"), DeterministicProvider)

    def test_https_remote_endpoint_enables_live_provider(self):
        self.assertIsInstance(provider_with_env(), OpenAICompatibleProvider)

    def test_remote_http_endpoint_falls_back_to_demo(self):
        self.assertIsInstance(provider_with_env(CYRUS_LLM_BASE_URL="http://provider.example/v1"), DeterministicProvider)

    def test_endpoint_with_query_string_falls_back_to_demo(self):
        self.assertIsInstance(provider_with_env(CYRUS_LLM_BASE_URL="https://provider.example/v1?key=value"), DeterministicProvider)

    def test_endpoint_with_userinfo_falls_back_to_demo(self):
        self.assertIsInstance(provider_with_env(CYRUS_LLM_BASE_URL="https://user@provider.example/v1"), DeterministicProvider)

    def test_empty_model_falls_back_to_demo(self):
        self.assertIsInstance(provider_with_env(CYRUS_LLM_MODEL="  "), DeterministicProvider)

    def test_invalid_timeout_uses_default(self):
        self.assertEqual(provider_with_env(CYRUS_LLM_TIMEOUT_SECONDS="not-a-number").timeout_seconds, 25.0)


    def test_timeout_below_minimum_is_clamped_to_five_seconds(self):
        provider = provider_with_env(CYRUS_LLM_TIMEOUT_SECONDS="1")
        self.assertEqual(provider.timeout_seconds, 5.0)


    def test_timeout_above_maximum_is_clamped_to_sixty_seconds(self):
        provider = provider_with_env(CYRUS_LLM_TIMEOUT_SECONDS="120")
        self.assertEqual(provider.timeout_seconds, 60.0)


    def test_positive_infinity_timeout_is_clamped_to_sixty_seconds(self):
        provider = provider_with_env(CYRUS_LLM_TIMEOUT_SECONDS="inf")
        self.assertEqual(provider.timeout_seconds, 60.0)


    def test_negative_infinity_timeout_is_clamped_to_five_seconds(self):
        provider = provider_with_env(CYRUS_LLM_TIMEOUT_SECONDS="-inf")
        self.assertEqual(provider.timeout_seconds, 5.0)


    def test_nan_timeout_is_clamped_to_minimum(self):
        provider = provider_with_env(CYRUS_LLM_TIMEOUT_SECONDS="nan")
        self.assertEqual(provider.timeout_seconds, 5.0)
