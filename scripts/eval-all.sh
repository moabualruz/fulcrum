#!/usr/bin/env bash
# Run scripts/eval-skill-claude.sh across every authored skill and emit a
# leaderboard at <results-dir>/leaderboard.md.
#
# Usage:
#   scripts/eval-all.sh [--model NAME] [--runs-per-query N] [--results-dir DIR]
#                       [--only skill1,skill2,...] [--skip skill1,skill2,...]
#
# Auth: handled by the `claude` CLI (no API key needed).
# Cost: ~5–10s per query × 20 queries × N skills × runs-per-query. With
#       defaults (N=28, runs=1) plan ~30–60 minutes on Sonnet.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HARNESS="$REPO_DIR/scripts/eval-skill-claude.sh"

MODEL=""
RUNS=1
RESULTS_DIR=""
ONLY=""
SKIP=""
REGEN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --model)          MODEL="$2"; shift 2 ;;
    --runs-per-query) RUNS="$2"; shift 2 ;;
    --results-dir)    RESULTS_DIR="$2"; shift 2 ;;
    --only)           ONLY="$2"; shift 2 ;;
    --skip)           SKIP="$2"; shift 2 ;;
    --regenerate-only) REGEN=1; shift ;;
    -h|--help)
      sed -n '2,15p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

# --regenerate-only: walk existing $RESULTS_DIR, re-parse each <skill>/summary.txt,
# rewrite leaderboard.md. No evals run. Required: --results-dir pointing at an
# existing eval-results/<ts>/ tree.
if [ "$REGEN" = "1" ]; then
  if [ -z "$RESULTS_DIR" ] || [ ! -d "$RESULTS_DIR" ]; then
    echo "--regenerate-only requires --results-dir <existing-dir>" >&2; exit 2
  fi
  LEADERBOARD="$RESULTS_DIR/leaderboard.md"
  {
    echo "# Fulcrum skill eval leaderboard"
    echo
    echo "_Regenerated: $(date -u +%Y-%m-%dT%H:%M:%SZ); source: ${RESULTS_DIR}_"
    echo
    echo "Pass criteria: trigger ≥ 80%, false-trigger ≤ 20%."
    echo
    printf "| Skill | Trigger %% | False-trigger %% | Pass | Notes |\n"
    printf "|---|---:|---:|---|---|\n"
  } > "$LEADERBOARD"
  for d in "$RESULTS_DIR"/*/; do
    skill=$(basename "$d")
    [ "$skill" = "leaderboard.md" ] && continue
    [ -f "$d/summary.txt" ] || continue
    trig=$(grep -E "trigger rate.*should_trigger=true"   "$d/summary.txt" | sed -nE 's/.*\(([0-9]+)%\).*/\1/p' | head -1)
    false=$(grep -E "false-trigger.*should_trigger=false" "$d/summary.txt" | sed -nE 's/.*\(([0-9]+)%\).*/\1/p' | head -1)
    trig=${trig:-?}; false=${false:-?}
    pass="?"
    if [ "$trig" != "?" ] && [ "$false" != "?" ]; then
      if [ "$trig" -ge 80 ] && [ "$false" -le 20 ]; then pass="✓"; else pass="✗"; fi
    fi
    notes=""
    [ "$trig" != "?" ] && [ "$trig" -lt 80 ] 2>/dev/null && notes="trigger below 80%; "
    [ "$false" != "?" ] && [ "$false" -gt 20 ] 2>/dev/null && notes="${notes}false-trigger above 20%; "
    notes=${notes%; }; [ -z "$notes" ] && notes="ok"
    printf "| %s | %s | %s | %s | %s |\n" "$skill" "${trig}%" "${false}%" "$pass" "$notes" >> "$LEADERBOARD"
    printf "  %-22s trig=%-4s false=%-4s %s\n" "$skill" "${trig}%" "${false}%" "$pass"
  done
  echo "Leaderboard regenerated: $LEADERBOARD"
  exit 0
