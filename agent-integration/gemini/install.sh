#!/usr/bin/env bash
# Installs the PI Agent OS Gemini CLI extension.
# Run from the pi-stack-plan repo root: bash agent-integration/gemini/install.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GEMINI_EXT_DIR="$HOME/.gemini/extensions/pi-os"

echo "==> Installing PI Agent OS Gemini extension"

# 1. Create extension directory
mkdir -p "$GEMINI_EXT_DIR"

# 2. Copy extension manifest
cp "$SCRIPT_DIR/gemini-extension.json" "$GEMINI_EXT_DIR/gemini-extension.json"
echo "    Wrote $GEMINI_EXT_DIR/gemini-extension.json"

# 3. Copy GEMINI.md to both extension dir and project root
cp "$SCRIPT_DIR/GEMINI.md" "$GEMINI_EXT_DIR/GEMINI.md"
cp "$SCRIPT_DIR/GEMINI.md" "$REPO_ROOT/GEMINI.md"
echo "    Wrote GEMINI.md to extension dir and project root"

echo ""
echo "==> Done. Gemini CLI will now:"
echo "    - Load PI Agent OS MCP tools as mcp_pi-os_*"
echo "    - Route tool calls through BeforeTool hook"
echo "    - Inject GEMINI.md rules in every session"
echo ""
echo "    First-time: run 'gemini' once interactively to complete OAuth"
