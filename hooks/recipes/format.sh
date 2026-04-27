#!/usr/bin/env bash
# Auto-format on edit — runs language-appropriate formatter on the just-edited file.
# Hook event: PostToolUse · matcher Write|Edit (Claude/Codex), AfterTool (Gemini),
# tool.execute.after (OpenCode), tool_result (Pi).
# Idempotent, non-blocking, never speaks to the model.
set -euo pipefail
FILE=$(jq -r '.tool_input.file_path // empty' 2>/dev/null || true)
[ -z "$FILE" ] || [ ! -f "$FILE" ] && exit 0
case "$FILE" in
  *.py)                              command -v ruff       >/dev/null && ruff format "$FILE"     >&2 2>/dev/null || true ;;
  *.ts|*.tsx|*.js|*.jsx|*.json|*.md) command -v biome      >/dev/null && biome format --write "$FILE" >&2 2>/dev/null || \
                                     command -v prettier   >/dev/null && prettier --write "$FILE" >&2 2>/dev/null || true ;;
  *.go)                              command -v gofmt      >/dev/null && gofmt -w "$FILE"        >&2 2>/dev/null || true ;;
  *.rs)                              command -v rustfmt    >/dev/null && rustfmt "$FILE"         >&2 2>/dev/null || true ;;
  *.java)                            command -v google-java-format >/dev/null && google-java-format --replace "$FILE" >&2 2>/dev/null || true ;;
  *.kt|*.kts)                        command -v ktlint     >/dev/null && ktlint --format "$FILE" >&2 2>/dev/null || true ;;
  *.dart)                            command -v dart       >/dev/null && dart format "$FILE"     >&2 2>/dev/null || true ;;
esac
exit 0
