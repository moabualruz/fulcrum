---
Status: ready-for-agent
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/06-project-overview-and-kanban-board.md, 06-tasks-and-scrum/issues/03-task-detail-and-custom-fields.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q9, Q10, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (row: "Jira-grade task management — no detail page")
Docs: https://tanstack.com/table/latest/docs, https://tiptap.dev/docs
---

# Task detail (/tasks/[id]) + bulk operations + alternate views (table/calendar/Gantt)

## What to build

`/tasks/[id]`: full-page task detail route + modal-router pattern (card click opens modal; URL updates; Esc closes; direct URL renders full-page). All sections: TipTap description (read-only mode when no edit permission; edit on click), subtasks list, dependency links (blocked-by chips), assignee avatar picker, due date picker, priority badge selector, labels combobox, sprint selector, custom fields rendered per `custom_field_defs` config, comments thread (with @mentions), activity feed (events for this task), attachment list, watcher toggle. Task keyboard shortcuts: `e` title edit, `a` assign, `s` status picker, `p` priority, `d` due, `l` labels. Bulk operation bar: shift+click selects range; floating bar with bulk status/assign/sprint/delete. Alternate views: `view=table` (TanStack Table), `view=calendar` (drag-to-reschedule), `view=timeline` (svelte-gantt). Saved-view filter chip composer + save dialog.

Cuts through: `tasks.get(id)` tRPC → all sections render → TipTap loads description JSON → autosave `tasks.update(description)` → `doc_versions` delta written.

## Acceptance criteria

- [ ] Modal pattern: card click updates URL + opens modal overlay; Esc closes; direct URL renders full-page (both tested in Playwright).
- [ ] All sections render with seed data: description (TipTap JSON), 3 subtasks, 1 blocked-by, assignee, due, priority, labels, sprint, 2 custom fields, 2 comments, 5 activity events, 1 attachment.
- [ ] Autosave: type in description → 1000ms debounce → `tasks.update` called → "Saved" indicator.
- [ ] Keyboard shortcuts: `e`, `a`, `s`, `p`, `d`, `l` each trigger overlay; `Esc` closes; no conflict with system shortcuts.
- [ ] Bulk ops: shift+click 5 tasks → floating bar shows count; bulk status → all 5 updated; bulk delete → confirmation dialog → all deleted.
- [ ] `view=table`: TanStack Table sorts; `view=calendar`: task appears on due date, drag reschedules; `view=timeline`: svelte-gantt dependency arrows render.
- [ ] Saved view: build filter (status=open + assignee=me), save, refresh → filter restored from `saved_views` tRPC.
- [ ] Playwright: create task, open detail, edit description, add comment, close.
- [ ] CLI: `fulcrum task get <id> --json`; `fulcrum task update <id> --status in_review --json`.

## Blocked by

- Issue 06 (Kanban board) — card click triggers modal.
- Pillar 6 issue 03 (task detail + custom fields) — `tasks.get` full payload + custom field rendering.
