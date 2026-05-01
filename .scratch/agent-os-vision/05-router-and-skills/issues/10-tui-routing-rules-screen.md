---
Status: ready-for-agent
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: 07-routing-trpc-procedures
---

# TUI routing rules editor screen

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Build the OpenTUI routing rules screen in `src/tui/screens/routing-rules.ts`. Displays a table of rules (name / agent / scope / priority / source / enabled). Key bindings: `n` = new rule (inline form), `e` = edit selected, `d` = delete selected, `t` = test selected rule (opens test pane). Test pane: conditions JSON on left, task facts input fields on right, decision banner at bottom.

## Acceptance criteria

- [ ] Schema / module: `src/tui/screens/routing-rules.ts` renders rule table with all specified columns
- [ ] Logic: `n` key opens inline form; submitting calls `trpc.routing.create`; new row appears in table
- [ ] Logic: `e` key opens pre-populated edit form for selected rule; submitting calls `trpc.routing.update`
- [ ] Logic: `d` key shows confirmation prompt; confirming calls `trpc.routing.delete`; row removed from table
- [ ] Logic: `t` key opens test pane; user inputs task fields; on submit calls `trpc.routing.dryRun`; decision banner shows agent + source
- [ ] Logic: enabled toggle (via `e` → enable/disable field) calls `trpc.routing.update`
- [ ] Surfaces parity: all operations produce identical data outcomes as Web and CLI equivalents
- [ ] Tests: TUI unit tests (OpenTUI test utilities) for key bindings firing correct tRPC calls
- [ ] Tests: test pane renders `RoutingDecision` output correctly

## Blocked by

- `07-routing-trpc-procedures`

## Notes

Per Q-tui-lib decision: OpenTUI (Bun-native, TS/JSX-style). Fallback to ratatui only if OpenTUI proves too immature when this is implemented. Table component should support keyboard navigation (up/down arrows, j/k vim bindings).
