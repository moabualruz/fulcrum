# Skill smoke-test checklist

> Manual cross-agent check for new in-repo skill. Run after `fulcrum skills lint` pass + `fulcrum skills sync` install. Trigger-rate measurement only Claude Code (via `skill-creator`); other 4 agents, this checklist = verification.

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

### Gemini CLI

- [ ] `gemini extensions link ~/.gemini/extensions/fulcrum-skills` (one-time, after `fulcrum skills sync`).
- [ ] `gemini --debug "<trigger phrase>"` — grep stderr for skill activation log lines.
- [ ] `gemini --debug "<anti-trigger phrase>"` — should not log activation.

### OpenCode

- [ ] `opencode "<trigger phrase>"` — observe skill loading in OpenCode status output.
- [ ] `opencode "<anti-trigger phrase>"` — should not load.

### Pi CLI

- [ ] `pi` (interactive). Type `/skill:<name>` direct — confirms skill exists + body renders.
- [ ] Fresh session, `pi "<trigger phrase>"` + observe if Pi plan references skill.

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
- `scripts/eval-skill-claude.sh` — trigger-rate harness (Claude Code only)
- `docs/skills.md` §7 — verification policy