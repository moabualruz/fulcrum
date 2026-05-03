---
Status: implemented
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [07-task-crud-baseline, 04-saved-views-schema]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C4, Q10]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Jira-grade task management row)
Docs: []
---

# Calendar view — due-date grid + drag-to-reschedule

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-23)

## What to build
SvelteKit calendar view (`?view=calendar` query param off `/projects/<id>/board`)
showing tasks on a monthly date grid by `due_date`. Tasks without due date shown
in an "Unscheduled" sidebar. `svelte-dnd-action` drag-to-reschedule updates
`tasks.due_date` optimistically. Sprint date ranges shown as translucent band behind
the grid. CLI `fulcrum tasks list --due-month YYYY-MM --json`. TUI ASCII calendar
(week view) showing tasks per day.

## Acceptance criteria
- [ ] Web: monthly date grid renders tasks on their `due_date` cell; multi-task cells show "+N more" chip that expands
- [ ] Web: tasks without `due_date` rendered in collapsible "Unscheduled" sidebar
- [ ] Web: sprint range band — active sprint's `start_date`…`end_date` shown as translucent band behind the grid
- [ ] Web: `svelte-dnd-action` drag from one date cell to another → `tasks.update({due_date})` optimistic; error reverts with toast
- [ ] Web: month navigation prev/next arrows; "Today" button snaps to current month
- [ ] Web: task chip click opens task detail modal
- [ ] CLI: `fulcrum tasks list --due-month 2026-05 --project <id> --json` returns tasks with `due_date` in range
- [ ] TUI: `C` key opens ASCII week-calendar panel; each column = one day of current week; tasks listed under their due day; `h`/`l` navigate weeks
- [ ] Tests: tasks rendered on correct date cells for a 3-task fixture
- [ ] Tests: drag-reschedule updates `due_date` and optimistic revert on error
- [ ] Tests: `--due-month` filter returns only tasks within that month
- [ ] Tests: sprint range band covers correct cells for a fixture sprint

## Blocked by
- 07-task-crud-baseline
- 04-saved-views-schema

## Notes / Tech-stack hints
- Calendar grid is hand-rolled (shadcn Calendar component for single-day picker is separate); no external calendar lib required for the monthly board grid
- Accessibility: date cells must have `aria-label="tasks for <date>"`; drag targets `aria-dropeffect="move"`
- Tasks spanning multiple days (start → due) not required in this slice; single `due_date` placement only
