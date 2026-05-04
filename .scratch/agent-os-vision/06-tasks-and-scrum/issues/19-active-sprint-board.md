---
Status: completed
ImplCommit: a1e2e737
ImplRuntime: claude
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [17-sprints-trpc-crud, 11-kanban-board-view]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C4, Q7]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Sprint/scrum/dev cycles row)
Docs: []
---

# Active sprint board — scoped Kanban, header stats, quick-add

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-31, T6-32)

## What to build
SvelteKit route `/projects/<id>/sprint/<sprint_id>` — Kanban scoped to
`sprint_id = active_sprint.id`. Sprint header shows goal, dates, capacity bar,
days remaining. Quick-add inline card per column. Sprint close modal with task
disposition. TUI active-sprint board pane. CLI `fulcrum sprints get --active`.

## Acceptance criteria
- [ ] Web: `/projects/<id>/sprint/<sprint_id>` Kanban renders only tasks with matching `sprint_id`; non-sprint tasks absent
- [ ] Web: sprint header bar — goal text (editable in-place), date range, capacity bar (same component as slice 18), "X days remaining" chip, "Close sprint" button
- [ ] Web: quick-add inline per column — type title in bottom-of-column input + Enter → `tasks.create({sprint_id, status: column_status})` → card appears at bottom of column
- [ ] Web: `/projects/<id>/sprint/<sprint_id>` accessible from sprint list (`active` badge + link) and from board route sprint-filter dropdown
- [ ] Web: sprint close modal (shared from slice 17) accessible via header "Close sprint" button; completion calls `sprints.close` and navigates back to sprint list
- [ ] CLI: `fulcrum sprints get --active --project <id> --json` returns current active sprint with `tasks[]` summary
- [ ] CLI: `fulcrum sprints get --id <sprint_id> --json`
- [ ] TUI: `A` key opens active-sprint board pane — same ASCII Kanban as `b` but scoped to active sprint; header shows goal + days remaining; capacity bar
- [ ] Tests: board renders only sprint-scoped tasks; unsprinted tasks absent from DOM
- [ ] Tests: quick-add creates task with correct sprint_id and column status
- [ ] Tests: sprint goal in-place edit dispatches `sprints.update({goal})` on blur
- [ ] Tests: "Close sprint" → close modal → confirm → `sprints.close` called → redirect to sprint list

## Blocked by
- 17-sprints-trpc-crud
- 11-kanban-board-view

## Notes / Tech-stack hints
- Active sprint board reuses the Kanban component from slice 11 with `sprintId` prop; no new DnD wiring
- "Days remaining" = `sprint.end_date - today`; negative shows "X days overdue" in red
- `/projects/<id>/board?sprint=active` redirect to `/projects/<id>/sprint/<active_sprint_id>` for convenience
