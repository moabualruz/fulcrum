---
Status: ready-for-agent
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/06-project-overview-and-kanban-board.md, 06-tasks-and-scrum/issues/04-sprints-and-velocity.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q7, Q36, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (row: "Sprint / scrum / dev cycles interactive monitoring")
Docs: https://tanstack.com/table/latest/docs/framework/svelte/svelte-table
---

# Backlog (/projects/[id]/backlog), Sprints list (/projects/[id]/sprints), Active Sprint board (/projects/[id]/sprint/[sid])

## What to build

Three routes covering the full sprint lifecycle. `/projects/[id]/backlog`: TanStack Table (with TanStack Virtual for 1k+ rows) showing all unscheduled tasks; sprint planning side panel (drag task from table → sprint panel via `svelte-dnd-action`; capacity bar updates per story-point total). `/projects/[id]/sprints`: list of sprints (planned/active/completed) with velocity sparklines (LayerChart); "New Sprint" button. `/projects/[id]/sprint/[sid]`: active sprint Kanban scoped to `sprint_id`; days-remaining header; inline quick-add task.

Cuts through: `sprints.list(projectId)` tRPC → sprint rows → velocity sparkline from `metrics_cache` → click sprint → `/sprint/[sid]` → `tasks.list(sprintId)` → active kanban renders.

## Acceptance criteria

- [ ] Backlog: 1000 tasks no blank rows (TanStack Virtual scroll assertion); sort by priority/assignee/due_date; drag task to sprint panel → `tasks.update(sprint_id)` called.
- [ ] Sprint planning panel: capacity bar shows `sum(estimate)` / sprint capacity; add task → capacity updates without reload.
- [ ] Sprints list: planned/active/completed sections; velocity sparkline from `metrics_cache` (3-sprint window); "New Sprint" dialog creates `sprints` row; "Start Sprint" moves sprint to active.
- [ ] Active sprint board: only tasks with `sprint_id=sid`; days-remaining calculated from `sprints.end_date`; inline quick-add creates task with `sprint_id` pre-set.
- [ ] Playwright: create sprint → add 3 tasks from backlog → start sprint → board shows tasks.
- [ ] CLI: `fulcrum sprint list --project <id> --json`; `fulcrum task create --sprint <sid> --json`.
- [ ] TUI: sprint board screen (Pillar 15).

## Blocked by

- Issue 06 (Kanban board) — project overview navigation must exist.
- Pillar 6 issue 04 (sprints and velocity) — `sprints` schema and `metrics_cache` rollup.
