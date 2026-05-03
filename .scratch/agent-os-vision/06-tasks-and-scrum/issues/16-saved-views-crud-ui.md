---
Status: in-progress
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [04-saved-views-schema, 07-task-crud-baseline]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C4, Q10]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Jira-grade task management row)
Docs: []
---

# Saved views CRUD + filter form + share scope

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-06, T6-27, T6-41)

## What to build
tRPC `savedViews.*` (list/get/create/update/delete/setDefault) with scope permission
checks; Web filter builder (chip-based) that composes the `SavedViewQuery` AST with
"Save as view" action; Web Settings → Views tab listing saved views with share controls;
CLI `fulcrum views *`; TUI view selector.

## Acceptance criteria
- [ ] tRPC `savedViews.list(projectId)`: returns `private` (own) + `project` + `org` scoped views; excludes other users' `private` views
- [ ] tRPC `savedViews.create`: creates with given scope; `org` scope requires admin permission; `private` scope only own user
- [ ] tRPC `savedViews.setDefault({id, context})`: sets `default_for = context`; unsets previous default for same context
- [ ] tRPC `savedViews.delete`: owner or admin only
- [ ] Web filter builder: chip-based UI above table/list/board views; each chip shows `field op value`; "Add filter" opens shadcn-svelte Command picker; "Save as view" dialog prompts name + scope + view type → calls `savedViews.create`
- [ ] Web: loading a saved view restores filter chips AND view type (navigates to correct route + applies query)
- [ ] Web: URL params (transient view) encode same AST as `query_json` — entering the URL restores filters without saved view
- [ ] Web Settings → Views tab (`/projects/<id>/settings/views`): list views with scope badge; set-default button; share to project/org; delete
- [ ] CLI: `fulcrum views list --project <id> --json` returns typed array
- [ ] CLI: `fulcrum views create --name "My View" --query-json '...' --view-type table --project <id> --json`
- [ ] TUI: `V` opens view selector popover in list panel; selecting a view filters tasks list
- [ ] Tests: `savedViews.list` excludes other users' private views
- [ ] Tests: `org` scope create rejected for non-admin user (403)
- [ ] Tests: filter chip "Save as view" round-trips query_json correctly
- [ ] Tests: URL param encoding/decoding preserves all AST fields
- [ ] Tests: `setDefault` unsets previous default for same context

## Blocked by
- 04-saved-views-schema
- 07-task-crud-baseline

## Notes / Tech-stack hints
- URL params encoding: `btoa(JSON.stringify(query))` → `view` query param; decode on mount
- `shared_with_users` and `shared_with_teams` fields in DB; UI exposes team sharing only when ABAC gated slice (`casbin-policies`) is on — otherwise only scope `private|project|org`
