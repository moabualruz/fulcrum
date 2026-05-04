---
Status: completed
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [07-task-crud-baseline, 04-saved-views-schema]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C4, Q10]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Sprint/scrum/dev cycles row)
Docs: []
---

# Kanban board view — DnD, swimlanes, optimistic UI

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-20, T6-21, T6-28)

## What to build
SvelteKit route `/projects/<id>/board` — Kanban with status columns, swimlane toggle
(assignee/priority/epic), `svelte-dnd-action` drag-and-drop column status change with
optimistic UI + revert on failure, card mini-detail (avatar, priority badge, labels,
blocked badge, points). Includes view switcher tabs (board/table/calendar/timeline/list)
that persist last-used view in `localStorage`. CLI: `--format board` ASCII column output.
TUI: `b` toggle ASCII board with `h`/`l` move status.

## Acceptance criteria
- [ ] Web: `/projects/<id>/board` renders status columns from `taskStatuses.list`; each column shows task cards
- [ ] Web: card mini-detail — avatar(s), priority badge (color-coded), labels chips, blocked badge (orange) when blocked, points chip, title truncated at 2 lines
- [ ] Web: `svelte-dnd-action` DnD — drag card to new column triggers `tasks.update({status})` optimistically; on tRPC error reverts card to original column with toast
- [ ] Web: swimlane toggle — group by assignee/priority; each swimlane row is collapsible; ungrouped default
- [ ] Web: sprint filter header — dropdown selects active sprint or "All" or "Backlog" to scope the board
- [ ] Web: view switcher tabs (board/table/calendar/timeline/list) rendered in `/projects/<id>` layout; active tab persisted in `localStorage`; tab change navigates to matching route
- [ ] Web: performance — 200 tasks × 7 columns renders cold < 300ms (measured with `performance.now()` in test)
- [ ] CLI: `fulcrum tasks list --project <id> --format board` prints ASCII board with one column per status; `--json` returns tasks grouped by status
- [ ] TUI: `b` toggles ASCII board panel; `h`/`l` moves selected task left/right between status columns; `Enter` opens detail pane
- [ ] Tests: DnD optimistic revert — simulate tRPC error → card returns to original column (Playwright or mock store test)
- [ ] Tests: swimlane by assignee groups tasks correctly
- [ ] Tests: view switcher persists last-used tab across route navigation
- [ ] Tests: 200 task render < 300ms assertion

## Blocked by
- 07-task-crud-baseline
- 04-saved-views-schema

## Notes / Tech-stack hints
- Failure gate: if `svelte-dnd-action` breaks on Svelte 5 runes (`onconsider`/`onfinalize` API), fall back to `pragmatic-drag-and-drop` (Apache-2.0) — ~1 day migration
- >500 cards perf: implement virtual columns (TanStack Virtual per column) if card count exceeds 500
- `svelte-dnd-action` `a11y` props required: `aria-label` on each droppable zone
