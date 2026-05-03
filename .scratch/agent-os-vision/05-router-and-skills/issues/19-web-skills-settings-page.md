---
Status: implemented
Triage: AFK
ImplRuntime: claude
Pillar: 05-router-and-skills
Blocked-by: 16-skills-trpc-procedures
---

# Web /settings/skills page — registry + install + conflict resolver

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Build `src/routes/(app)/settings/skills/+page.svelte`. Features: installed skills list (slug / version / source / hash / enabled_agents toggle), install form (slug + upstream repo URL), upgrade all button, per-skill upgrade button, uninstall button. When a skill has an `upstream_conflict`, show a diff viewer card with "Keep Local" and "Use Upstream" buttons. `enabled_agents` toggle updates the DB row via `trpc.skills` (stored but not directly re-installed — just updates which agents should have this skill on next sync).

## Acceptance criteria

- [ ] Schema / module: `src/routes/(app)/settings/skills/+page.svelte` renders skills list
- [ ] Logic: skills list loads via `trpc.skills.list`; all columns displayed
- [ ] Logic: install form validates slug (non-empty) before calling `trpc.skills.install`; newly installed skill appears in list
- [ ] Logic: upgrade button calls `trpc.skills.upgrade` for the slug; version column updates
- [ ] Logic: uninstall button shows confirmation dialog; confirmed → calls `trpc.skills.uninstall`; row removed
- [ ] Logic: conflict card visible when skill has `upstream_conflict`; shows side-by-side diff; "Keep Local" + "Use Upstream" buttons call `trpc.skills.resolveConflict`; card disappears on resolution
- [ ] Logic: `enabled_agents` toggle saves via `trpc.skills` update (or dedicated field update); persisted across page refresh
- [ ] Surfaces parity: all operations produce identical data outcomes as CLI and TUI
- [ ] Tests: Playwright e2e — install skill, verify in list, trigger conflict UI, resolve with "Use Upstream", verify conflict gone
- [ ] Tests: `enabled_agents` toggle persists on page reload

## Blocked by

- `16-skills-trpc-procedures`

## Notes

Install form: `slug` field + `upstream_repo` URL field (optional). If `upstream_repo` is blank, skill is `source='local'`. Side-by-side diff view in Web: use a simple two-column pre-formatted display; no external diff library required.
