---
Status: ready-for-agent
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: []
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C2, Q9, Q22]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Jira-grade task management row)
Docs: []
---

# Custom field defs schema + types + defaults seeder

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-01, T6-05)

## What to build
MikroORM v7 migration creating the `CustomFieldDef` entity (`src/db/entities/tasks/CustomFieldDef.ts`) with all properties, `type IN ('text','select','multi_select','number','date','user','url','json')` CHECK constraint, `UNIQUE(project_id, slug)`, composite index `custom_field_defs_org_project(org_id, project_id)`. Includes a `seedDefaultFields(projectId, orgId)` helper that upserts the nine canonical defaults (`status`, `priority`, `assignee`, `due_date`, `estimate`, `parent`, `tags`, `repo`, `sprint`) via `customFieldDefRepo.upsert(...)` on project creation; seeder idempotent (upsert on `(project_id, slug)` conflict). Per-type `configJson` Zod discriminated union exported from `src/db/entities/tasks/CustomFieldDef.ts`.

## Acceptance criteria
- [ ] Migration class: `CustomFieldDef` entity table created; idempotent (`mikro-orm migration:up` twice = no-op)
- [ ] Migration class: `type` CHECK constraint rejects unknown types
- [ ] Migration class: `UNIQUE(project_id, slug)` rejects duplicate slug per project
- [ ] Migration class: `custom_field_defs_org_project` composite index present
- [ ] Logic: `CustomFieldDef` MikroORM entity type exported
- [ ] Logic: `CustomFieldConfigSchema` Zod discriminated union (one schema per type) validates `configJson`; e.g. `select` requires `options: [{value, label, color}][]`; `number` allows `{unit, decimals, min, max}`
- [ ] Logic: `seedDefaultFields(projectId, orgId)` upserts nine rows on project create; second call is no-op
- [ ] Tests: migration class idempotency
- [ ] Tests: `type` CHECK violation via repository insert
- [ ] Tests: `UNIQUE(project_id, slug)` violation on duplicate slug via repository insert
- [ ] Tests: `seedDefaultFields` runs twice — repository count stays at 9
- [ ] Tests: each type's `configJson` validated by discriminated union (happy path + bad shape rejects)

## Blocked by
None — can start immediately (parallel to slices 01 and 02)

## Notes / Tech-stack hints
- `archived` column: values in `tasks.custom_fields jsonb` are preserved; archived fields are filtered from UI by the tRPC layer, not deleted from DB
- `position` column drives field order in task detail page renderer
- `required` boolean: tRPC `tasks.update` procedure enforces required fields before persisting
- Seeder should be called from project-creation tRPC procedure (Pillar 1 project CRUD); this slice only implements the helper
