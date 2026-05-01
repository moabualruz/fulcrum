---
Status: ready-for-agent
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/05-dashboard-and-projects-list.md, 06-tasks-and-scrum/issues/02-task-status-engine.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [C4, Q36, Q9]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (row: "Jira-grade task management — only kanban drag")
Docs: https://github.com/isaacHagoel/svelte-dnd-action
---

# Project overview (/projects/[id]) + Kanban board (/projects/[id]/board)

## What to build

`/projects/[id]`: project overview page with quick-nav tabs (Board / Backlog / Sprints / Reports / Repos / Docs) and summary metrics (open tasks, in-progress, done, sprint days remaining). `/projects/[id]/board`: full Kanban using `svelte-dnd-action`; columns are status values from `project.statuses`; swimlane toggle (assignee / label / none); sprint filter header chip; card mini-view (title, priority badge, assignee avatar, due date, estimate). Drag card to new column → `tasks.update(status)` tRPC → `events` INSERT verb=`status_changed`.

Cuts through: `tasks.list(projectId, statusFilter)` tRPC → Kanban rendered → `svelte-dnd-action` drag → `onfinalize` → server action `tasks.update` → DB `status` updated → event emitted → card re-renders in new column.

## Acceptance criteria

- [ ] `/projects/[id]` tabs render; each navigates correct sub-route; summary counts match `tasks.list` aggregate.
- [ ] Kanban: 200 tasks × 7 columns cold load < 300ms (Playwright performance assertion).
- [ ] Drag card: `onconsider` shows ghost; `onfinalize` calls `tasks.update`; DB row updated; event row inserted (`verb='status_changed'`).
- [ ] Swimlane toggle: assignee mode groups cards by assignee; label mode groups by first label; none = flat column.
- [ ] Sprint filter chip: filters board to sprint_id; "All" clears filter.
- [ ] Failure gate: if `svelte-dnd-action` Svelte 5 `onconsider`/`onfinalize` API breaks → `pragmatic-drag-and-drop` fallback; test verifies same board behavior.
- [ ] Playwright: drag card from "todo" to "in_review" → status badge updates; no extra network requests after move.
- [ ] CLI: `fulcrum task list --project <id> --json` returns same tasks (parity).
- [ ] TUI: board screen renders (Pillar 15).

## Blocked by

- Issue 05 (project list) — project tile must exist to navigate here.
- Pillar 6 issue 02 (task status engine) — `tasks.update(status)` + events emit.
