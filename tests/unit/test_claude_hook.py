"""Tests for Claude PreToolUse hook logic."""
from unittest.mock import patch, MagicMock


ALLOW_EVENT = {
    "session_id": "sess-001",
    "hook_event_name": "PreToolUse",
    "tool_name": "Bash",
    "tool_input": {"command": "ls -la"},
}

DENY_EVENT = {
    "session_id": "sess-001",
    "hook_event_name": "PreToolUse",
    "tool_name": "Bash",
    "tool_input": {"command": "rm -rf /"},
}


def test_allow_returns_zero():
    with patch("pi_agent_os.hooks.claude_hook._policy_check") as mock_check, \
         patch("pi_agent_os.hooks.claude_hook._log_event"):
        mock_check.return_value = MagicMock(allowed=True, reason="")
        from pi_agent_os.hooks.claude_hook import handle_hook
        code, msg = handle_hook(ALLOW_EVENT)
    assert code == 0
    assert msg == ""


def test_deny_returns_two():
    with patch("pi_agent_os.hooks.claude_hook._policy_check") as mock_check, \
         patch("pi_agent_os.hooks.claude_hook._log_event"):
        mock_check.return_value = MagicMock(allowed=False, reason="Dangerous command blocked")
        from pi_agent_os.hooks.claude_hook import handle_hook
        code, msg = handle_hook(DENY_EVENT)
    assert code == 2
    assert "Dangerous command blocked" in msg


def test_mcp_tool_call_is_allowed():
    event = {
        "session_id": "sess-001",
        "tool_name": "mcp__pi-os__create_task",
        "tool_input": {"title": "fix bug", "project_id": "p1", "workspace_id": "w1"},
    }
    with patch("pi_agent_os.hooks.claude_hook._policy_check") as mock_check, \
         patch("pi_agent_os.hooks.claude_hook._log_event"):
        mock_check.return_value = MagicMock(allowed=True, reason="")
        from pi_agent_os.hooks.claude_hook import handle_hook
        code, _ = handle_hook(event)
    assert code == 0


def test_log_event_called():
    with patch("pi_agent_os.hooks.claude_hook._policy_check") as mock_check, \
         patch("pi_agent_os.hooks.claude_hook._log_event") as mock_log:
        mock_check.return_value = MagicMock(allowed=True, reason="")
        from pi_agent_os.hooks.claude_hook import handle_hook
        handle_hook(ALLOW_EVENT)
    mock_log.assert_called_once()


def test_empty_stdin_exits_zero(capsys):
    """Empty input should silently exit 0 (don't block Claude)."""
    import sys
    from io import StringIO
    from unittest.mock import patch as p
    with p("sys.stdin", StringIO("")), p("sys.exit") as mock_exit:
        from pi_agent_os.hooks.claude_hook import main
        main()
    mock_exit.assert_called_once_with(0)
