"""Tests for the policy engine and secret guard."""
import pytest
from pi_agent_os.db.connection import init_db
from pi_agent_os.agent_home import configure_agent_home, init_agent_home
from pi_agent_os.policy.engine import PolicyEngine, PolicyCheckRequest, PolicyDeniedError, check, require
from pi_agent_os.policy.secret_guard import scan, redact, contains_secret, guard_artifact
from pi_agent_os.ids import generate_id, WS_PREFIX


@pytest.fixture
def env(tmp_path):
    configure_agent_home(tmp_path / "agent-home")
    init_agent_home(tmp_path / "agent-home")
    init_db(tmp_path / "state.db")
    return tmp_path


def test_default_allow(env):
    """Default policy is allow (spec §21.1)."""
    result = check(
        action="tool_call",
        resource="read_file",
        actor_id="agent_1",
        workspace_id=generate_id(WS_PREFIX),
    )
    assert result.allowed


def test_deny_rule_blocks_execution(env):
    """A deny rule prevents execution (spec §21.5)."""
    import json
    from datetime import datetime, timezone
    from pi_agent_os.db import connection as db

    ws_id = generate_id(WS_PREFIX)
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        """INSERT INTO policy_rules (id, scope, scope_id, name, description, action, matchers, enabled, priority, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, 10, ?, ?)""",
        (
            "pol_deny_shell",
            "workspace", ws_id,
            "Deny shell exec", "",
            "deny",
            json.dumps([{"type": "command", "pattern": "rm *"}]),
            now, now,
        ),
    )

    # "command" matcher checks resource — "rm -rf /tmp/test" matches "rm *"
    result = check(
        action="shell_exec",
        resource="rm -rf /tmp/test",
        actor_id="agent_1",
        workspace_id=ws_id,
    )
    assert not result.allowed  # resource matches "rm *" glob pattern

    # A non-matching resource is still allowed
    result2 = check(
        action="shell_exec",
        resource="echo hello",
        actor_id="agent_1",
        workspace_id=ws_id,
    )
    assert result2.allowed  # "echo hello" does not match "rm *"


def test_require_raises_on_deny(env):
    """require() raises PolicyDeniedError when denied."""
    import json
    from datetime import datetime, timezone
    from pi_agent_os.db import connection as db

    ws_id = generate_id(WS_PREFIX)
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        """INSERT INTO policy_rules (id, scope, scope_id, name, description, action, matchers, enabled, priority, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, 10, ?, ?)""",
        (
            "pol_deny_etc",
            "workspace", ws_id,
            "Block /etc writes", "",
            "deny",
            json.dumps([{"type": "path", "pattern": "/etc/*"}]),
            now, now,
        ),
    )

    with pytest.raises(PolicyDeniedError):
        require(
            action="file_write",
            resource="/etc/passwd",
            actor_id="agent_1",
            workspace_id=ws_id,
        )


def test_audit_only_rule_allows_but_logs(env):
    """audit_only action allows execution but logs the event."""
    import json
    from datetime import datetime, timezone
    from pi_agent_os.db import connection as db

    ws_id = generate_id(WS_PREFIX)
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        """INSERT INTO policy_rules (id, scope, scope_id, name, description, action, matchers, enabled, priority, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, 5, ?, ?)""",
        (
            "pol_audit_net",
            "workspace", ws_id,
            "Audit network calls", "",
            "audit_only",
            json.dumps([{"type": "domain_network", "pattern": "*.external.com"}]),
            now, now,
        ),
    )

    result = check(
        action="network_request",
        resource="api.external.com",
        actor_id="agent_1",
        workspace_id=ws_id,
    )
    assert result.allowed  # audit_only still allows
    assert result.audit_only


def test_secret_scan_detects_api_key():
    text = 'config = {"api_key": "sk-abcdefghijklmnopqrstuvwxyz123456"}'
    findings = scan(text)
    assert len(findings) > 0
    assert any(f["type"] == "api_key" for f in findings)


def test_secret_scan_detects_private_key():
    text = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"
    findings = scan(text)
    assert len(findings) > 0


def test_secret_redact():
    text = 'api_key = "sk-secret12345678901234567890"'
    redacted = redact(text)
    assert "[REDACTED]" in redacted
    assert "sk-secret" not in redacted


def test_secret_guard_artifact():
    content = "config:\n  password: mySecretP@ssw0rd123\n  host: localhost"
    guarded, was_redacted = guard_artifact(content)
    assert was_redacted
    assert "[REDACTED]" in guarded


def test_no_false_positive_on_normal_text():
    text = "The quick brown fox jumps over the lazy dog."
    assert not contains_secret(text)


def test_policy_events_logged(env):
    """Policy check events should be logged to policy_events table."""
    import json
    from datetime import datetime, timezone
    from pi_agent_os.db import connection as db

    ws_id = generate_id(WS_PREFIX)
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        """INSERT INTO policy_rules (id, scope, scope_id, name, description, action, matchers, enabled, priority, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, 10, ?, ?)""",
        (
            "pol_log_test",
            "workspace", ws_id,
            "Log test", "",
            "deny",
            json.dumps([{"type": "path", "pattern": "/secret/*"}]),
            now, now,
        ),
    )

    check(action="file_write", resource="/secret/key.pem", actor_id="agent_x", workspace_id=ws_id)

    events = db.fetchall("SELECT * FROM policy_events WHERE actor_id=?", ("agent_x",))
    assert len(events) > 0
