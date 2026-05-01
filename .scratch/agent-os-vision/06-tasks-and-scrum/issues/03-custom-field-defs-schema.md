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
Idempotent migration that creates `custom_field_defs` with all columns,
`type IN ('text','select','multi_select','number','date','user','url','json')`
CHECK constraint, `UNIQUE(project_id, slug)`, composite index
`custom_field_defs_org_project(org_id, project_id)`. Includes a `seedDefaultFields(projectId)`
helper that inserts the nine canonical defaults (`status`, `priority`, `assignee`,
`due_date`, `estimate`, `parent`, `tags`, `repo`, `sprint`) at project creation
time; seeder is idempotent (`INSERT … ON CONFLICT DO NOTHING`). Per-type `config_json`
Zod discriminated union exported from `src/db/schema/custom-fields.ts`.

## Acceptance criteria
- [ ] Schema migration: `custom_field_defs` created with all columns; re-run is no-op
- [ ] Schema migration: `type` CHECK constraint rejects unknown types
- [ ] Schema migration: `UNIQUE(project_id, slug)` rejects duplicate slug per project
- [ ] Schema migration: `custom_field_defs_org_project` composite index present
- [ ] Logic: `CustomFieldDefRow` Drizzle inferred type exported
- [ ] Logic: `CustomFieldConfigSchema` discriminated union (one Zod schema per type) validates `config_json`; e.g. `select` requires `options: [{value, label, color}][]`; `number` allows `{unit, decimals, min, max}`
- [ ] Logic: `seedDefaultFields(projectId, orgId)` inserts nine rows on project create; second call is no-op
- [ ] Tests: migration idempotency
- [ ] Tests: `type` CHECK violation
- [ ] Tests: `UNIQUE(project_id, slug)` violation on duplicate slug
- [ ] Tests: `seedDefaultFields` runs twice — row count stays at 9
- [ ] Tests: each type's `config_json` validated by discriminated union (happy path + bad shape rejects)

## Blocked by
None — can start immediately (parallel to slices 01 and 02)

## Notes / Tech-stack hints
- `archived` column: values in `tasks.custom_fields jsonb` are preserved; archived fields are filtered from UI by the tRPC layer, not deleted from DB
- `position` column drives field order in task detail page renderer
- `required` boolean: tRPC `tasks.update` procedure enforces required fields before persisting
- Seeder should be called from project-creation tRPC procedure (Pillar 1 project CRUD); this slice only implements the helper
