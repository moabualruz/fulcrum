---
Status: ready-for-agent
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: []
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C2, Q10, Q22, Q27]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Jira-grade task management row)
Docs: []
---

# Saved views schema + filter AST type

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-01, T6-06, T6-09)

## What to build
MikroORM v7 migration creating the `SavedView` entity (`src/db/entities/tasks/SavedView.ts`) with all properties, `scope IN ('private','project','org')` and `view_type IN ('kanban','table','calendar','timeline','list')` CHECK constraints, two composite indexes (`saved_views_org_project`, `saved_views_created_by`). In parallel, implement `src/filters/ast.ts` — the `SavedViewQuery` TypeScript type + Zod schema + MikroORM query compiler that translates the typed AST into a MikroORM `FindOptions` / `FilterQuery` expression supporting all eight operators (`eq|neq|in|nin|gt|lt|contains|is_empty|is_not_empty`), FTS `text` fragment, facets, and `custom_fields->>'slug'` lookups.

## Acceptance criteria
- [ ] Migration class: `SavedView` entity table created idempotently
- [ ] Migration class: `scope` and `view_type` CHECK constraints reject invalid values
- [ ] Migration class: `saved_views_org_project` and `saved_views_created_by` indexes present
- [ ] Migration class: FK `createdBy → users(id)` enforced; FK `project → projects(id) ON DELETE CASCADE` enforced
- [ ] Logic: `SavedViewQuery` TypeScript type and matching Zod schema exported from `src/filters/ast.ts`
- [ ] Logic: `compileSavedViewQuery(q: SavedViewQuery): FilterQuery<Task>` returns MikroORM filter expression
- [ ] Logic: `custom_fields->>'slug'` filter compiles to MikroORM `{ customFields: { $like: ... } }` or raw path operator
- [ ] Logic: `is_empty` / `is_not_empty` compile to `$eq: null` / `$ne: null` (or `$eq: ''` for text fields)
- [ ] Logic: FTS `text` field compiles to MikroORM `{ title: { $like: '%…%' } }` always-on path; Pillar 11 swap documented in comment
- [ ] Tests: each of the eight operators round-trips from JSON → compiled filter (unit, no DB needed)
- [ ] Tests: migration class idempotency
- [ ] Tests: scope violation and view_type violation CHECK tests via repository insert
- [ ] Tests: `compileSavedViewQuery` with empty query returns no filter (all tasks)
- [ ] Tests: facets filter (`status`, `priority`, `assignee`, `sprint`) compile correctly

## Blocked by
None — can start immediately (parallel to slices 01–03)

## Notes / Tech-stack hints
- `query_json` stores the serialised `SavedViewQuery`; `order_by` stores `[{field, dir}]` array — separate Zod type `OrderByClause`
- `default_for` is a freeform tag (e.g. `'project-board'`) allowing one view to be the default landing for a given context
- `sharedWithUsers` and `sharedWithTeams` are Postgres arrays — MikroORM maps via `@Property({ type: 'array' })`
- This AST is shared with Pillar 11 (search) per Q27 — keep `src/filters/ast.ts` in a shared location importable by both pillars
