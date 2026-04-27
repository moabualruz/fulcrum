#!/usr/bin/env bash
# Lint gate — block the next agent turn if the just-edited file has lint errors.
# Hook event: PostToolUse · matcher Write|Edit (Claude/Codex), AfterTool (Gemini),
# tool.execute.after (OpenCode), tool_result (Pi).
# Exit 2 with stderr feeds the lint output back so the next turn fixes it.
# Skips files for languages without a configured linter — fail-open.
set -euo pipefail
FILE=$(jq -r '.tool_input.file_path // empty' 2>/dev/null || true)
[ -z "$FILE" ] || [ ! -f "$FILE" ] && exit 0

run_or_skip() {
  command -v "$1" >/dev/null || exit 0
  if ! "$@" >&2; then
    echo "lint-gate: violations in $FILE — fix before continuing" >&2
    exit 2
  fi
}

case "$FILE" in
  *.py)                  run_or_skip ruff check --quiet "$FILE" ;;
  *.ts|*.tsx|*.js|*.jsx) command -v biome >/dev/null && run_or_skip biome check "$FILE" ;;
  *.go)                  command -v golangci-lint >/dev/null && run_or_skip golangci-lint run "$FILE" ;;
  *.rs)                  : ;;  # cargo clippy is project-scoped, not file-scoped
esac
exit 0
