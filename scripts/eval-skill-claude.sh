#!/usr/bin/env bash
# Fulcrum eval-skill-claude — measure a skill's trigger rate via the Claude
# Code CLI. Auth is handled by `claude` itself (OAuth via `claude login`,
# keychain on macOS, etc.) — no ANTHROPIC_API_KEY needed in the environment.
#
# Why not skill-creator's run_loop.py: that harness imports the Anthropic SDK
# and calls the API directly, which requires ANTHROPIC_API_KEY. Going through
# the `claude` CLI keeps the secret in the OS keychain and matches the agent's
# real-world execution path (skills loaded from ~/.claude/skills/...).
#
# Usage:
#   scripts/eval-skill-claude.sh <skill-name> [--queries FILE]
#                                              [--model NAME]
#                                              [--runs-per-query N]
#                                              [--results-dir DIR]
#                                              [--match-words "w1,w2,..."]
#
# Eval set format (JSON array, default at evals/<skill>.json):
#   [
#     {"query": "extract emails from this JSON file", "should_trigger": true},
#     {"query": "extract emails from this CSV file",  "should_trigger": false}
#   ]
#
# Trigger detection (in order):
#   1. The Claude response's JSON contains a Skill tool-use entry naming the
#      skill (definitive signal — the agent loaded the skill).
#   2. The response text mentions any of the match words (default: skill name +
#      first command in the SKILL.md Invocation block; override with
#      --match-words). This is a fallback heuristic; cross-check the saved
#      transcripts before drawing strong conclusions.
#
# Pass criteria (matches docs/skills.md §7):
#   - trigger rate ≥ 80% on should_trigger=true entries
#   - activation  ≤ 20% on should_trigger=false entries

set -euo pipefail

# Help / usage. Handle before treating $1 as a skill name.
case "${1:-}" in
  -h|--help|"")
    sed -n '2,32p' "$0" | sed 's/^# \?//'
    exit 0 ;;
esac

SKILL="$1"
shift

QUERIES=""
MODEL=""                              # default: claude's default model
RUNS=1                                # repeat each query N times for stability
RESULTS_DIR=""
EXTRA_MATCH=""                        # extra match words (comma-separated)

while [ $# -gt 0 ]; do
  case "$1" in
    --queries)         QUERIES="$2"; shift 2 ;;
    --model)           MODEL="$2"; shift 2 ;;
    --runs-per-query)  RUNS="$2"; shift 2 ;;
    --results-dir)     RESULTS_DIR="$2"; shift 2 ;;
    --match-words)     EXTRA_MATCH="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,40p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_DIR="$REPO_DIR/skills/$SKILL"
SKILL_FILE="$SKILL_DIR/SKILL.md"
[ -f "$SKILL_FILE" ] || { echo "no such skill: $SKILL_FILE" >&2; exit 1; }

[ -z "$QUERIES" ] && QUERIES="$REPO_DIR/evals/$SKILL.json"
[ -f "$QUERIES" ] || { echo "no eval queries at $QUERIES" >&2; exit 1; }

command -v claude >/dev/null 2>&1 || {
  echo "fulcrum: \`claude\` CLI not on PATH. Install Claude Code." >&2
  exit 1
}
command -v jq >/dev/null 2>&1 || { echo "fulcrum: jq required" >&2; exit 1; }

# Derive match words from the skill itself.
#   1. frontmatter `name:`
#   2. every distinct top-level command inside fenced code blocks within the
#      `## Invocation` section (top-level = first non-comment word of a line
#      that doesn't start with whitespace; env-assignments like FOO=bar are skipped)
#   3. every distinct command immediately after a `|` pipe in the Invocation block
#   4. anything passed via --match-words
SKILL_NAME=$(awk -F': *' '/^name:/{print $2; exit}' "$SKILL_FILE" | tr -d '"')

