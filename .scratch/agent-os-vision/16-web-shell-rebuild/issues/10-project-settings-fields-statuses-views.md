---
Status: ready-for-agent
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/09-task-detail-and-bulk-ops.md, 06-tasks-and-scrum/issues/03-task-detail-and-custom-fields.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q9, Q10, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (row: "Jira-grade task management")
Docs: https://kit.svelte.dev/docs
---

# Project settings — /projects/[id]/settings/fields, /statuses, /views, /connectors

## What to build

Four project settings sub-routes. `/settings/fields`: custom field CRUD UI — add field (name, type selector, required toggle, options for select/multi-select), edit, archive; field order drag-and-drop. `/settings/statuses`: status config — add status (name, color), reorder, mark as final state, delete. `/settings/views`: saved views management — list org/project/private scoped views, set default, share with user/team, delete. `/settings/connectors`: per-connector config cards (gated per connector flag); shows enabled/disabled toggle and config form for enabled connectors.

Cuts through: `customFields.list(projectId)` tRPC → field list renders → "Add Field" → form → `customFields.create` → list updates. Same pattern for statuses, views.

## Acceptance criteria

- [ ] Custom fields: create text field → appears in task detail form; create select field with 3 options → select renders in task; archive field → hidden from task form but data preserved.
- [ ] Statuses: add status → appears as Kanban column; reorder via drag → board column order updates; mark final → tasks in status count as done in burndown.
- [ ] Saved views: create view (status=open + priority=high), set as default → board loads with filter pre-applied; share with team → other team member sees it; delete → gone.
- [ ] Connectors: `connector-jira` OFF → card shows "Enable via feature flags"; ON → config form renders (host, email, token), sync button calls `connectors.sync`.
- [ ] Playwright: full field CRUD + status CRUD + view save/load cycle.
- [ ] CLI: `fulcrum field list --project <id> --json`; `fulcrum view list --project <id> --json`.
- [ ] TUI: field list and status list screens (Pillar 15).

## Blocked by

- Issue 09 (task detail) — custom fields must render in task form.
- Pillar 6 issue 03 (custom fields) — `customFields.*` tRPC must be available.
