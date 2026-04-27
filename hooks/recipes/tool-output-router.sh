#!/usr/bin/env bash
# Tool-output router — applies a per-tool output strategy from
# ~/.fulcrum/tool-output-policy.toml. Default: leave-as-is (never blanket-truncate).
#
# Tiers:
#   raw           — emit stdout unchanged
#   status-only   — emit `exit=<code>; <first stderr line or "ok">`
#   summary+head  — emit `exit=<code>; bytes=<N>; lines=<M>; --- head ---\n<first N lines>`
#   summary+file  — write full stdout to ~/.fulcrum/state/<project>/<tool>-<ts>.out;
#                   emit summary + file path + head
#   file-only     — write full stdout to file; emit only `exit + bytes + path`
#   leave-as-is   — no-op (default)
#
# Hook event: PostToolUse (Claude/Codex), AfterTool (Gemini), tool.execute.after
# (OpenCode), tool_result (Pi).

set -euo pipefail

POLICY="${FULCRUM_POLICY:-$HOME/.fulcrum/tool-output-policy.toml}"
HEAD_LINES="${FULCRUM_HEAD_LINES:-20}"
DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
PROJECT=$(basename "$DIR")
STATE="$HOME/.fulcrum/state/$PROJECT"
mkdir -p "$STATE"

[ -f "$POLICY" ] || exit 0
command -v jq >/dev/null || exit 0
command -v yq >/dev/null || exit 0

payload=$(cat)
tool=$(jq -r '.tool_name // empty' <<<"$payload")
[ -z "$tool" ] && exit 0

# For Bash, derive the leaf tool from the command's first non-flag token.
if [ "$tool" = "Bash" ]; then
  cmd=$(jq -r '.tool_input.command // empty' <<<"$payload")
  tool=$(printf '%s' "$cmd" | awk '{for(i=1;i<=NF;i++) if($i!~/^-/){print $i;exit}}' | xargs basename 2>/dev/null || echo "$tool")
fi

stdout=$(jq -r '.tool_response.stdout // .tool_response.output // ""' <<<"$payload")
stderr=$(jq -r '.tool_response.stderr // ""' <<<"$payload")
exit_code=$(jq -r '.tool_response.exit_code // .tool_response.returncode // 0' <<<"$payload")
bytes=${#stdout}

# Resolve policy: per-tool entry → profile lookup → default.
policy_for() {
  local t="$1"
  yq -p toml -o json '.tools["'"$t"'"] // .default // {"tier":"leave-as-is"}' "$POLICY" 2>/dev/null
}
profile_for() {
  local p="$1"
  yq -p toml -o json '.profiles["'"$p"'"] // {}' "$POLICY" 2>/dev/null
}

policy=$(policy_for "$tool")
profile_name=$(jq -r '.profile // empty' <<<"$policy")
if [ -n "$profile_name" ]; then
  merged=$(jq -s '.[0] * .[1]' <(profile_for "$profile_name") <(printf '%s' "$policy"))
else
  merged="$policy"
fi

tier=$(jq -r '
  .tier
  // (if (.threshold_bytes // null) != null and ('"$bytes"' > .threshold_bytes)
       then .tier_over else .tier_under end)
  // "leave-as-is"
' <<<"$merged")

emit_head() { printf '%s' "$stdout" | head -n "$HEAD_LINES"; }
write_file() {
  local f="$STATE/$tool-$(date +%s).out"
  printf '%s' "$stdout" > "$f"
  printf '%s' "$f"
}

case "$tier" in
  raw)          printf '%s' "$stdout" ;;
  status-only)  first_stderr=$(printf '%s' "$stderr" | head -n1)
                printf 'exit=%s %s\n' "$exit_code" "${first_stderr:-ok}" ;;
  summary+head) lines=$(printf '%s' "$stdout" | wc -l | tr -d ' ')
                printf 'exit=%s bytes=%s lines=%s\n--- head ---\n' "$exit_code" "$bytes" "$lines"
                emit_head ;;
  summary+file) f=$(write_file)
                lines=$(printf '%s' "$stdout" | wc -l | tr -d ' ')
                printf 'exit=%s bytes=%s lines=%s file=%s\n--- head ---\n' "$exit_code" "$bytes" "$lines" "$f"
                emit_head ;;
  file-only)    f=$(write_file)
                printf 'exit=%s bytes=%s file=%s\n' "$exit_code" "$bytes" "$f" ;;
  leave-as-is|*) printf '%s' "$stdout" ;;
esac

exit 0
