"""Tests for PI BeforeTool hook logic."""
import json
import sys
from io import StringIO
from unittest.mock import patch, MagicMock


PI_ALLOW_EVENT = {
    "sessionId": "pi-sess-001",
    "toolName": "read_file",
    "toolInput": {"path": "src/main.py"},
    "role": "implementer",
    "runId": "run_abc123",
}

PI_DENY_EVENT = {
    "sessionId": "pi-sess-001",
    "toolName": "bash",
    "toolInput": {"command": "rm -rf /"},
    "role": "implementer",
    "runId": "run_abc123",
}


def test_pi_hook_normalises_camel_case():
    """PI camelCase event fields get normalised to canonical hook shape."""
    with patch("pi_agent_os.hooks.pi_hook.handle_hook") as mock_handle:
        mock_handle.return_value = (0, "")
        with patch("sys.stdin", StringIO(json.dumps(PI_ALLOW_EVENT))), \
             patch("sys.exit"):
            from pi_agent_os.hooks.pi_hook import main
            main()
    call_args = mock_handle.call_args[0][0]
    assert call_args["session_id"] == "pi-sess-001"
    assert call_args["tool_name"] == "read_file"
    assert call_args["tool_input"] == {"path": "src/main.py"}
    assert call_args["role"] == "implementer"
    assert call_args["run_id"] == "run_abc123"


def test_pi_hook_allow_exits_zero():
    with patch("pi_agent_os.hooks.pi_hook.handle_hook") as mock_handle, \
         patch("sys.stdin", StringIO(json.dumps(PI_ALLOW_EVENT))), \
         patch("sys.exit") as mock_exit:
        mock_handle.return_value = (0, "")
        from pi_agent_os.hooks.pi_hook import main
        main()
    mock_exit.assert_called_once_with(0)


def test_pi_hook_deny_exits_two():
    with patch("pi_agent_os.hooks.pi_hook.handle_hook") as mock_handle, \
         patch("sys.stdin", StringIO(json.dumps(PI_DENY_EVENT))), \
         patch("sys.exit") as mock_exit:
        mock_handle.return_value = (2, "blocked: dangerous command")
        from pi_agent_os.hooks.pi_hook import main
        main()
    mock_exit.assert_called_once_with(2)


def test_pi_hook_empty_stdin_exits_zero():
    with patch("sys.stdin", StringIO("")), \
         patch("sys.exit") as mock_exit:
        from pi_agent_os.hooks.pi_hook import main
        main()
    mock_exit.assert_called_once_with(0)


def test_pi_hook_invalid_json_exits_zero():
    with patch("sys.stdin", StringIO("not json {")), \
         patch("sys.exit") as mock_exit:
        from pi_agent_os.hooks.pi_hook import main
        main()
    mock_exit.assert_called_once_with(0)


def test_pi_hook_snake_case_fallback():
    """PI can also send snake_case fields — hook handles both."""
    snake_event = {
        "session_id": "pi-sess-002",
        "tool_name": "write_file",
        "tool_input": {"path": "out.txt", "content": "hello"},
        "role": "tester",
        "run_id": "run_xyz",
    }
    with patch("pi_agent_os.hooks.pi_hook.handle_hook") as mock_handle:
        mock_handle.return_value = (0, "")
        with patch("sys.stdin", StringIO(json.dumps(snake_event))), \
             patch("sys.exit"):
            from pi_agent_os.hooks.pi_hook import main
            main()
    call_args = mock_handle.call_args[0][0]
    assert call_args["session_id"] == "pi-sess-002"
    assert call_args["tool_name"] == "write_file"
    assert call_args["run_id"] == "run_xyz"
