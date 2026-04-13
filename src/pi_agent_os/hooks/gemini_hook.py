"""
Gemini CLI BeforeTool hook.

Gemini CLI calls this script before each tool execution, passing a JSON
blob on stdin. Mirrors the Claude hook logic via handle_hook().

Register via gemini-extension.json:
    "hooks": { "BeforeTool": { "command": "python -m pi_agent_os.hooks.gemini_hook" } }
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

    # Gemini BeforeTool event shape differs from Claude's — normalise it.
    normalised = {
        "session_id": event.get("session_id", event.get("conversationId", "unknown")),
        "hook_event_name": "PreToolUse",
        "tool_name": event.get("tool_name", event.get("toolName", "")),
        "tool_input": event.get("tool_input", event.get("toolInput", event.get("args", {}))),
    }

    exit_code, message = handle_hook(normalised)
    if message:
        print(message, file=sys.stderr)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