fi

if [ -z "$RESULTS_DIR" ]; then
  RESULTS_DIR="$REPO_DIR/eval-results/$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p "$RESULTS_DIR"
LEADERBOARD="$RESULTS_DIR/leaderboard.md"

# Discover skills.
SKILLS=()
for dir in "$REPO_DIR"/skills/*/; do
  name=$(basename "$dir")
  [ "$name" = "_template" ] && continue
  [ -f "$dir/SKILL.md" ] || continue
  if [ -n "$ONLY" ]; then
    case ",$ONLY," in *",$name,"*) ;; *) continue ;; esac
  fi
  if [ -n "$SKIP" ]; then
    case ",$SKIP," in *",$name,"*) continue ;; esac
  fi
  SKILLS+=("$name")
done

echo "fulcrum eval-all"
echo "  model        : ${MODEL:-claude default}"
echo "  runs/query   : $RUNS"
echo "  results dir  : $RESULTS_DIR"
echo "  skills       : ${#SKILLS[@]} (${SKILLS[*]})"
echo

START_TS=$(date +%s)

# Init leaderboard
{
  echo "# Fulcrum skill eval leaderboard"
  echo
  echo "_Run: $(date -u +%Y-%m-%dT%H:%M:%SZ); model=${MODEL:-default}; runs/query=${RUNS}_"
  echo
  echo "Pass criteria: trigger ≥ 80%, false-trigger ≤ 20%."
  echo
  printf "| Skill | Trigger %% | False-trigger %% | Pass | Notes |\n"
  printf "|---|---:|---:|---|---|\n"
} > "$LEADERBOARD"

# Run each skill.
for skill in "${SKILLS[@]}"; do
  echo "→ $skill"
  out_dir="$RESULTS_DIR/$skill"
  mkdir -p "$out_dir"

  args=(--results-dir "$out_dir" --runs-per-query "$RUNS")
  [ -n "$MODEL" ] && args+=(--model "$MODEL")

  if "$HARNESS" "$skill" "${args[@]}" >/dev/null 2>&1; then
    pass="✓"
  else
    pass="✗"
  fi

  # Parse summary.txt for the trigger / false-trigger percentages.
  # grep+sed (portable: macOS BSD awk does not support 3-arg match()).
  trig=$(grep -E "trigger rate.*should_trigger=true"   "$out_dir/summary.txt" 2>/dev/null | sed -nE 's/.*\(([0-9]+)%\).*/\1/p' | head -1)
  false=$(grep -E "false-trigger.*should_trigger=false" "$out_dir/summary.txt" 2>/dev/null | sed -nE 's/.*\(([0-9]+)%\).*/\1/p' | head -1)
  trig=${trig:-?}; false=${false:-?}

  notes=""
  if [ "$trig" != "?" ] && [ "$trig" -lt 80 ] 2>/dev/null; then
    notes="trigger below 80%; "
  fi
  if [ "$false" != "?" ] && [ "$false" -gt 20 ] 2>/dev/null; then
    notes="${notes}false-trigger above 20%; "
  fi
  notes=${notes%; }
  [ -z "$notes" ] && notes="ok"

  printf "| %s | %s | %s | %s | %s |\n" \
    "$skill" "${trig}%" "${false}%" "$pass" "$notes" >> "$LEADERBOARD"

  printf "  %-22s trig=%-4s false=%-4s %s\n" "$skill" "${trig}%" "${false}%" "$pass"
done

END_TS=$(date +%s)
ELAPSED=$((END_TS - START_TS))

{
  echo
  echo "_Elapsed: $((ELAPSED/60))m $((ELAPSED%60))s_"
} >> "$LEADERBOARD"

echo
echo "Leaderboard: $LEADERBOARD"
echo "Per-skill data: $RESULTS_DIR/<skill>/summary.txt + results.jsonl"
echo "Elapsed: $((ELAPSED/60))m $((ELAPSED%60))s"
