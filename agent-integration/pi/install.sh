#!/usr/bin/env bash
# Installs the PI Agent OS PI extension.
# Run from the pi-stack-plan repo root: bash agent-integration/pi/install.sh
#
# What this does:
#   1. Copies pi-os.extension.json to the PI extensions directory
#   2. Copies PI.md to the project root for context injection
#   3. Verifies the MCP server is importable
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# PI looks for extensions in ~/.pi/extensions/ by default.
# Override with PI_EXTENSIONS_DIR env var.
PI_EXTENSIONS_DIR="${PI_EXTENSIONS_DIR:-$HOME/.pi/extensions}"

echo "==> Installing PI Agent OS PI extension"

# 1. Install extension manifest
mkdir -p "$PI_EXTENSIONS_DIR"
cp "$SCRIPT_DIR/pi-os.extension.json" "$PI_EXTENSIONS_DIR/pi-os.extension.json"
echo "    Wrote $PI_EXTENSIONS_DIR/pi-os.extension.json"

# 2. Copy PI.md to the project root for context injection
cp "$SCRIPT_DIR/PI.md" "$REPO_ROOT/PI.md"
echo "    Wrote $REPO_ROOT/PI.md"

# 3. Verify the MCP server is importable
echo "    Verifying MCP server..."
if python -c "from pi_agent_os.mcp.server import mcp; assert mcp is not None; print('    MCP server OK (pi-os)')" 2>/dev/null; then
    :
else
    echo "    WARNING: MCP server not importable — run 'uv sync' in $REPO_ROOT first"
fi

# 4. Verify the hook is importable
echo "    Verifying PI hook..."
if python -c "from pi_agent_os.hooks.pi_hook import main; print('    PI hook OK')" 2>/dev/null; then
    :
else
    echo "    WARNING: PI hook not importable — run 'uv sync' in $REPO_ROOT first"
fi

echo ""
echo "==> Done. PI will now:"
echo "    - See PI Agent OS tools as mcp__pi-os__* (13 tools)"
echo "    - Route all tool calls through the pi-os policy engine"
echo "    - Inject PI.md rules from $REPO_ROOT/PI.md"
echo ""
echo "    PI runtime integration — call these from PI itself (not the LLM):"
echo "      start_agent_run   → register a run at task start"
echo "      heartbeat_agent_run → keep-alive every ~30s"
echo "      complete_agent_run  → mark done with output summary"
echo "      block_agent_run     → mark blocked with reason"
echo "      build_cos_context   → inject world-state before CoS dispatch"
echo "      get_workspace_status → single-call status snapshot"
