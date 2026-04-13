"""
Claude Code PreToolUse hook.

Claude Code runs this script before every tool execution, passing a JSON
blob on stdin describing the tool call. This script:

  - Logs the call to the pi-agent-os event store
  - Runs a policy check (secret guard, deny rules)
  - Exits 0 → Claude proceeds
  - Exits 2 → Claude receives stderr as an error and does NOT run the tool

Register in ~/.claude/settings.json:

    {
      "hooks": {
        "PreToolUse": [{
          "matcher": "*",
          "hooks": [{
            "type": "command",
            "command": "python -m pi_agent_os.hooks.claude_hook"
          }]
        }]
      }
    }
"""
from __future__ import annotations

import json
import logging
import sys

log = logging.getLogger(__name__)


def _log_event(tool_name: str, tool_input: dict, session_id: str) -> None:
    """Log the tool call to the event store (best-effort)."""
    try:
        from ..events.store import emit
        from ..models.events import EventType
        emit(
            EventType.task_created,
            None,           # workspace_id
            "agent",        # actor_type
            f"claude/{session_id[:8]}",  # actor_id
            payload={
                "tool_name": tool_name,
                "tool_input_keys": list(tool_input.keys()),
                "session_id": session_id,
            },
            project_id=None,
            object_type="tool_call",
            object_id=None,
        )
    except Exception as exc:
        log.debug("Event log unavailable: %s", exc)


def _policy_check(tool_name: str, tool_input: dict) -> object:
    """Run the policy engine on this tool call."""
    try:
        from ..policy.engine import check as engine_check
        return engine_check(
            action=f"tool_use:{tool_name}",
            resource=tool_name,
            actor_id="claude",
            workspace_id="",
            actor_type="agent",
            extra=tool_input,
        )
    except Exception as exc:
        log.debug("Policy engine unavailable: %s", exc)

        class _Allow:
            allowed = True
            reason = ""

        return _Allow()


def handle_hook(event: dict) -> tuple[int, str]:
    """
    Process a PreToolUse event.

    Returns (exit_code, message):
      (0, "")    → allow
      (2, msg)   → deny, msg goes to stderr → Claude sees it as tool error
    """
    tool_name = event.get("tool_name", "")
    tool_input = event.get("tool_input", {})
    session_id = event.get("session_id", "unknown")

    _log_event(tool_name, tool_input, session_id)

    result = _policy_check(tool_name, tool_input)
    if not result.allowed:
        return 2, f"[pi-os policy] Tool call denied: {result.reason}"

    return 0, ""


def main() -> None:
    """Entry point: read JSON from stdin, decide, exit with code."""
    raw = sys.stdin.read().strip()
    if not raw:
        sys.exit(0)
        return

    try:
        event = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"[pi-os hook] Failed to parse hook event: {exc}", file=sys.stderr)
        sys.exit(0)  # Don't block Claude on parse errors
        return

    exit_code, message = handle_hook(event)
    if message:
        print(message, file=sys.stderr)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
