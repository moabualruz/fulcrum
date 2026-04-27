#!/usr/bin/env bash
# Fulcrum eval-skill-claude — wrap Anthropic's skill-creator run_loop.py to
# measure a skill's trigger rate on Claude Code. Claude-Code-only by design.
#
# Usage:
#   scripts/eval-skill-claude.sh <skill-name> [--queries FILE] [--model NAME]
#
# Eval set format (JSON array, default at evals/<skill>.json):
#   [
#     {"query": "how do I select fields from a JSON file", "should_trigger": true},
#     {"query": "how do I select cells in a CSV",          "should_trigger": false},
#     ...
#   ]
#
# Flags surfaced from skill-creator's run_loop.py (verified 2026-04-27):
#   --eval-set FILE          required (JSON array)
#   --skill-path DIR         required (skill DIRECTORY, not the .md)
#   --model NAME             required ("claude-opus-4-7", "claude-sonnet-4-6", etc.)
#   --max-iterations N       default 5; pass 1 to measure once without rewriting
#   --runs-per-query N       default 3
#   --holdout FRAC           default 0.4 (set 0 to disable train/test split)
#   --report PATH|auto|none  default "auto" (HTML report at temp file)
#   --results-dir DIR        save results.json + report.html + log.txt
# Set FULCRUM_EVAL_MAX_ITER=N to override --max-iterations.

set -euo pipefail

SKILL="${1:-}"
[ -n "$SKILL" ] || { echo "usage: $0 <skill-name> [--queries FILE] [--model NAME]" >&2; exit 2; }
shift || true

QUERIES=""
MODEL="${FULCRUM_EVAL_MODEL:-claude-opus-4-7}"
MAX_ITER="${FULCRUM_EVAL_MAX_ITER:-1}"
EXTRA_ARGS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --queries) QUERIES="$2"; shift 2 ;;
    --model)   MODEL="$2";   shift 2 ;;
    *)         EXTRA_ARGS+=("$1"); shift ;;
  esac
done

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_DIR="$REPO_DIR/skills/$SKILL"
[ -f "$SKILL_DIR/SKILL.md" ] || { echo "no such skill: $SKILL_DIR/SKILL.md" >&2; exit 1; }

[ -z "$QUERIES" ] && QUERIES="$REPO_DIR/evals/$SKILL.json"
if [ ! -f "$QUERIES" ]; then
  echo "no eval queries at $QUERIES" >&2
  echo "create a JSON array (10+ entries):" >&2
  echo '  [{"query":"…","should_trigger":true}, {"query":"…","should_trigger":false}, …]' >&2
  exit 1
fi

# Locate skill-creator. Plugins now live under ~/.claude/plugins/cache/...
CREATOR_DIR=$(find "$HOME/.claude/plugins" -type d -name skill-creator 2>/dev/null \
  | grep -E '/skills/skill-creator$' | head -n1)
if [ -z "$CREATOR_DIR" ] || [ ! -f "$CREATOR_DIR/scripts/run_loop.py" ]; then
  echo "skill-creator not found. Install via:  /plugin install skill-creator" >&2
  echo "Looked under: $HOME/.claude/plugins (need scripts/run_loop.py inside)" >&2
  exit 1
fi

# Resolve a Python 3.10+ — skill-creator uses PEP-604 `X | Y` type syntax.
PY="${FULCRUM_PYTHON:-}"
if [ -z "$PY" ]; then
  for cand in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$cand" >/dev/null 2>&1; then
      v=$("$cand" -c 'import sys; print(sys.version_info >= (3,10))' 2>/dev/null)
      [ "$v" = "True" ] && PY="$cand" && break
    fi
  done
fi
if [ -z "$PY" ]; then
  cat >&2 <<EOF
fulcrum: no Python 3.10+ found on PATH.
skill-creator's run_loop.py uses 'str | None' syntax (PEP 604) which needs 3.10+.
macOS ships 3.9 by default. Install one of:
  brew install python@3.12
  mise use -g python@3.12
Or set FULCRUM_PYTHON=/full/path/to/python3.12 and re-run.
EOF
  exit 1
fi

echo "Evaluating '$SKILL' against $QUERIES (model=$MODEL, max-iterations=$MAX_ITER)"
echo "Harness: $CREATOR_DIR/scripts/run_loop.py"
echo "Python : $($PY --version) ($(command -v $PY))"
echo

cd "$CREATOR_DIR"
"$PY" -m scripts.run_loop \
  --eval-set "$QUERIES" \
  --skill-path "$SKILL_DIR" \
  --model "$MODEL" \
  --max-iterations "$MAX_ITER" \
  --verbose \
  "${EXTRA_ARGS[@]}"
