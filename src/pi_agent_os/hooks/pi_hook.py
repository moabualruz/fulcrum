"""
PI BeforeTool hook.

PI calls this script before each tool execution, passing a JSON blob on stdin.
Mirrors the Claude/Gemini hook logic via handle_hook().

Register via pi-os.extension.json:
    "hooks": { "BeforeTool": { "command": "python -m pi_agent_os.hooks.pi_hook" } }

PI's BeforeTool event shape:
    {
      "sessionId": "...",
      "toolName": "...",
      "toolInput": {...},
      "role": "implementer",
      "runId": "run_..."
    }
"""
from __future__ import annotations

import json
import sys

from .claude_hook import handle_hook


def main() -> None:
    raw = sys.stdin.read().strip()
    if not raw:
        sys.exit(0)
        return

    try:
        event = json.loads(raw)
    except json.JSONDecodeError:
        sys.exit(0)
        return

    # Normalise PI's BeforeTool event shape to the canonical hook shape.
    normalised = {
        "session_id": event.get("sessionId", event.get("session_id", "unknown")),
        "hook_event_name": "PreToolUse",
        "tool_name": event.get("toolName", event.get("tool_name", "")),
        "tool_input": event.get("toolInput", event.get("tool_input", event.get("args", {}))),
        # PI-specific extras passed through for richer policy decisions
        "role": event.get("role", ""),
        "run_id": event.get("runId", event.get("run_id", "")),
    }

    exit_code, message = handle_hook(normalised)
    if message:
        print(message, file=sys.stderr)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
