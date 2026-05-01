---
Status: ready-for-agent
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: []
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C2, Q22, Q23]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Jira-grade task management row)
Docs: []
---

# Tasks table schema extension + composite indexes

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-01)

## What to build
Idempotent Drizzle migration that extends the existing `tasks` table with
`sprint_id`, `custom_fields jsonb`, `points int`, `parent_id`, `dependencies jsonb`,
`external_id text`; adds `task_statuses` table with `category` enum CHECK constraint;
adds three composite indexes on `tasks` (`tasks_org_sprint_status`,
`tasks_org_parent`, `tasks_custom_fields_gin`); adds a unique partial index
`tasks_org_external_id WHERE external_id IS NOT NULL`. All columns are
additive (`ADD COLUMN IF NOT EXISTS`). Drizzle schema types + Zod validators
exported from `src/db/schema/tasks.ts`.

## Acceptance criteria
- [ ] Schema migration: `ALTER TABLE tasks` adds all six new columns idempotently; re-run is no-op
- [ ] Schema migration: `task_statuses(id, org_id, project_id, name, color, category, position, is_default)` created with `category IN ('unstarted','started','completed','cancelled')` CHECK constraint and `UNIQUE(project_id, name)`
- [ ] Schema migration: `tasks_org_sprint_status(org_id, sprint_id, status)`, `tasks_org_parent(org_id, parent_id)`, `tasks_custom_fields_gin` GIN index, and `tasks_org_external_id` unique partial index all present (verified via `pg_indexes`)
- [ ] Logic: `TaskRow` Drizzle inferred type carries all new columns with correct nullability
- [ ] Logic: `DependenciesSchema` Zod type `{blocks: uuid[], blocked_by: uuid[]}` validates default `'{}'` shape
- [ ] Logic: `TaskStatusRow` Drizzle + `TaskStatusCategory` enum exported from schema
- [ ] Tests: migration idempotency — apply twice, same schema, no error
- [ ] Tests: FK cascade — delete `sprints` row → `tasks.sprint_id` set null (ON DELETE SET NULL)
- [ ] Tests: `tasks_org_external_id` unique partial rejects duplicate `(org_id, external_id)` where not null
- [ ] Tests: `EXPLAIN` on `WHERE org_id=? AND sprint_id=? AND status=?` query uses `tasks_org_sprint_status`

## Blocked by
None — can start immediately

## Notes / Tech-stack hints
- `dependencies` default value is `'{"blocks":[],"blocked_by":[]}'::jsonb` — set at column level
- `external_id` format: `'jira:<key>'` | `'linear:<uuid>'` | `'github:<number>'` — validated by Zod pattern in the TS type, not at DB level
- `task_statuses` default template seeded in slice 07 (task CRUD baseline); this slice only creates the table
- Failure gate: if PGlite WASM doesn't support GIN on jsonb, fall back to `tasks_custom_fields_btree (org_id, (custom_fields->>'status'))` as a targeted index
