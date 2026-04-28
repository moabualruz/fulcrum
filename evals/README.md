# Skill eval queries

> Trigger-rate test sets for `scripts/eval-skill-claude.sh`. One JSON array per skill, named `<skill>.json`. Used by Anthropic's `skill-creator/scripts/run_loop.py` (verified 2026-04-27).

## Format

```json
[
  {"query": "<prompt the agent might receive>", "should_trigger": true},
  {"query": "<related prompt that should NOT load this skill>", "should_trigger": false}
]
```

## Authoring guidelines

- **10+ entries minimum.** `run_loop.py` defaults to 60/40 train/test split with 3 samples per query — fewer entries gives noisy results.
- **At least 30% should_trigger:false.** Without negatives, the harness can't measure precision (description too pushy).
- **Query in plain English; no tool name.** The skill's job is to recognize the *intent*, not the keyword. `"how do I select fields from a JSON file"` good; `"jq query"` cheating.
- **Anti-trigger phrases should be near-misses.** Domain-adjacent prompts that another skill would handle (`"how do I select cells in a CSV"` for jq).

## Requirements

- **`claude` CLI on PATH** — auth (OAuth via `claude login`, macOS keychain, etc.) is handled by Claude Code itself; no `ANTHROPIC_API_KEY` is needed in the environment. The harness calls `claude --print --output-format=json --no-session-persistence "<query>"` per entry.
- **`fulcrum skills sync`** must have run so the skill under test is at `~/.claude/skills/fulcrum/<name>/SKILL.md` (or `~/.claude/skills/<name>/...`). Without it, the agent has nothing to trigger and every entry will look like a false negative.
- **`jq`** — used to parse responses and evals.

## Run

```bash
fulcrum skills sync                                            # propagate skills first
fulcrum skills lint skills/jq/SKILL.md                         # frontmatter + section check
scripts/eval-skill-claude.sh jq                                # uses evals/jq.json
scripts/eval-skill-claude.sh jq --model sonnet --runs-per-query 3
scripts/eval-skill-claude.sh jq --results-dir ./eval-jq        # keep transcripts
scripts/eval-skill-claude.sh jq --match-words "json,query"     # extend trigger heuristic
```

The harness saves `summary.txt` (per-entry log + final pass/fail), `results.jsonl` (one line per run with the full Claude response), and `log.txt` (any claude-cli stderr) under `--results-dir` (a tmpdir if not given). Exit code is 0 when both pass criteria are met, 1 otherwise.

## Pass criteria

- Trigger rate ≥ 80% on `should_trigger:true` entries.
- False-trigger rate ≤ 20% on `should_trigger:false` entries.

If the trigger rate is too low, edit `description` to be more imperative and include trigger phrases. If activation on negatives is too high, narrow the description with domain-specific nouns. The previous `skill-creator/run_loop.py` train/test split is no longer used — this harness runs every entry directly via the Claude CLI; rely on `--runs-per-query 3` for stability.

## Trigger detection

The harness flags a query as "triggered" when either:

1. The Claude response's JSON contains a `Skill` tool-use entry naming the skill (definitive — the agent loaded `<skill>` at runtime).
2. The response text contains the skill's frontmatter `name:` value or the first command in the skill's Invocation block (heuristic fallback). Override or extend the word list with `--match-words "w1,w2,..."`.

If your skill's name doesn't appear naturally in correct responses (rare — most skills are named after their CLI), pass `--match-words` so the heuristic is meaningful.

## Cross-refs

- `scripts/eval-skill-claude.sh` — the harness.
- `docs/skill-smoke-test.md` — manual cross-agent verification for Codex / Gemini / OpenCode / Pi (no auto-eval there).
- `docs/skills.md` §7 — verification policy.
