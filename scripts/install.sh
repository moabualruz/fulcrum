#!/usr/bin/env bash
# Fulcrum installer — copies hooks from this repo into the local user paths.
# Idempotent: safe to re-run after edits to refresh installed copies.
#
# What this DOES:
#   - Copies hooks/*.sh to ~/.fulcrum/hooks/ and chmods +x
#   - Creates ~/.fulcrum/state/
#   - Prints the JSON snippet to add to ~/.claude/settings.json (does NOT modify it)
#
# What this DOES NOT do:
#   - Modify ~/.claude/settings.json (manual review — print snippet at the end)
#   - Install plugins or extensions (deferred per design)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Fulcrum install — source: $REPO_DIR"
echo

# 1. Hooks
echo "1/2  Copying hooks → ~/.fulcrum/hooks/"
mkdir -p "$HOME/.fulcrum/hooks" "$HOME/.fulcrum/state"
cp "$REPO_DIR/hooks/"*.sh "$HOME/.fulcrum/hooks/"
chmod +x "$HOME/.fulcrum/hooks/"*.sh
echo "     installed: $(ls "$HOME/.fulcrum/hooks/" | tr '\n' ' ')"
echo

# 2. Settings snippet (printed only — DO NOT auto-merge)
echo "2/2  Settings registration"
echo
echo "Add this to ~/.claude/settings.json (merge with existing 'hooks' if present):"
echo
cat <<'EOF'
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
EOF
echo
echo "Done. Re-run this script after editing hooks/ to refresh installed copies."
