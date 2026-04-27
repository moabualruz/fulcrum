#!/usr/bin/env bash
# Package-manager policy — refuse `npm`/`yarn` when the repo declares pnpm or bun.
# Hook event: PreToolUse · matcher Bash (Claude/Codex), BeforeTool (Gemini),
# tool.execute.before (OpenCode), tool_call (Pi).
set -euo pipefail
CMD=$(jq -r '.tool_input.command // empty' 2>/dev/null || true)
[ -z "$CMD" ] && exit 0
DIR="${CLAUDE_PROJECT_DIR:-$PWD}"

deny() { echo "pm-policy: $1" >&2; exit 2; }

if [ -f "$DIR/pnpm-lock.yaml" ]; then
  [[ "$CMD" =~ (^|[[:space:]])npm[[:space:]]   ]] && deny "this repo uses pnpm — replace 'npm' with 'pnpm'"
  [[ "$CMD" =~ (^|[[:space:]])yarn[[:space:]]  ]] && deny "this repo uses pnpm — replace 'yarn' with 'pnpm'"
fi
if [ -f "$DIR/bun.lockb" ] || [ -f "$DIR/bun.lock" ]; then
  [[ "$CMD" =~ (^|[[:space:]])npm[[:space:]]   ]] && deny "this repo uses bun — replace 'npm' with 'bun'"
fi
if [ -f "$DIR/yarn.lock" ] && [ ! -f "$DIR/pnpm-lock.yaml" ]; then
  [[ "$CMD" =~ (^|[[:space:]])npm[[:space:]]   ]] && deny "this repo uses yarn — replace 'npm' with 'yarn'"
fi
exit 0
