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
Idempotent migration creating `saved_views` with all columns, `scope IN
('private','project','org')` and `view_type IN ('kanban','table','calendar',
'timeline','list')` CHECK constraints, two composite indexes
(`saved_views_org_project`, `saved_views_created_by`). In parallel,
implement `src/filters/ast.ts` — the `SavedViewQuery` TypeScript type +
Zod schema + SQL-WHERE compiler that translates the typed AST into a
parameterised Drizzle `where()` clause supporting all eight operators
(`eq|neq|in|nin|gt|lt|contains|is_empty|is_not_empty`), FTS `text` fragment,
facets, and `custom_fields->>'slug'` lookups.

## Acceptance criteria
- [ ] Schema migration: `saved_views` table created idempotently with all columns
- [ ] Schema migration: `scope` and `view_type` CHECK constraints reject invalid values
- [ ] Schema migration: `saved_views_org_project` and `saved_views_created_by` indexes present
- [ ] Schema migration: FK `created_by → users(id)` enforced; FK `project_id → projects(id) ON DELETE CASCADE` enforced
- [ ] Logic: `SavedViewQuery` TypeScript type and matching Zod schema exported from `src/filters/ast.ts`
- [ ] Logic: `compileSavedViewQuery(q: SavedViewQuery): SQL` returns parameterised Drizzle SQL fragment
- [ ] Logic: `custom_fields->>'slug'` filter compiles to `tasks.custom_fields->>'<slug>'` jsonb path lookup
- [ ] Logic: `is_empty` / `is_not_empty` compile to `IS NULL` / `IS NOT NULL` (or `= ''` for text fields)
- [ ] Logic: FTS `text` field compiles to `tasks.title ILIKE '%…%'` always-on path; future Pillar 11 swap documented in comment
- [ ] Tests: each of the eight operators round-trips from JSON → compiled SQL (unit, no DB needed)
- [ ] Tests: migration idempotency
- [ ] Tests: scope violation and view_type violation CHECK tests
- [ ] Tests: `compileSavedViewQuery` with an empty query returns no WHERE clause (all tasks)
- [ ] Tests: facets filter (`status`, `priority`, `assignee`, `sprint`) compile correctly

## Blocked by
None — can start immediately (parallel to slices 01–03)

## Notes / Tech-stack hints
- `query_json` stores the serialised `SavedViewQuery`; `order_by` stores `[{field, dir}]` array — separate Zod type `OrderByClause`
- `default_for` is a freeform tag (e.g. `'project-board'`) allowing one view to be the default landing for a given context
- `shared_with_users uuid[]` and `shared_with_teams uuid[]` are Postgres arrays — Drizzle maps these with `pgArray`
- This AST is shared with Pillar 11 (search) per Q27 — keep `src/filters/ast.ts` in a shared location importable by both pillars
