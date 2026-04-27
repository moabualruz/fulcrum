#!/usr/bin/env bash
# Fulcrum sync-skills — mirror canonical Claude Code skills to other agent paths.
# Run AFTER scripts/install.sh has populated ~/.claude/skills/.
# Idempotent: safe to re-run after editing any SKILL.md.
#
# Targets covered (agents that take SKILL.md natively in a flat directory):
#   - Codex CLI      → ~/.codex/skills/<name>/SKILL.md
#   - OpenCode       → ~/.config/opencode/skills/<name>/SKILL.md
#   - Pi CLI         → ~/.pi/agent/skills/<name>/SKILL.md
#
# Targets NOT covered (require extension/plugin wrapper — deferred):
#   - Gemini CLI     (skills must live inside an extension manifest)
#   - Pi memory.ts   (TypeScript extension that bridges to shell hooks)
#
# When plugins/extensions are ready, add their target paths here.

set -euo pipefail

CANONICAL="$HOME/.claude/skills"
if [ ! -d "$CANONICAL" ]; then
  echo "error: $CANONICAL not found. Run scripts/install.sh first." >&2
  exit 1
fi

TARGETS=(
  "$HOME/.codex/skills"
  "$HOME/.config/opencode/skills"
  "$HOME/.pi/agent/skills"
)

echo "Fulcrum sync-skills — canonical: $CANONICAL"
echo

for target in "${TARGETS[@]}"; do
  echo "→ $target"
  mkdir -p "$target"
  for skill_dir in "$CANONICAL"/*/; do
    name=$(basename "$skill_dir")
    mkdir -p "$target/$name"
    cp "$skill_dir/SKILL.md" "$target/$name/SKILL.md"
    echo "     $name"
  done
  echo
done

echo "Skipped (require extension wrapper — deferred):"
echo "  - ~/.gemini/extensions/fulcrum-skills/  (Gemini extension manifest needed)"
echo "  - ~/.pi/agent/extensions/memory.ts      (Pi TS bridge needed)"
echo
echo "Done."
