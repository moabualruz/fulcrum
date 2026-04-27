#!/usr/bin/env bash
# Fulcrum SessionStart hook — derived synthesis per docs/memory.md §7.
# Stateless: no marker files, no last-session tracking. Reads authoritative sources.
# Emits JSON to stdout for Claude Code's SessionStart context injection.
set -euo pipefail

VAULT="${VAULT:-$HOME/vault}"
PROJECT=$(basename "$PWD")
CTX=""

# 1. Pull vault (best-effort, silent)
[ -d "$VAULT/.git" ] && git -C "$VAULT" pull --quiet --rebase 2>/dev/null || true

# 2. Working tree
if git rev-parse --git-dir >/dev/null 2>&1; then
  S=$(git status --short 2>/dev/null || true)
  [ -n "$S" ] && CTX+="## Working tree (uncommitted)"$'\n'"\`\`\`"$'\n'"${S}"$'\n'"\`\`\`"$'\n\n'
  R=$(git log -20 --oneline 2>/dev/null || true)
  [ -n "$R" ] && CTX+="## Recent commits (last 20)"$'\n'"\`\`\`"$'\n'"${R}"$'\n'"\`\`\`"$'\n\n'
fi

# 3. Recent ADRs (in-repo, mtime <7d)
if [ -d "docs/decisions" ]; then
  A=$(find docs/decisions -name "*.md" -type f -mtime -7 2>/dev/null | sort)
  if [ -n "$A" ]; then
    CTX+="## Recent ADRs (last 7 days)"$'\n'
    while IFS= read -r f; do CTX+="- $f"$'\n'; done <<< "$A"
    CTX+=$'\n'
  fi
fi

# 4. In-flight state
INFLIGHT="$VAULT/project-specific/$PROJECT/in-flight.md"
[ -f "$INFLIGHT" ] && CTX+="## In-flight state"$'\n'"$(cat "$INFLIGHT")"$'\n\n'

# 5. Cross-project vault index
if [ -d "$VAULT/cross-project" ]; then
  IDX=$(find "$VAULT/cross-project" -name "*.md" -type f 2>/dev/null | sort | sed "s|$VAULT/||")
  if [ -n "$IDX" ]; then
    CTX+="## Vault cross-project index"$'\n'
    while IFS= read -r f; do CTX+="- $f"$'\n'; done <<< "$IDX"
    CTX+=$'\n'
  fi
fi

# 6. Pending-global stale notice (>24h)
if [ -d "$VAULT/pending-global" ]; then
  STALE=$(find "$VAULT/pending-global" -name "*.md" -type f -mtime +1 2>/dev/null | wc -l | tr -d ' ')
  [ "$STALE" -gt 0 ] && CTX+="📬 ${STALE} pending-global items >24h old — \`/promote\` to review."$'\n\n'
fi

# 7. Substantive-without-wrap notice
MARKER="$HOME/.fulcrum/state/$PROJECT.last-stop"
WRAP="$HOME/.fulcrum/state/$PROJECT.last-wrap"
if [ -f "$MARKER" ] && { [ ! -f "$WRAP" ] || [ "$MARKER" -nt "$WRAP" ]; }; then
  CTX+="🪄 Previous session was substantive but \`/wrap\` was not run — consider \`/wrap\` to extract."$'\n\n'
fi

# 8. Open Plane issues assigned to me (best-effort — silent skip if endpoint unreachable)
PLANE_ENDPOINT="${PLANE_ENDPOINT:-$(cat "$HOME/.config/plane/endpoint" 2>/dev/null | grep -E '^PLANE_ENDPOINT=' | cut -d= -f2- || true)}"
PLANE_KEY_FILE="$HOME/.config/plane/key"
if [ -n "$PLANE_ENDPOINT" ] && [ -f "$PLANE_KEY_FILE" ]; then
  PLANE_OUT=$(xh --quiet --check-status GET "$PLANE_ENDPOINT/api/v1/my-issues/?project=$PROJECT&state=in_progress" \
    "x-api-key:$(cat "$PLANE_KEY_FILE")" 2>/dev/null || true)
  if [ -n "$PLANE_OUT" ]; then
    SUMMARY=$(echo "$PLANE_OUT" | jq -r '.results[]? | "- \(.id) \(.name)"' 2>/dev/null || true)
    [ -n "$SUMMARY" ] && CTX+="## Open Plane issues (in-progress)"$'\n'"${SUMMARY}"$'\n\n'
  fi
fi

# 9. Emit JSON for Claude Code (only if there is context)
if [ -n "$CTX" ]; then
  jq -n --arg c "$CTX" \
    '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
fi

exit 0
