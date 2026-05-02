---
Status: ready-for-agent
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [17-sprints-trpc-crud, 11-kanban-board-view]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C4, Q7]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Sprint/scrum/dev cycles row)
Docs: []
---

# Sprint planning board — drag from backlog, capacity preview

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-30)

## What to build
SvelteKit `/projects/<id>/backlog` route with side-by-side sprint planning split:
left pane = backlog (unsprinted tasks via TanStack Table); right pane = target sprint
tasks. `svelte-dnd-action` cross-container drag. Capacity bar = `sum(points)` vs
`sprints.capacity_points`. Over-capacity warning. Backlog filter by priority/assignee/
label. CLI: `fulcrum sprints add-task`. TUI: `p` planning split + `m` move task.

## Acceptance criteria
- [ ] Web: `/projects/<id>/backlog` two-pane layout — left "Backlog" column, right "Sprint" column; sprint selector dropdown in header
- [ ] Web: `svelte-dnd-action` cross-container drag — drag task from backlog to sprint pane → `sprints.addTask` called optimistically; drag back → `sprints.removeTask`
- [ ] Web: capacity bar below sprint header — `sum(estimate_points)` for tasks in sprint vs `capacity_points`; renders as progress bar; turns amber at >80%, red at >100% with "Over capacity" warning chip
- [ ] Web: backlog filter bar — filter by priority/assignee/label using `SavedViewQuery` chips; filter applies to backlog pane only
- [ ] Web: backlog pane shows unsprinted tasks sorted by priority desc; sprint pane shows sprint tasks sorted by priority desc
- [ ] CLI: `fulcrum sprints add-task --sprint-id <id> --task-id <id> --json` calls `sprints.addTask`
- [ ] CLI: `fulcrum sprints remove-task --sprint-id <id> --task-id <id> --json`
- [ ] TUI: `p` key in sprints panel opens planning split; left = backlog list, right = sprint list; `m` moves selected backlog task to current sprint; capacity bar in right pane header
- [ ] Tests: cross-container drag moves task from backlog to sprint pane (Playwright `dragAndDrop`)
- [ ] Tests: capacity bar turns red when sum(points) > capacity_points
- [ ] Tests: backlog filter by priority=high shows only high-priority tasks
- [ ] Tests: CLI `add-task` + `remove-task` round-trip

## Blocked by
- 17-sprints-trpc-crud
- 11-kanban-board-view (shares `svelte-dnd-action` setup)

## Notes / Tech-stack hints
- If sprint has no `capacity_points` set, capacity bar is hidden (not shown as 0%)
- Cross-container DnD: `svelte-dnd-action` `dropTargetStyle` + `flipDurationMs` keep animation smooth
- "Backlog" query: `WHERE sprint_id IS NULL AND status.category != 'completed'`
