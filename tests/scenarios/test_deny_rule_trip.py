"""Golden scenario: deny-rule trip. Spec §25.3 scenario 7."""
import pytest
import json
from datetime import datetime, timezone
from pi_agent_os.db.connection import init_db
from pi_agent_os.agent_home import configure_agent_home, init_agent_home
from pi_agent_os.ids import generate_id, WS_PREFIX
from pi_agent_os.policy.engine import check, require, PolicyDeniedError
from pi_agent_os.policy.secret_guard import scan, redact, contains_secret
from pi_agent_os.db import connection as db


@pytest.fixture
def env(tmp_path):
    configure_agent_home(tmp_path / "agent-home")
    init_agent_home(tmp_path / "agent-home")
    init_db(tmp_path / "state.db")
    return tmp_path


def _add_deny_rule(rule_id: str, name: str, matchers: list, scope_id: str | None = None) -> None:
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        """INSERT INTO policy_rules (id, scope, scope_id, name, description, action, matchers, enabled, priority, created_at, updated_at)
           VALUES (?, 'system', ?, ?, '', 'deny', ?, 1, 10, ?, ?)""",
        (rule_id, scope_id, name, json.dumps(matchers), now, now),
    )


def test_deny_filesystem_write_outside_project(env):
    """No writes outside project root."""
    ws_id = generate_id(WS_PREFIX)
    _add_deny_rule("deny_etc", "Block /etc writes", [{"type": "path", "pattern": "/etc/*"}])

    result = check(action="file_write", resource="/etc/passwd", actor_id="agent_1", workspace_id=ws_id)
    assert not result.allowed
    assert result.rule_id == "deny_etc"


def test_allow_writes_inside_project(env):
    """Writes inside project root should be allowed (no matching deny rule)."""
    ws_id = generate_id(WS_PREFIX)
    _add_deny_rule("deny_etc2", "Block /etc writes", [{"type": "path", "pattern": "/etc/*"}])

    result = check(action="file_write", resource="/home/user/myproject/src/main.py", actor_id="agent_1", workspace_id=ws_id)
    assert result.allowed


def test_deny_dangerous_shell_command(env):
    """Block dangerous shell commands."""
    ws_id = generate_id(WS_PREFIX)
    _add_deny_rule("deny_danger", "Block dangerous commands", [
        {"type": "command", "pattern": "rm -rf *"},
    ])

    result = check(action="shell_exec", resource="rm -rf /home", actor_id="agent_1", workspace_id=ws_id)
    assert not result.allowed


def test_deny_network_to_untrusted_domain(env):
    """Block network calls to untrusted domains."""
    ws_id = generate_id(WS_PREFIX)
    _add_deny_rule("deny_net", "Block external domains", [
        {"type": "domain_network", "pattern": "*.malicious.example.com"},
    ])

    result = check(action="network_request", resource="api.malicious.example.com", actor_id="agent_1", workspace_id=ws_id)
    assert not result.allowed


def test_policy_denied_error_raised_by_require(env):
    """require() raises exception when policy is denied."""
    ws_id = generate_id(WS_PREFIX)
    _add_deny_rule("deny_req", "Block /secrets path", [{"type": "path", "pattern": "/secrets/*"}])

    with pytest.raises(PolicyDeniedError) as exc_info:
        require(action="file_read", resource="/secrets/api_keys.yaml", actor_id="agent_1", workspace_id=ws_id)
    assert "deny_req" in str(exc_info.value) or "policy" in str(exc_info.value).lower()


def test_secret_in_content_blocked_by_guard():
    """Secret guard detects and redacts secrets before they escape."""
    secret_content = """
    config:
      database_password: SuperSecret@123456
      api_key: "sk-abcdefghijklmnopqrstuvwxyz123456"
    """
    assert contains_secret(secret_content)

    redacted = redact(secret_content)
    assert "[REDACTED]" in redacted
    assert "SuperSecret@123456" not in redacted


def test_policy_events_recorded_for_deny(env):
    """All deny events are recorded in policy_events for audit."""
    ws_id = generate_id(WS_PREFIX)
    _add_deny_rule("deny_audit", "Block test resource", [{"type": "tool", "pattern": "danger_tool"}])

    check(action="tool_call", resource="danger_tool", actor_id="audited_agent", workspace_id=ws_id)

    events = db.fetchall("SELECT * FROM policy_events WHERE actor_id='audited_agent'")
    assert len(events) > 0
    assert events[0]["action_taken"] == "deny"
