# Skill smoke-test checklist

> Manual cross-agent verification for any new in-repo skill. Run after `fulcrum skills lint` passes and `fulcrum skills sync` has installed; add `--codex-global` for Codex global evals or `--codex-project <dir>` for repo-scoped Codex checks. Claude Code and Codex both have statistical trigger-rate harnesses; Gemini, OpenCode, and Pi remain manual smoke.

## Per skill, prepare

- [ ] **Trigger phrase** — one short prompt that should activate the skill (e.g. `"how do I select fields from a JSON file"` for `jq`).
- [ ] **Anti-trigger phrase** — a related but distinct prompt that should NOT activate (e.g. `"how do I select cells in a CSV"` for `jq`).

Both must be plain English; do not include the tool name itself.

## Per agent

### Claude Code

- [ ] `claude -p "<trigger phrase>"` — confirm the skill loads (look for the skill name in tool-use events).
- [ ] `claude -p "<anti-trigger phrase>"` — confirm the skill does NOT load.
- [ ] Run `scripts/eval-skill-claude.sh <skill>` for statistical activation rate.

### Codex CLI

- [ ] `codex "<trigger phrase>"` — observe whether the skill is referenced in the tool plan.
- [ ] `codex "<anti-trigger phrase>"` — should not load.
- [ ] Run `scripts/eval-skill-codex.sh <skill> --model <codex-model>` for statistical activation rate.

### Gemini CLI

- [ ] `gemini extensions link ~/.gemini/extensions/fulcrum-skills` (one-time, after `fulcrum skills sync`).
- [ ] `gemini --debug "<trigger phrase>"` — grep stderr for skill activation log lines.
- [ ] `gemini --debug "<anti-trigger phrase>"` — should not log activation.

### OpenCode

- [ ] `opencode "<trigger phrase>"` — observe the skill loading in OpenCode's status output.
- [ ] `opencode "<anti-trigger phrase>"` — should not load.

### Pi CLI

- [ ] `pi` (interactive). Type `/skill:<name>` directly — confirms the skill exists and the body renders.
- [ ] In a fresh session, `pi "<trigger phrase>"` and observe whether Pi's plan references the skill.

## Pass criteria

- Trigger phrase activates the skill on at least 4 of 5 agents.
- Anti-trigger phrase does NOT activate on any agent (description is too pushy if it does).
- Frontmatter passes `fulcrum skills lint` (strictest-union rules).

## When the skill fails on one agent

- Lint clean but no activation on Gemini → check the extension manifest at `~/.gemini/extensions/fulcrum-skills/gemini-extension.json` exists.
- Lint clean but no activation on OpenCode → confirm directory name == `name` in frontmatter (OpenCode enforces this strictly via Zod).
- Lint clean but no activation on Pi → confirm you can manually `/skill:<name>`. If yes, the trigger phrase isn't strong enough — tighten the description.
- Anti-trigger fires on every agent → description is too generic. Add a specific noun phrase from the tool's domain.

## Cross-refs

- `fulcrum skills lint` — frontmatter validator (`apps/cli/src/skills.ts`)
- `scripts/eval-skill-claude.sh` — trigger-rate harness (Claude Code only)
- `scripts/eval-skill-codex.sh` — trigger-rate harness (Codex CLI)
- `docs/skills.md` §7 — verification policy
