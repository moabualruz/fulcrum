#!/usr/bin/env bash
# Fulcrum installer — copies hooks + rules into per-agent locations.
# Idempotent: safe to re-run.
#
# What this DOES:
#   - Copies hooks/*.sh to ~/.fulcrum/hooks/ and chmods +x
#   - Copies rules/AGENTS.md into every detected agent's primary rules location
#   - Creates ~/.fulcrum/state/
#   - Prints per-agent hook-registration snippets (does NOT modify agent configs)
#
# What this DOES NOT do:
#   - Modify any agent's settings.json / config.toml / plugins (manual review)
#   - Install plugins or extensions (deferred per design)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Fulcrum install — source: $REPO_DIR"
echo

# 1. Hooks (universal bash, shared across all agents)
echo "1/3  Copying hooks → ~/.fulcrum/hooks/"
mkdir -p "$HOME/.fulcrum/hooks" "$HOME/.fulcrum/state"
cp "$REPO_DIR/hooks/"*.sh "$HOME/.fulcrum/hooks/"
chmod +x "$HOME/.fulcrum/hooks/"*.sh
echo "     installed: $(ls "$HOME/.fulcrum/hooks/" | tr '\n' ' ')"
echo

# 2. Rules — one body, multiple destinations.
echo "2/3  Copying rules → per-agent paths"
RULES="$REPO_DIR/rules/AGENTS.md"

declare -a TARGETS=(
  "$HOME/.claude/CLAUDE.md|Claude Code"
  "$HOME/.codex/AGENTS.md|Codex CLI"
  "$HOME/.config/opencode/AGENTS.md|OpenCode"
  "$HOME/.pi/agent/AGENTS.md|Pi CLI"
  "$HOME/AGENTS.md|Gemini CLI source (referenced via @AGENTS.md in ~/.gemini/GEMINI.md)"
)

for entry in "${TARGETS[@]}"; do
  path="${entry%%|*}"
  label="${entry##*|}"
  if [ -d "$(dirname "$path")" ] || [ -f "$path" ]; then
    mkdir -p "$(dirname "$path")"
    cp "$RULES" "$path"
    echo "     ✓ $label → $path"
  else
    echo "     · skip $label (parent dir not present)"
  fi
done

# Gemini import shim — only if ~/.gemini/ exists
if [ -d "$HOME/.gemini" ]; then
  if [ ! -f "$HOME/.gemini/GEMINI.md" ] || ! grep -q '@AGENTS.md' "$HOME/.gemini/GEMINI.md" 2>/dev/null; then
    echo "@AGENTS.md" >> "$HOME/.gemini/GEMINI.md"
    echo "     ✓ Gemini GEMINI.md updated with @AGENTS.md import"
  fi
fi
echo

# 3. Print per-agent registration snippets.
echo "3/3  Hook registration — copy into each agent's config"
echo

cat <<'EOF'
─── Claude Code  →  ~/.claude/settings.json ───
{
  "hooks": {
    "SessionStart": [
      {"hooks": [{"type": "command", "command": "~/.fulcrum/hooks/index-check.sh"}]}
    ],
    "Stop": [
      {"hooks": [{"type": "command", "command": "~/.fulcrum/hooks/index-rebuild.sh"}]}
    ]
  }
}

─── Codex CLI  →  ~/.codex/hooks.json ───
{
  "hooks": {
    "SessionStart": [
      {"hooks": [{"type": "command", "command": "~/.fulcrum/hooks/index-check.sh"}]}
    ],
    "Stop": [
      {"hooks": [{"type": "command", "command": "~/.fulcrum/hooks/index-rebuild.sh"}]}
    ]
  }
}

─── Gemini CLI  →  ~/.gemini/settings.json ───
{
  "hooks": {
    "SessionStart": [{"type": "command", "command": "~/.fulcrum/hooks/index-check.sh"}],
    "SessionEnd":   [{"type": "command", "command": "~/.fulcrum/hooks/index-rebuild.sh"}]
  }
}

─── OpenCode  →  ~/.config/opencode/plugins/fulcrum.ts ───
export const FulcrumPlugin = async ({ $ }) => ({
  "session.created": async () => { await $`~/.fulcrum/hooks/index-check.sh` },
  "session.idle":    async () => { await $`~/.fulcrum/hooks/index-rebuild.sh` }
})

─── Pi CLI  →  ~/.pi/agent/extensions/index.ts ───
import { execSync } from "child_process"
pi.on("session_start",    () => execSync("~/.fulcrum/hooks/index-check.sh"))
pi.on("session_shutdown", () => execSync("~/.fulcrum/hooks/index-rebuild.sh"))

EOF

echo "Done. Re-run after editing hooks/ or rules/AGENTS.md to refresh installed copies."
