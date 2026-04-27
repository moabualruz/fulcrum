#!/usr/bin/env bash
# Fulcrum eval-skill-claude — wrap Anthropic's skill-creator run_loop.py to
# measure a skill's trigger rate on Claude Code. Claude-Code-only by design;
# no equivalent harness exists for Codex/Gemini/OpenCode/Pi.
#
# Usage:
#   scripts/eval-skill-claude.sh <skill-name> [--queries FILE]
#
# Expects:
#   - skill-creator installed at ~/.claude/plugins/marketplaces/.../skill-creator/
#   - claude CLI on PATH
#   - python3 with the skill-creator scripts importable
#   - skills/<skill-name>/SKILL.md present
#   - eval queries at evals/<skill-name>.jsonl (10+ trigger + anti-trigger
#     prompts) or pass --queries explicitly.

set -euo pipefail

SKILL="${1:-}"
[ -n "$SKILL" ] || { echo "usage: $0 <skill-name> [--queries FILE]" >&2; exit 2; }
shift || true

QUERIES=""
while [ $# -gt 0 ]; do
  case "$1" in
    --queries) QUERIES="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_DIR="$REPO_DIR/skills/$SKILL"
[ -f "$SKILL_DIR/SKILL.md" ] || { echo "no such skill: $SKILL_DIR/SKILL.md" >&2; exit 1; }

if [ -z "$QUERIES" ]; then
  QUERIES="$REPO_DIR/evals/$SKILL.jsonl"
fi
[ -f "$QUERIES" ] || { echo "no eval queries at $QUERIES — write 10+ trigger + anti-trigger prompts (one JSON per line: {\"prompt\":\"…\",\"should_trigger\":true})" >&2; exit 1; }

# Locate skill-creator.
CREATOR_DIR=$(find "$HOME/.claude/plugins" -type d -name skill-creator 2>/dev/null | head -n1)
if [ -z "$CREATOR_DIR" ]; then
  echo "skill-creator not found under ~/.claude/plugins — install via /plugin install skill-creator" >&2
  exit 1
fi

if [ ! -d "$CREATOR_DIR/scripts" ]; then
  echo "skill-creator at $CREATOR_DIR has no scripts/ — version mismatch?" >&2
  exit 1
fi

echo "Evaluating skill '$SKILL' against $QUERIES"
echo "Using harness: $CREATOR_DIR/scripts"

cd "$CREATOR_DIR"
python3 -m scripts.run_loop \
  --eval-set "$QUERIES" \
  --skill-path "$SKILL_DIR/SKILL.md" \
  --max-iterations 1 \
  --no-modify "$@"
