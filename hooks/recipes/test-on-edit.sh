#!/usr/bin/env bash
# Test on edit — opt-in per-project. Reads .fulcrum/test-on-edit.toml in the repo;
# if no config, this hook does nothing.
#
# Config shape (top-level keys are glob patterns; values are commands; {file} is
# substituted with the edited file path):
#
#   "*.py"      = "pytest -x {file}"
#   "src/*.ts"  = "vitest run {file}"
#   "*.go"      = "go test ./$(dirname {file})/..."
#
# Output is written to /tmp/<project>-test-on-edit.log; the hook never blocks
# the agent.

set -euo pipefail
FILE=$(jq -r '.tool_input.file_path // empty' 2>/dev/null || true)
[ -z "$FILE" ] || [ ! -f "$FILE" ] && exit 0

DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
CFG="$DIR/.fulcrum/test-on-edit.toml"
[ -f "$CFG" ] || exit 0
command -v yq >/dev/null || exit 0  # silently skip if yq unavailable

# Find the first glob that matches the file (relative to repo root).
REL="${FILE#$DIR/}"
CMD=""
while IFS= read -r line; do
  [ -z "$line" ] && continue
  pat="${line%% =*}"
  pat="${pat#\"}"; pat="${pat%\"}"
  case "$REL" in
    $pat)
      raw=$(yq -p toml -o json '.["'"$pat"'"]' "$CFG" 2>/dev/null | tr -d '"')
      [ -n "$raw" ] && [ "$raw" != "null" ] && CMD="${raw//\{file\}/$REL}" && break ;;
  esac
done < <(yq -p toml -o props 'keys' "$CFG" 2>/dev/null | sed -n 's/^- //p')

[ -z "$CMD" ] && exit 0

LOG="/tmp/$(basename "$DIR")-test-on-edit.log"
nohup bash -lc "cd '$DIR' && $CMD" >"$LOG" 2>&1 &
exit 0
