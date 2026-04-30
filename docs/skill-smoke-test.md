# Skill smoke-test checklist

> Cross-agent check for new in-repo skill. Run after `fulcrum skills lint` pass + `fulcrum skills sync` install; add `--codex-global` for Codex global evals or `--codex-project <dir>` for repo-scoped Codex checks. Claude Code, Codex, Gemini, OpenCode, and Pi all have statistical trigger-rate harnesses (`scripts/eval-skill-<agent>.sh`). Manual smoke steps below remain useful for first-install verification of the extension/skill discovery path before running the full statistical harness.

## Per skill, prepare

- [ ] **Trigger phrase** — one short prompt should activate skill (e.g. `"how do I select fields from a JSON file"` for `jq`).
- [ ] **Anti-trigger phrase** — related but distinct prompt should NOT activate (e.g. `"how do I select cells in a CSV"` for `jq`).

Both plain English; no tool name itself.

## Per agent

### Claude Code

- [ ] `claude -p "<trigger phrase>"` — confirm skill loads (look for skill name in tool-use events).
- [ ] `claude -p "<anti-trigger phrase>"` — confirm skill NOT load.
- [ ] Run `scripts/eval-skill-claude.sh <skill>` for statistical activation rate.

### Codex CLI

- [ ] `codex "<trigger phrase>"` — observe if skill referenced in tool plan.
- [ ] `codex "<anti-trigger phrase>"` — should not load.
- [ ] Run `scripts/eval-skill-codex.sh <skill> --model <codex-model>` for statistical activation rate.

### Gemini CLI

- [ ] `gemini extensions link ~/.gemini/extensions/fulcrum-skills` (one-time, after `fulcrum skills sync`).
- [ ] `gemini -p "<trigger phrase>" --output-format json --yolo` — confirm response mentions skill.
- [ ] Run `scripts/eval-skill-gemini.sh <skill> --runs-per-query 1` for statistical activation rate.

### OpenCode

- [ ] `opencode run --format json "<trigger phrase>"` — observe skill name in JSON event stream.
- [ ] Run `scripts/eval-skill-opencode.sh <skill> --runs-per-query 1` for statistical activation rate.

### Pi CLI

- [ ] `pi` (interactive). Type `/skill:<name>` direct — confirms skill exists + body renders.
- [ ] `pi --print "<trigger phrase>" --mode json --no-session` — observe if response references skill.
- [ ] Run `scripts/eval-skill-pi.sh <skill> --runs-per-query 1` for statistical activation rate.

## Pass criteria

- Trigger phrase activates skill on ≥4 of 5 agents.
- Anti-trigger phrase NOT activate on any agent (description too pushy if does).
- Frontmatter pass `fulcrum skills lint` (strictest-union rules).

## When skill fails on one agent

- Lint clean but no activation on Gemini → check extension manifest at `~/.gemini/extensions/fulcrum-skills/gemini-extension.json` exists.
- Lint clean but no activation on OpenCode → confirm directory name == `name` in frontmatter (OpenCode enforces strict via Zod).
- Lint clean but no activation on Pi → confirm manual `/skill:<name>` works. If yes, trigger phrase too weak — tighten description.
- Anti-trigger fires on every agent → description too generic. Add specific noun phrase from tool domain.

## Cross-refs

- `fulcrum skills lint` — frontmatter validator (`src/cli/skills.ts`)
- `scripts/eval-skill-claude.sh` — trigger-rate harness (Claude Code)
- `scripts/eval-skill-codex.sh` — trigger-rate harness (Codex CLI)
- `scripts/eval-skill-gemini.sh` — trigger-rate harness (Gemini CLI)
- `scripts/eval-skill-opencode.sh` — trigger-rate harness (OpenCode)
- `scripts/eval-skill-pi.sh` — trigger-rate harness (Pi CLI)
- `scripts/eval-all.sh` — leaderboard runner (`--engine claude|codex|gemini|opencode|pi`)
- `docs/skills.md` §7 — verification policy
