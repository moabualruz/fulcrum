#!/usr/bin/env bash
# Fulcrum eval-skill-pi — measure a skill's trigger rate via the Pi CLI.
#
# Usage:
#   scripts/eval-skill-pi.sh <skill-name> [--queries FILE]
#                                          [--model NAME]
#                                          [--runs-per-query N]
#                                          [--results-dir DIR]
#                                          [--match-words "w1,w2,..."]
#
# Non-interactive mode: pi --print "<query>" --mode json --no-session
# Activation signal: word-boundary grep against captured stdout+stderr for
# tokens in evals/<skill>.match-words (same precedence as claude harness).
#
# Pass criteria (matches docs/skills.md §7):
#   - trigger rate ≥ 80% on should_trigger=true entries
#   - activation  ≤ 20% on should_trigger=false entries
#
# Pi skill install: fulcrum skills sync puts skills at
#   ~/.pi/agent/skills/fulcrum/<name>/SKILL.md

set -euo pipefail

case "${1:-}" in
  -h|--help|"")
    sed -n '2,16p' "$0" | sed 's/^# \?//'
    exit 0 ;;
esac

SKILL="$1"
shift

QUERIES=""
MODEL=""
RUNS=1
RESULTS_DIR=""
EXTRA_MATCH=""

while [ $# -gt 0 ]; do
  case "$1" in
    --queries)         QUERIES="$2"; shift 2 ;;
    --model)           MODEL="$2"; shift 2 ;;
    --runs-per-query)  RUNS="$2"; shift 2 ;;
    --results-dir)     RESULTS_DIR="$2"; shift 2 ;;
    --match-words)     EXTRA_MATCH="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,16p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_DIR="$REPO_DIR/skills/$SKILL"
SKILL_FILE="$SKILL_DIR/SKILL.md"
[ -f "$SKILL_FILE" ] || { echo "no such skill: $SKILL_FILE" >&2; exit 1; }

[ -z "$QUERIES" ] && QUERIES="$REPO_DIR/evals/$SKILL.json"
[ -f "$QUERIES" ] || { echo "no eval queries at $QUERIES" >&2; exit 1; }

command -v pi >/dev/null 2>&1 || {
  echo "fulcrum: \`pi\` CLI not on PATH. Install Pi CLI." >&2
  exit 1
}
command -v jq >/dev/null 2>&1 || { echo "fulcrum: jq required" >&2; exit 1; }

# Derive match words (same precedence as claude harness):
#   1. CLI flag --match-words (highest)
#   2. File evals/<skill>.match-words
#   3. Auto-derived: skill name + commands from Invocation block
SKILL_NAME=$(awk -F': *' '/^name:/{print $2; exit}' "$SKILL_FILE" | tr -d '"')

