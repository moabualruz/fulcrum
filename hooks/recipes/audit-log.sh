#!/usr/bin/env bash
# Audit log — agent-neutral forensic trail of shell commands run by any agent.
# Hook event: PostToolUse · matcher Bash (Claude/Codex), AfterTool (Gemini),
# tool.execute.after (OpenCode), tool_result with shell-tool name (Pi).
#
# Logs to ~/.fulcrum/state/<project>/shell-commands.log
#   ISO-8601\tcommand\texit_code
# Write-only, never blocks. To inspect:
#   tail ~/.fulcrum/state/$(basename "$PWD")/shell-commands.log

set -euo pipefail
CMD=$(jq -r '.tool_input.command // empty' 2>/dev/null || true)
[ -z "$CMD" ] && exit 0
EXIT=$(jq -r '.tool_response.exit_code // .tool_response.returncode // 0' 2>/dev/null || echo 0)
DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
PROJECT=$(basename "$DIR")
LOG_DIR="$HOME/.fulcrum/state/$PROJECT"
mkdir -p "$LOG_DIR"
printf '%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$CMD" "$EXIT" >> "$LOG_DIR/shell-commands.log"
exit 0