INVOCATION_BLOCK=$(awk '
  /^## Invocation/ { in_inv=1; next }
  in_inv && /^## / { in_inv=0; next }
  in_inv { print }
' "$SKILL_FILE")

# Top-level commands inside fenced code blocks.
TOP_CMDS=$(echo "$INVOCATION_BLOCK" | awk '
  /^```/ { in_code = !in_code; next }
  in_code {
    line = $0
    if (line ~ /^[ \t]*#/) next        # skip comment-only line
    n = split(line, a, /[ \t]+/)
    if (n == 0) next
    cmd = a[1]
    gsub(/[`"<>]/, "", cmd)
    if (cmd ~ /=/) next                 # skip env-assignments (FOO=bar yq ...)
    if (cmd !~ /^[a-zA-Z]/) next        # skip $vars, brackets, etc.
    if (!seen[cmd]++) print cmd
  }
')

# Commands appearing after a `|` pipe inside fenced code blocks.
PIPE_CMDS=$(echo "$INVOCATION_BLOCK" | awk '
  /^```/ { in_code = !in_code; next }
  in_code {
    rest = $0
    while (match(rest, /\|[ \t]*[a-zA-Z][a-zA-Z0-9_.-]*/)) {
      tok = substr(rest, RSTART, RLENGTH)
      sub(/^\|[ \t]*/, "", tok)
      if (!seen[tok]++) print tok
      rest = substr(rest, RSTART + RLENGTH)
    }
  }
')

MATCH_LIST="$SKILL_NAME"
for cmd in $TOP_CMDS $PIPE_CMDS; do
  case ",$MATCH_LIST," in
    *",$cmd,"*) ;;
    *) MATCH_LIST="$MATCH_LIST,$cmd" ;;
  esac
done
if [ -n "$EXTRA_MATCH" ]; then
  MATCH_LIST="$MATCH_LIST,$EXTRA_MATCH"
fi
MATCH_WORDS="$MATCH_LIST"

# Results dir
if [ -z "$RESULTS_DIR" ]; then
  RESULTS_DIR="$(mktemp -d -t "fulcrum-eval-$SKILL-XXXXXX")"
fi
mkdir -p "$RESULTS_DIR"
RAW="$RESULTS_DIR/results.jsonl"
LOG="$RESULTS_DIR/log.txt"
SUMMARY="$RESULTS_DIR/summary.txt"
: > "$RAW"; : > "$LOG"

{
  echo "fulcrum eval — $SKILL"
  echo "  queries   : $QUERIES"
  echo "  model     : ${MODEL:-claude default}"
  echo "  runs/query: $RUNS"
  echo "  match     : $MATCH_WORDS"
  echo "  results   : $RESULTS_DIR"
  echo
} | tee "$SUMMARY"

# Sanity: confirm the skill is actually present in ~/.claude/skills (or under fulcrum/).
SKILL_INSTALLED=""
for cand in "$HOME/.claude/skills/$SKILL/SKILL.md" "$HOME/.claude/skills/fulcrum/$SKILL/SKILL.md"; do
  [ -f "$cand" ] && { SKILL_INSTALLED="$cand"; break; }
done
if [ -z "$SKILL_INSTALLED" ]; then
  cat >&2 <<EOF
fulcrum: skill '$SKILL' is not installed under ~/.claude/skills/.
Run: fulcrum skills sync   (puts every authored skill at ~/.claude/skills/fulcrum/<name>)
The agent must be able to discover the skill at runtime; otherwise nothing will trigger.
EOF
  exit 1
fi
echo "  installed at: $SKILL_INSTALLED" | tee -a "$SUMMARY"
echo | tee -a "$SUMMARY"

# Detection helper: returns 1 if the Claude response indicates the skill triggered.
# Inspects both the JSON envelope (for Skill tool-use) and the response text.
detect_trigger() {
  local response_json="$1"
  # 1) Skill tool-use entries naming our skill.
  local skill_used
  skill_used=$(echo "$response_json" | jq -r --arg n "$SKILL_NAME" '
    [.. | objects | select(.type == "tool_use" and (.name // "") == "Skill")
      | .input.skill_name? // .input.name? // empty] | map(select(. == $n)) | length' 2>/dev/null || echo 0)
  if [ "${skill_used:-0}" -gt 0 ] 2>/dev/null; then echo 1; return; fi

  # 2) Fallback heuristic: word match against the assistant's text response.
  local text
  text=$(echo "$response_json" | jq -r '.result // .text // empty' 2>/dev/null || true)
  [ -z "$text" ] && text="$response_json"
  local lc
  lc=$(echo "$text" | tr '[:upper:]' '[:lower:]')
  local IFS=','
  for w in $MATCH_WORDS; do
    w=$(echo "$w" | tr '[:upper:]' '[:lower:]' | xargs)
    [ -z "$w" ] && continue
    if echo "$lc" | grep -qw -- "$w"; then echo 1; return; fi
  done
  echo 0
}

TOTAL_ENTRIES=$(jq 'length' "$QUERIES")
TRIG_TOTAL=0; TRIG_HIT=0
NEG_TOTAL=0;  NEG_FAIL=0
ENTRY_IDX=0

while IFS= read -r entry; do
  Q=$(echo "$entry" | jq -r '.query')
  EXPECT=$(echo "$entry" | jq -r '.should_trigger')

  for run in $(seq 1 "$RUNS"); do
    WORK=$(mktemp -d)
    CLAUDE_ARGS=(--print --output-format=json --no-session-persistence)
    [ -n "$MODEL" ] && CLAUDE_ARGS+=(--model "$MODEL")
    RESP=$( (cd "$WORK" && claude "${CLAUDE_ARGS[@]}" "$Q" </dev/null) 2>>"$LOG" || true)
    rm -rf "$WORK"

    TRIG=$(detect_trigger "$RESP")
    jq -nc \
      --arg q "$Q" --argjson exp "$EXPECT" --argjson trig "$TRIG" \
      --argjson idx "$ENTRY_IDX" --argjson run "$run" \
      --arg resp "$RESP" \
      '{idx:$idx, run:$run, query:$q, expected:$exp, triggered:($trig==1), response:$resp}' \
      >> "$RAW"

    if [ "$EXPECT" = "true" ]; then
      TRIG_TOTAL=$((TRIG_TOTAL+1))
      [ "$TRIG" = "1" ] && TRIG_HIT=$((TRIG_HIT+1))
    else
      NEG_TOTAL=$((NEG_TOTAL+1))
      [ "$TRIG" = "1" ] && NEG_FAIL=$((NEG_FAIL+1))
    fi

    printf "  [entry %2d/%d run %d/%d] expect=%-5s triggered=%s — %s\n" \
      $((ENTRY_IDX+1)) "$TOTAL_ENTRIES" "$run" "$RUNS" "$EXPECT" \
      $([ "$TRIG" = "1" ] && echo yes || echo no) \
      "${Q:0:64}" | tee -a "$SUMMARY"
  done

  ENTRY_IDX=$((ENTRY_IDX+1))
done < <(jq -c '.[]' "$QUERIES")

# Summary
trig_pct=$([ "$TRIG_TOTAL" -gt 0 ] && echo $((100 * TRIG_HIT / TRIG_TOTAL)) || echo 0)
neg_pct=$([ "$NEG_TOTAL"  -gt 0 ] && echo $((100 * NEG_FAIL / NEG_TOTAL)) || echo 0)
{
  echo
  echo "Summary"
  echo "  trigger rate (should_trigger=true)   : $TRIG_HIT/$TRIG_TOTAL  (${trig_pct}%)   target ≥ 80%"
  echo "  false-trigger (should_trigger=false) : $NEG_FAIL/$NEG_TOTAL  (${neg_pct}%)   target ≤ 20%"
  echo
  echo "Raw results: $RAW"
  echo "Log        : $LOG"
} | tee -a "$SUMMARY"

# Exit code: 0 if both pass criteria met, 1 otherwise.
[ "$trig_pct" -ge 80 ] && [ "$neg_pct" -le 20 ]
