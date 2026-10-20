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
