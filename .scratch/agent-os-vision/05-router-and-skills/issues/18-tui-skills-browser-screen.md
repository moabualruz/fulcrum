---
Status: completed
Triage: AFK
ImplRuntime: claude
Pillar: 05-router-and-skills
Blocked-by: 16-skills-trpc-procedures
---

# TUI skills browser screen — table + conflict panel

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Build the OpenTUI skills browser screen in `src/tui/screens/skills.ts`. Table columns: slug / version / source / hash_verified / enabled_agents. Key bindings: `s` = sync upstream, `u` = upgrade selected, `D` = uninstall selected (with confirmation). When a conflict exists on the selected row: show a side-by-side diff panel. `k` = keep local, `U` = use upstream, `m` = open `$EDITOR` for manual merge.

## Acceptance criteria

- [ ] Schema / module: `src/tui/screens/skills.ts` renders skills table with all specified columns
- [ ] Logic: `s` key calls `trpc.skills.sync` with `fetchUpstream: true`; table refreshes; merged count shown in status bar
- [ ] Logic: `u` key calls `trpc.skills.upgrade` for selected slug; row updates in place
- [ ] Logic: `D` key shows confirmation prompt; confirming calls `trpc.skills.uninstall`; row removed
- [ ] Logic: conflict panel opens automatically when selected row has `upstream_conflict` in lock file; shows side-by-side diff
- [ ] Logic: `k` key in conflict panel → calls `trpc.skills.resolveConflict` with `resolution: 'local'`; conflict panel closes
- [ ] Logic: `U` key in conflict panel → calls `trpc.skills.resolveConflict` with `resolution: 'upstream'`; row hash updates
- [ ] Logic: `m` key in conflict panel → spawns `$EDITOR`; on return calls `trpc.skills.resolveConflict` with `resolution: 'editor'`
- [ ] Surfaces parity: all operations produce same DB/file outcomes as CLI and Web
- [ ] Tests: TUI unit tests for `s`/`u`/`D`/`k`/`U` key bindings firing correct tRPC calls
- [ ] Tests: conflict panel renders diff string from lock file

## Blocked by

- `16-skills-trpc-procedures`

## Notes

Side-by-side diff: split the `upstream_conflict` unified diff string into a two-column display (local left, upstream right). A simple line-by-line render with `+`/`-` color is sufficient — no need for a full diff widget library.