INVOCATION_BLOCK=$(awk '
  /^## Invocation/ { in_inv=1; next }
  in_inv && /^## / { in_inv=0; next }
  in_inv { print }
' "$SKILL_FILE")

TOP_CMDS=$(echo "$INVOCATION_BLOCK" | awk '
  /^```/ { in_code = !in_code; next }
  in_code {
    if ($0 ~ /^[ \t]*#/) next
    n = split($0, a, /[ \t]+/)
    cmd = a[1]
    gsub(/[`"<>]/, "", cmd)
    if (cmd ~ /=/ || cmd !~ /^[a-zA-Z]/) next
    if (!seen[cmd]++) print cmd
  }
')

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

MATCH_WORDS_FILE="$REPO_DIR/evals/$SKILL.match-words"
if [ -f "$MATCH_WORDS_FILE" ]; then
  FILE_MATCH=$(grep -v '^[[:space:]]*#' "$MATCH_WORDS_FILE" | grep -v '^[[:space:]]*$' | tr '\n' ',' | sed 's/,$//')
  [ -n "$FILE_MATCH" ] && MATCH_LIST="$FILE_MATCH"
fi
[ -n "$EXTRA_MATCH" ] && MATCH_LIST="$MATCH_LIST,$EXTRA_MATCH"
MATCH_WORDS="$MATCH_LIST"

[ -z "$RESULTS_DIR" ] && RESULTS_DIR="$(mktemp -d -t "fulcrum-pi-eval-$SKILL-XXXXXX")"
mkdir -p "$RESULTS_DIR"
RAW="$RESULTS_DIR/results.jsonl"
LOG="$RESULTS_DIR/log.txt"
SUMMARY="$RESULTS_DIR/summary.txt"
: > "$RAW"; : > "$LOG"

{
  echo "fulcrum pi eval — $SKILL"
  echo "  queries   : $QUERIES"
  echo "  model     : ${MODEL:-pi default}"
  echo "  runs/query: $RUNS"
  echo "  match     : $MATCH_WORDS"
  echo "  results   : $RESULTS_DIR"
  echo
} | tee "$SUMMARY"

# Confirm skill is installed.
SKILL_INSTALLED=""
for cand in \
  "$HOME/.pi/agent/skills/fulcrum/$SKILL/SKILL.md" \
  "$HOME/.pi/agent/skills/$SKILL/SKILL.md"; do
  [ -f "$cand" ] && { SKILL_INSTALLED="$cand"; break; }
done
if [ -z "$SKILL_INSTALLED" ]; then
  cat >&2 <<EOF
fulcrum: skill '$SKILL' not found under ~/.pi/agent/skills/fulcrum/.
Run: fulcrum skills sync
Without the skill installed the agent cannot discover it.
EOF
  exit 1
fi
echo "  installed at: $SKILL_INSTALLED" | tee -a "$SUMMARY"
echo | tee -a "$SUMMARY"

# Activation detection: grep captured stdout+stderr for match words.
# pi --mode json emits JSON on stdout; Pi plan JSON may reference skill by name.
detect_trigger() {
  local combined="$1"
  local lc
  lc=$(printf '%s' "$combined" | sed 's/\\n/ /g; s/\\t/ /g; s/\\r/ /g' | tr '[:upper:]' '[:lower:]')
  local IFS=','
  for w in $MATCH_WORDS; do
    w=$(echo "$w" | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
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
    PI_ARGS=(--print --mode json --no-session)
    [ -n "$MODEL" ] && PI_ARGS+=(--model "$MODEL")

    STDOUT_FILE=$(mktemp)
    STDERR_FILE=$(mktemp)
    pi "${PI_ARGS[@]}" "$Q" </dev/null >"$STDOUT_FILE" 2>"$STDERR_FILE" || true
    cat "$STDERR_FILE" >> "$LOG"
    COMBINED=$(cat "$STDOUT_FILE" "$STDERR_FILE")
    RESP=$(cat "$STDOUT_FILE")
    rm -f "$STDOUT_FILE" "$STDERR_FILE"

    TRIG=$(detect_trigger "$COMBINED")
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
      "$([ "$TRIG" = "1" ] && echo yes || echo no)" \
      "$(echo "$Q" | tr '\n' ' ' | cut -c1-64)" | tee -a "$SUMMARY"
  done
  ENTRY_IDX=$((ENTRY_IDX+1))
done < <(jq -c '.[]' "$QUERIES")

TRIG_PCT=0
NEG_PCT=0
[ "$TRIG_TOTAL" -gt 0 ] && TRIG_PCT=$((100 * TRIG_HIT / TRIG_TOTAL))
[ "$NEG_TOTAL" -gt 0 ] && NEG_PCT=$((100 * NEG_FAIL / NEG_TOTAL))

{
  echo
  echo "Summary"
  printf "  trigger rate (should_trigger=true)   : %d/%d  (%d%%)   target >= 80%%\n" "$TRIG_HIT" "$TRIG_TOTAL" "$TRIG_PCT"
  printf "  false-trigger (should_trigger=false) : %d/%d  (%d%%)   target <= 20%%\n" "$NEG_FAIL" "$NEG_TOTAL" "$NEG_PCT"
  echo
  echo "Raw results: $RAW"
  echo "Log        : $LOG"
} | tee -a "$SUMMARY"

[ "$TRIG_PCT" -ge 80 ] && [ "$NEG_PCT" -le 20 ]
