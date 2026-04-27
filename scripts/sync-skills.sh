#!/usr/bin/env bash
# Fulcrum sync-skills — mirror skills/<name>/SKILL.md to every agent's skills path.
# Idempotent. Re-run after authoring or editing any SKILL.md.
#
# Targets:
#   - Claude Code  → ~/.claude/skills/<name>/SKILL.md
#   - Codex CLI    → ~/.codex/skills/<name>/SKILL.md
#   - OpenCode     → ~/.config/opencode/skills/<name>/SKILL.md
#   - Pi CLI       → ~/.pi/agent/skills/<name>/SKILL.md
#   - Gemini CLI   → ~/.gemini/extensions/fulcrum-skills/{gemini-extension.json, skills/<name>/SKILL.md}
#                    (Gemini requires skills inside an extension manifest)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_SRC="$REPO_DIR/skills"

if [ ! -d "$SKILLS_SRC" ]; then
  echo "fulcrum sync-skills: no skills/ directory in $REPO_DIR" >&2
  exit 1
fi

shopt -s nullglob

# Collect skill dirs (anything with a SKILL.md, excluding _template).
mapfile -t SKILLS < <(
  for d in "$SKILLS_SRC"/*/; do
    name="$(basename "$d")"
    [ "$name" = "_template" ] && continue
    [ -f "$d/SKILL.md" ] || continue
    printf '%s\n' "$name"
  done
)

if [ ${#SKILLS[@]} -eq 0 ]; then
  echo "fulcrum sync-skills: no skills authored yet (skills/<name>/SKILL.md not found)"
  exit 0
fi

echo "fulcrum sync-skills — ${#SKILLS[@]} skill(s): ${SKILLS[*]}"
echo

# ── flat-directory agents ───────────────────────────────────────────────
TARGETS=(
  "$HOME/.claude/skills|Claude Code"
  "$HOME/.codex/skills|Codex CLI"
  "$HOME/.config/opencode/skills|OpenCode"
  "$HOME/.pi/agent/skills|Pi CLI"
)

for entry in "${TARGETS[@]}"; do
  target="${entry%%|*}"
  label="${entry##*|}"
  parent="$(dirname "$target")"
  if [ ! -d "$parent" ] && [ ! -d "$target" ]; then
    echo "· skip $label (parent $parent not present)"
    continue
  fi
  echo "→ $label  ($target)"
  mkdir -p "$target"
  for name in "${SKILLS[@]}"; do
    mkdir -p "$target/$name"
    cp "$SKILLS_SRC/$name/SKILL.md" "$target/$name/SKILL.md"
    # Copy any sibling files (resources, scripts).
    find "$SKILLS_SRC/$name" -mindepth 1 -maxdepth 1 ! -name SKILL.md -exec cp -R {} "$target/$name/" \; 2>/dev/null || true
    echo "    $name"
  done
  echo
done

# ── Gemini — extension manifest wrapper ────────────────────────────────
GEMINI_EXT="$HOME/.gemini/extensions/fulcrum-skills"
if [ -d "$HOME/.gemini" ] || [ -d "$HOME/.gemini/extensions" ]; then
  echo "→ Gemini CLI  ($GEMINI_EXT)"
  mkdir -p "$GEMINI_EXT/skills"
  cat > "$GEMINI_EXT/gemini-extension.json" <<EOF
{
  "name": "fulcrum-skills",
  "version": "0.1.0",
  "description": "Fulcrum-authored skills for Gemini CLI."
}
EOF
  for name in "${SKILLS[@]}"; do
    mkdir -p "$GEMINI_EXT/skills/$name"
    cp "$SKILLS_SRC/$name/SKILL.md" "$GEMINI_EXT/skills/$name/SKILL.md"
    find "$SKILLS_SRC/$name" -mindepth 1 -maxdepth 1 ! -name SKILL.md -exec cp -R {} "$GEMINI_EXT/skills/$name/" \; 2>/dev/null || true
    echo "    $name"
  done
  echo
else
  echo "· skip Gemini (~/.gemini not present)"
fi

echo "Done."
