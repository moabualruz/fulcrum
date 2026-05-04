---
Status: completed
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [01-tasks-schema-extension, 02-sprints-schema, 03-custom-field-defs-schema]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C4, Q9, Q22, Q28]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Jira-grade task management row)
Docs: []
---

# Task CRUD baseline — tRPC + Web detail + CLI + TUI

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-02, T6-03, T6-10, T6-11, T6-15, T6-16, T6-18, T6-42)

## What to build
End-to-end task management: tRPC `tasks.*` procedures (list/get/create/update/delete/
addComment/listComments/addWatcher/removeWatcher); tRPC `taskStatuses.*` procedures
(list/create/update/delete/reorder) with default seeding on project create; task
detail page (modal + full-page route); activity feed; comments thread; keyboard
shortcuts; CLI `fulcrum tasks *`; TUI tasks panel (list + detail pane + inline create).

## Acceptance criteria
- [ ] Schema: `task_statuses` default template (`backlog→todo→in_progress→in_review→blocked→done→cancelled`) seeded on `projects.create`; at-least-one-`completed` guard rejects delete that would remove last completed status
- [ ] tRPC `tasks.list`: accepts `SavedViewQuery` filter (from slice 04 AST), returns paginated tasks with all columns
- [ ] tRPC `tasks.create` / `update` / `delete` (soft, sets `deleted_at`): Zod-validated, emits `events` row per mutation; `tasks.delete` cascades watchers and comments
- [ ] tRPC `tasks.addComment` / `listComments`: threaded markdown comments; edit/delete by author only; reactions stored in `comment_reactions` jsonb
- [ ] tRPC `tasks.addWatcher` / `removeWatcher`: emits `watcher_added` event consumed by Pillar 12
- [ ] tRPC `taskStatuses.reorder`: updates `position` field transactionally for all affected rows
- [ ] Web: task detail modal (router-modal pattern — URL updates to `/projects/<id>/tasks/<task_id>`, background view preserved; `Escape` closes)
- [ ] Web: task detail full-page route `/projects/<id>/tasks/<task_id>` — all sections visible (title, description stub, status, priority, assignee, due date, labels, sprint, points, watchers, activity feed, comments)
- [ ] Web: activity feed renders `status_changed`, `comment_added`, `watcher_added`, `sprint_moved` events; paginates via `events` table
- [ ] Web: comments thread — create/edit/delete, markdown render via `remark`, reactions
- [ ] Web: keyboard shortcuts (`e` title, `a` assign, `s` status, `p` priority, `l` label, `d` due date, `[`/`]` prev/next task) registered via Svelte `on:keydown` with `use:shortcut` action
- [ ] CLI: `fulcrum tasks list|get|create|update|delete|comment` — all `--json`; flag aliases; Zod-validated error messages
- [ ] CLI: `fulcrum tasks list --status <name>` accepts custom status names
- [ ] TUI: tasks list panel — 50 tasks render without blank rows; `Enter` opens detail pane; `c` inline create
- [ ] TUI: task detail pane — all sections; edit flow for title/status/assignee via inline edit
- [ ] Tests: tRPC CRUD round-trip (create → get → update → soft-delete → not in list)
- [ ] Tests: `at-least-one-completed` guard rejects deletion of last completed status
- [ ] Tests: comment edit/delete by non-author rejected (403)
- [ ] Tests: keyboard shortcut `s` opens status picker in unit test (jsdom)
- [ ] Tests: `--json` output matches tRPC return type Zod schema

## Blocked by
- 01-tasks-schema-extension
- 02-sprints-schema
- 03-custom-field-defs-schema

## Notes / Tech-stack hints
- `assertPermission()` on every tRPC procedure (C4 rule from Pillar 1)
- Task description is a plain `text` field in this slice; TipTap integration lands in slice 08 (subtasks + dependencies) or can be a follow-on; stub with `<Textarea>` in the detail pane
- Activity feed queries `events WHERE subject_id = task_id ORDER BY created_at DESC` paginated with cursor
- Pillar 12 (notifications) consumes `watcher_added`/`mention` events; this slice only emits them
