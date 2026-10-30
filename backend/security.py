"""Small, conservative redaction helpers for persisted workflow text."""
from __future__ import annotations

import re


_ASSIGNMENT = re.compile(
    r"(?i)\b((?:[A-Z0-9_]*_)?(?:api[_-]?key|access[_-]?key|database[_-]?url|"
    r"connection[_-]?string|client[_-]?secret|refresh[_-]?token|password|passwd|"
    r"secret|token|authorization))(\s*[:=]\s*)(?:(?:Bearer)\s+)?[^\s,;\"']+"
)
_BEARER = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{4,}")
_PROVIDER_KEYS = re.compile(
    r"\b(?:sk-[A-Za-z0-9_-]{12,}|rk-[A-Za-z0-9_-]{12,}|"
    r"gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|"
    r"AKIA[0-9A-Z]{16})\b"
)
_URL_CREDENTIALS = re.compile(r"(?i)(https?://)[^/@\s:]+:[^/@\s]+@")
_QUERY_SECRETS = re.compile(
    r"(?i)([?&](?:api_key|access_token|refresh_token|token|secret|password)=)[^&#\s]+"
)


def redact_sensitive_text(value: object, *, max_length: int = 1800) -> str:
    """Mask common credentials before text is written to run records or logs.

    This is a defense-in-depth filter, not a secret scanner. Callers should still
    keep provider credentials out of prompts and user-visible artifacts.
    """
    text = str(value or "")
    text = _ASSIGNMENT.sub(r"\1\2[REDACTED]", text)
    text = _BEARER.sub("Bearer [REDACTED]", text)
    text = _PROVIDER_KEYS.sub("[REDACTED_KEY]", text)
    text = _URL_CREDENTIALS.sub(r"\1[REDACTED]@", text)
    text = _QUERY_SECRETS.sub(r"\1[REDACTED]", text)
    return text[:max(0, max_length)]
