---
Status: completed
Owner: codex-orchestrator
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: 02-fulcrum-skills-schema-migration
---

# Skills loader — per-agent directory install + hash verification

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Implement `src/skills/loader.ts` — reads a skill's `SKILL.md` frontmatter (`name`, `agents`, `triggers`, `version`), copies the SKILL.md file into each target agent dir (e.g. `~/.claude/skills/`, `~/.codex/skills/`), writes the `fulcrum_skills` DB row, and sets `hash_verified` to the sha256 of the file content. `agents: ['*']` installs to all five known agent dirs. Missing agent dir is auto-created with a warning log. Tampered content on reinstall (hash mismatch) → error + `hash_verified=null`.

## Acceptance criteria

- [ ] Schema / module: `src/skills/loader.ts` exports `installSkill(skillPath: string, orgId: string): Promise<FulcrumSkill>`
- [ ] Schema / module: `AGENT_DIRS` constant maps agent name to path (`claude → ~/.claude/skills/`, `codex → ~/.codex/skills/`, `gemini → ~/.gemini/extensions/<ext>/skills/`, `opencode → ~/.config/opencode/skills/`, `pi → ~/.pi/agent/skills/`)
- [ ] Logic: `agents: ['claude', 'codex']` → copies to exactly 2 dirs, not 3
- [ ] Logic: `agents: ['*']` → copies to all 5 dirs
- [ ] Logic: missing agent dir → `mkdir -p` with warning log; install continues
- [ ] Logic: `hash_verified` set to sha256(SKILL.md content) in DB row + lock file
- [ ] Logic: reinstall same content → no-op (hash matches, skip write)
- [ ] Logic: reinstall tampered content (hash mismatch) → error thrown, `hash_verified=null` in DB
- [ ] Logic: SKILL.md frontmatter YAML parse error → log error, skip skill, no DB row written
- [ ] Tests: install to 2 dirs → files present in both dirs, absent in other 3
- [ ] Tests: `agents: ['*']` → 5 dirs all have the file
- [ ] Tests: hash mismatch on reinstall → error + null hash in DB
- [ ] Tests: missing agent dir → auto-created, install succeeds

## Blocked by

- `02-fulcrum-skills-schema-migration`

## Notes

Never install to `~/.agents/` — global rule from `~/.claude/CLAUDE.md`. The five valid agent dirs are the only valid targets. `fulcrum component install` existing package manager should be extended (or this module used as its skills-path) — coordinate with Pillar 1 team to avoid duplicate implementations.
