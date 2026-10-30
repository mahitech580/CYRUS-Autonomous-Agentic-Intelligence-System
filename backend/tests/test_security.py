from security import redact_sensitive_text


def test_redacts_bearer_and_named_secret_assignments():
    text = "Authorization: Bearer abc.def-123 OPENAI_API_KEY=sk-proj-12345678901234567890"
    result = redact_sensitive_text(text)
    assert "abc.def-123" not in result
    assert "sk-proj-12345678901234567890" not in result
    assert "Authorization: [REDACTED]" in result
    assert "OPENAI_API_KEY=[REDACTED]" in result


def test_redacts_common_provider_and_cloud_key_shapes():
    text = "keys sk-12345678901234567890 ghp_abcdefghijklmnopqrstuvwxyz123456 AKIA1234567890ABCDEF"
    result = redact_sensitive_text(text)
    assert "sk-12345678901234567890" not in result
    assert "ghp_abcdefghijklmnopqrstuvwxyz123456" not in result
    assert "AKIA1234567890ABCDEF" not in result
    assert result.count("[REDACTED_KEY]") == 3


def test_redacts_url_credentials_and_query_parameters():
    text = "postgresql://worker:super-secret@db.example.test/app?token=private-value"
    result = redact_sensitive_text(text)
    assert "worker:super-secret" not in result
    assert "private-value" not in result
    assert "[REDACTED]@" in result
    assert "token=[REDACTED]" in result


def test_preserves_normal_text_and_respects_output_limit():
    assert redact_sensitive_text("ordinary workflow failure") == "ordinary workflow failure"
    assert redact_sensitive_text("abcdef", max_length=3) == "abc"


def test_redacts_quoted_json_and_yaml_secret_values():
    text = '{"api_key":"json-api-secret","password": "json-password", "Authorization": "Bearer json-bearer-secret"} client_secret: ' + "'yaml-client-secret'"
    result = redact_sensitive_text(text)
    for secret in ("json-api-secret", "json-password", "json-bearer-secret", "yaml-client-secret"):
        assert secret not in result
    assert '"api_key":"[REDACTED]"' in result
    assert '"password": "[REDACTED]"' in result


def test_redacts_additional_payment_chat_package_and_cloud_tokens():
    text = " ".join([
        "sk_live_1234567890abcdef", "rk_test_1234567890abcdef",
        "xoxb-1234567890-abcdefghijkl", "npm_123456789012345678901234",
        "pypi-123456789012345678901234", "AIza12345678901234567890123456789012",
        "ASIA1234567890ABCDEF",
    ])
    result = redact_sensitive_text(text)
    for token in text.split():
        assert token not in result
    assert result.count("[REDACTED_KEY]") == 7
