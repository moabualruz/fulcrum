---
Status: ready-for-agent
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: 15-skills-conflict-resolver
---

# tRPC skills.* procedures (list/install/upgrade/uninstall/sync/resolveConflict)

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Implement all six `skills.*` tRPC procedures in `src/server/routers/skills.ts`. Each procedure delegates to the relevant module (`loader.ts`, `upstream-sync.ts`, `conflict-resolver.ts`). `skills.upgrade` accepts a single slug or `'all'`. All procedures return data that matches CLI `--json` output and TUI renders.

## Acceptance criteria

- [ ] Schema / module: `skills.list`, `skills.install`, `skills.upgrade`, `skills.uninstall`, `skills.sync`, `skills.resolveConflict` all implemented with Zod input/output schemas
- [ ] Logic: `skills.install` → installs to agent dirs, writes DB row, returns `FulcrumSkill`
- [ ] Logic: `skills.upgrade` with slug → upgrades one skill; with `'all'` → upgrades all installed skills; returns `FulcrumSkill[]`
- [ ] Logic: `skills.uninstall` → removes files from all agent dirs, removes DB row, returns void
- [ ] Logic: `skills.sync` with `fetchUpstream: true` → runs upstream sync, returns `SyncResult`
- [ ] Logic: `skills.resolveConflict` with `slug` + `resolution` → delegates to conflict resolver, returns updated `FulcrumSkill`
- [ ] Logic: full lifecycle test: install → list → upgrade → resolveConflict (conflict scenario) → uninstall — each step verified in DB and on-disk
- [ ] Surfaces parity: procedure outputs identical between Web, CLI `--json`, TUI
- [ ] Tests: full lifecycle integration test
- [ ] Tests: `skills.uninstall` for skill with `agents: ['claude']` only removes `~/.claude/skills/` dir; other agent dirs untouched

## Blocked by

- `15-skills-conflict-resolver`

## Notes

Export `skillsRouter` and mount in main tRPC app router alongside `routingRouter`. `skills.upgrade 'all'` calls `installSkill` for each installed skill that has an `upstream_repo` set.
