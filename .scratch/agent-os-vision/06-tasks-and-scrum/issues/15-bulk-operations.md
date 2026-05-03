---
Status: implemented
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [07-task-crud-baseline]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Jira-grade task management row)
Docs: []
---

# Bulk operations — web multi-select, CLI, TUI

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-26, T6-42)

## What to build
tRPC `tasks.bulkUpdate` procedure; Web: shift+click range + cmd+click toggle
multi-select across board/table/list views; floating action bar with assign/status/
sprint/label/priority/delete actions dispatched via shadcn-svelte Command; CLI
`fulcrum tasks bulk --action status --ids <...>`; TUI: Space key multi-select,
`B` bulk menu.

## Acceptance criteria
- [ ] tRPC `tasks.bulkUpdate({ids: uuid[], patch: Partial<TaskUpdateInput>})`: applies same patch to all `ids` in a single transaction; emits one event per modified task; returns `{updated: number}`
- [ ] tRPC `tasks.bulkDelete({ids: uuid[]})`: soft-deletes all tasks; returns `{deleted: number}`
- [ ] Web: shift+click range selects contiguous tasks in current view order; cmd+click toggles individual selection; selection count shown in floating action bar
- [ ] Web: floating action bar appears when ≥2 tasks selected; actions: Assign, Status, Sprint, Label, Priority, Delete; each action opens shadcn-svelte Command palette pre-scoped to that action
- [ ] Web: after bulk action completes, selection cleared and view refreshes
- [ ] Web: bulk delete requires confirmation dialog: "Delete N tasks? This cannot be undone."
- [ ] CLI: `fulcrum tasks bulk --action status --status-name "In Review" --ids <id1>,<id2>,... --project <id> --json` returns `{updated: number}`
- [ ] CLI: `fulcrum tasks bulk --action assign --assignee <user-id> --ids <...> --json`
- [ ] TUI: `Space` toggles task selection in list panel; selected tasks highlighted; `B` opens bulk menu with action list; confirm with `Enter`
- [ ] Tests: `tasks.bulkUpdate` transaction — one invalid ID among 5 valid rolls back all (if strict) or skips and updates 4 (if lenient); document chosen behavior
- [ ] Tests: shift+click selects 5 contiguous tasks (Playwright click simulation)
- [ ] Tests: bulk status change — 3 tasks updated to new status, events emitted
- [ ] Tests: CLI `--json` output `{updated: N}` matches actual rows changed

## Blocked by
- 07-task-crud-baseline

## Notes / Tech-stack hints
- `tasks.bulkUpdate` strategy: use `WHERE id = ANY($1::uuid[])` for atomic batch
- shadcn-svelte Command palette: failure gate > 1000 items lag → switch to `ninja-keys` (MIT)
- Selection state stored in Svelte store scoped to the current view; cleared on route change
