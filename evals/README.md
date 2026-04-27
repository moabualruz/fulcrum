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

- **Python 3.10+** — `skill-creator/scripts/run_loop.py` uses PEP-604 `X | Y` type syntax. macOS system Python is 3.9 and won't work. `brew install python@3.12` or `mise use -g python@3.12`. Override with `FULCRUM_PYTHON=/path/to/python3.12`.
- **`skill-creator` plugin installed** — `/plugin install skill-creator` inside Claude Code.
- **Anthropic API key** in the environment (`ANTHROPIC_API_KEY` or your shell's usual auth) — the harness calls the real model.

## Run

```bash
fulcrum skills lint skills/jq/SKILL.md       # frontmatter check first
scripts/eval-skill-claude.sh jq              # uses evals/jq.json by default
scripts/eval-skill-claude.sh jq --model claude-sonnet-4-6
```

The harness writes an HTML report to a temp file (path printed at end). Pass `--results-dir <dir>` to keep results.json + report.html + log.txt.

## Pass criteria

- `train` trigger rate ≥ 80% on `should_trigger:true` entries.
- `train` activation ≤ 20% on `should_trigger:false` entries.
- `test` (held-out 40%) numbers within 10pp of train (no overfitting).

If the trigger rate is too low, edit `description` to be more imperative and include trigger phrases. If activation on negatives is too high, narrow the description with domain-specific nouns.

## Cross-refs

- `scripts/eval-skill-claude.sh`
- `docs/skill-smoke-test.md` — manual cross-agent verification for the other 4 agents.
- `docs/skills.md` §7 — verification policy.
