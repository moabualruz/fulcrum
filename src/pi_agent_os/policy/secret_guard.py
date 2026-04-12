"""Secret detection and redaction. Spec §21.6."""
from __future__ import annotations
import re
from typing import Optional

# Common secret patterns
_SECRET_PATTERNS = [
    # Generic high-entropy strings that look like API keys
    # Handles both assignment (api_key = "value") and JSON ("api_key": "value")
    (re.compile(r'(?i)(api[_-]?key|apikey|api[_-]?secret|access[_-]?token|auth[_-]?token)["\']?\s*[=:]\s*["\']?([A-Za-z0-9_\-]{20,})["\']?'), "api_key"),
    # AWS
    (re.compile(r'(?i)AKIA[0-9A-Z]{16}'), "aws_access_key"),
    (re.compile(r'(?i)aws[_-]?secret[_-]?access[_-]?key\s*[=:]\s*["\']?([A-Za-z0-9/+=]{40})["\']?'), "aws_secret_key"),
    # GitHub
    (re.compile(r'ghp_[A-Za-z0-9]{36}'), "github_pat"),
    (re.compile(r'github_pat_[A-Za-z0-9_]{82}'), "github_pat_fine"),
    # Generic password fields
    (re.compile(r'(?i)(password|passwd|pwd)\s*[=:]\s*["\']?([^\s"\']{8,})["\']?'), "password"),
    # Private key headers
    (re.compile(r'-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----'), "private_key"),
    # Database URLs with credentials
    (re.compile(r'(?i)(mysql|postgresql|postgres|mongodb|redis)://[^:]+:[^@]+@'), "db_url_credentials"),
    # Slack tokens
    (re.compile(r'xox[baprs]-[0-9A-Za-z\-]+'), "slack_token"),
    # JWT tokens
    (re.compile(r'eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+'), "jwt_token"),
]

REDACTION_PLACEHOLDER = "[REDACTED]"


def scan(text: str) -> list[dict]:
    """Scan text for potential secrets. Returns list of findings."""
    findings = []
    for pattern, secret_type in _SECRET_PATTERNS:
        for match in pattern.finditer(text):
            findings.append({
                "type": secret_type,
                "span": match.span(),
                "preview": text[max(0, match.start()-10):match.end()][:60] + "...",
            })
    return findings


def redact(text: str) -> str:
    """Redact secrets from text. Returns sanitized version."""
    result = text
    for pattern, _ in _SECRET_PATTERNS:
        result = pattern.sub(REDACTION_PLACEHOLDER, result)
    return result


def contains_secret(text: str) -> bool:
    """Quick check: does the text contain a recognizable secret pattern?"""
    return bool(scan(text))


def guard_artifact(content: str, allow_in_artifact: bool = False) -> tuple[str, bool]:
    """
    Guard artifact content for secrets before writing/syncing.

    Returns (possibly_redacted_content, was_redacted).
    Per spec §21.6: no secret placement in artifacts by default.
    """
    if not allow_in_artifact and contains_secret(content):
        return redact(content), True
    return content, False


def guard_sync_payload(payload: dict) -> tuple[dict, list[str]]:
    """
    Guard a sync payload dict for secrets before sending to Plane.

    Returns (sanitized_payload, list_of_redacted_keys).
    Per spec §21.6: no secret sync to Plane.
    """
    redacted_keys = []
    sanitized = {}
    for k, v in payload.items():
        if isinstance(v, str) and contains_secret(v):
            sanitized[k] = REDACTION_PLACEHOLDER
            redacted_keys.append(k)
        else:
            sanitized[k] = v
    return sanitized, redacted_keys
