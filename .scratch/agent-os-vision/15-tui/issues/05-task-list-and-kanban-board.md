---
Status: implemented
Triage: AFK
Pillar: tui
Blocked-by: [15/issues/04-dashboard-and-projects.md]
PRD: .scratch/agent-os-vision/prds/15-tui.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 15 section)
Decisions: [C4, Q28]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Jira-grade task management" row)
Docs: []
---

## Parent

Pillar 15 — TUI (OpenTUI, Full Feature Parity)

## What to build

Tasks list pane (VirtualList of tasks, FilterChips for status/assignee/labels, `Space` multi-select, `B` bulk menu → status/assignee bulk update), Task board (ASCII Kanban columns per status, `h`/`l` move task between columns → `tasks.update(status)` tRPC mutation, `Enter` opens task detail, `c` create task inline), Task calendar view (tasks by due_date grid, `←`/`→` week navigation, `Enter` opens detail), Task timeline (ASCII Gantt bars by start/end dates, `←`/`→` scroll, `Enter` detail).

- **Web**: `/projects/[id]/backlog`, `/projects/[id]/board`, board calendar and timeline views.
- **CLI**: `fulcrum tasks list --json`, `fulcrum tasks bulk --json`.
- **TUI**: primary surface.

## Acceptance criteria

- [x] Tasks list: 50 tasks in VirtualList; FilterChips filter applied; `Space` multi-selects; `B` opens bulk menu; bulk status update → all rows updated in DB.
- [x] Kanban board: status columns render; `h`/`l` moves card → `tasks.update` tRPC called; status badge updated; `c` inline create → new task row.
- [x] Calendar view: tasks with `due_date` appear on correct day cell; `←`/`→` switches weeks.
- [x] Timeline: ASCII Gantt bars proportional to task duration; horizontal scroll.
- [x] After TUI `h`/`l` move, web board shows updated column; CLI `fulcrum tasks list --json` reflects.
- [x] FakeTTY snapshot for Kanban board (strip-ansi).

## Blocked by

- 15/issues/04-dashboard-and-projects.md

## Notes

T15-19–T15-22 maps to this slice.
