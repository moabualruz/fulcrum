#!/usr/bin/env bash
# Installs the PI Agent OS Claude integration.
# Run from the pi-stack-plan repo root: bash agent-integration/claude/install.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
PROJECT_CLAUDE_DIR="$REPO_ROOT/.claude"

echo "==> Installing PI Agent OS Claude integration"

# 1. Copy CLAUDE.md to project-level .claude/
mkdir -p "$PROJECT_CLAUDE_DIR"
cp "$SCRIPT_DIR/CLAUDE.md" "$PROJECT_CLAUDE_DIR/CLAUDE.md"
echo "    Wrote $PROJECT_CLAUDE_DIR/CLAUDE.md"

# 2. Copy .mcp.json to project root (project-scoped MCP)
cp "$SCRIPT_DIR/.mcp.json" "$REPO_ROOT/.mcp.json"
echo "    Wrote $REPO_ROOT/.mcp.json"

# 3. Merge hooks into ~/.claude/settings.json
if [ ! -f "$CLAUDE_SETTINGS" ]; then
  mkdir -p "$(dirname "$CLAUDE_SETTINGS")"
  echo "{}" > "$CLAUDE_SETTINGS"
fi

python3 - "$SCRIPT_DIR/settings-hooks-snippet.json" "$CLAUDE_SETTINGS" <<'PYEOF'
import json, sys
from pathlib import Path

snippet_path = sys.argv[1]
settings_path = Path(sys.argv[2])

with open(settings_path) as f:
    settings = json.load(f)

with open(snippet_path) as f:
    snippet = json.load(f)

# Merge PreToolUse hooks — remove any existing pi-os entry, then add ours
hooks = settings.setdefault("hooks", {})
existing = hooks.setdefault("PreToolUse", [])
pi_os_hook = snippet["hooks"]["PreToolUse"][0]

existing[:] = [
    h for h in existing
    if not any(
        "pi_agent_os.hooks" in cmd.get("command", "")
        for cmd in h.get("hooks", [])
    )
]
existing.append(pi_os_hook)

with open(settings_path, "w") as f:
    json.dump(settings, f, indent=2)
print(f"    Merged hooks into {settings_path}")
PYEOF

echo ""
echo "==> Done. Claude will now:"
echo "    - See PI Agent OS tools as mcp__pi-os__*"
echo "    - Route all tool calls through the pi-os policy engine"
echo "    - Inject CLAUDE.md rules from .claude/CLAUDE.md"
