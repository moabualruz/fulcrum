---
Status: ready-for-agent
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [02-sprints-schema, 07-task-crud-baseline]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C4, Q7]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Sprint/scrum/dev cycles row)
Docs: []
---

# Sprints tRPC CRUD + start + close + CLI + TUI

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-04, T6-29, T6-43, T6-48)

## What to build
tRPC `sprints.*` (list/get/create/start/close/addTask/removeTask) with all business
rules; Web sprint list page; CLI `fulcrum sprints *`; TUI sprints panel. Sprint close
modal disposition + retrospective doc stub. `sprints.close` emits `sprint.closed`
event (Pillar 7 listener creates postmortem doc when that pillar is available).

## Acceptance criteria
- [ ] tRPC `sprints.create`: validates `start_date < end_date`; sets `status='planned'`
- [ ] tRPC `sprints.start`: checks no other `active` sprint for project (at-most-one-active guard with friendly error); sets `status='active'`; emits `sprint.started` event
- [ ] tRPC `sprints.close({id, unfinishedDisposition: 'next-sprint' | 'backlog', taskDispositions?: {taskId, disposition}[]})`: sets `status='completed'`; moves unfinished tasks per disposition; records final metrics snapshot to `metrics_cache`; emits `sprint.closed` event
- [ ] tRPC `sprints.addTask(sprintId, taskId)`: sets `tasks.sprint_id`
- [ ] tRPC `sprints.removeTask(sprintId, taskId)`: sets `tasks.sprint_id = null`
- [ ] Web sprint list page (`/projects/<id>/sprints`): groups sprints by status (planned/active/completed); each row shows name, dates, task count, velocity sparkline (from metrics_cache); "Start sprint" button for planned, "Close sprint" for active
- [ ] Web sprint close modal: lists unfinished tasks with per-task disposition picker (next sprint / backlog); global default picker; confirm button calls `sprints.close`
- [ ] CLI: `fulcrum sprints list|get|create|start|close --project <id> --json`
- [ ] CLI: `fulcrum sprints close --id <id> --unfinished-to-backlog --json` (non-interactive); without flag → interactive per-task disposition prompt
- [ ] TUI: sprints panel lists sprints; `p` opens planning split view (backlog | sprint column); `Enter` on active sprint opens active sprint board; `m` moves selected task to sprint
- [ ] Tests: `sprints.start` with existing active sprint returns `at_most_one_active` error (not DB constraint — friendly tRPC error before DB hit)
- [ ] Tests: `sprints.close` moves unfinished tasks to backlog correctly; metrics snapshot written to `metrics_cache`
- [ ] Tests: `sprint.closed` event emitted with `{sprint_id, project_id}`
- [ ] Tests: CLI `close --unfinished-to-backlog` non-interactive path returns `{closed: true}` JSON

## Blocked by
- 02-sprints-schema
- 07-task-crud-baseline

## Notes / Tech-stack hints
- Pillar 7 (docs taxonomy) owns `doc_type='postmortem'` creation; this slice only emits `sprint.closed` event; if Pillar 7 not shipped, retrospective doc is skipped gracefully
- `sprint.closed` event payload: `{sprint_id, project_id, org_id, metrics_snapshot: MetricsCacheRow}`
- Velocity sparkline reads last 3 completed sprints' `points_completed` from `metrics_cache`
