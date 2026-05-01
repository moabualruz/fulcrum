---
Status: ready-for-agent
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: None
---

# Schema migration: workflow_definitions table + tasks eligibility columns

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Drizzle migration that creates `workflow_definitions` and adds `blocked_by_ids UUID[]` + `workflow_id TEXT` to `tasks`. Add composite indexes: `(org_id, COALESCE(project_id, '00000000…'), name)` unique on `workflow_definitions`; `(org_id, project_id)` on `workflow_definitions`; `(org_id, status, priority, created_at)` partial on `tasks WHERE status = 'ready'`. Schema is `org_id`-scoped from day 1 per C2.

## Acceptance criteria
- [ ] Schema / state machine: `workflow_definitions` table exists with columns `id, org_id, project_id, name, config_yaml, prompt_md, created_at, updated_at`; unique + list indexes present; `tasks.blocked_by_ids` and `tasks.workflow_id` columns added
- [ ] Tracker adapter: N/A
- [ ] Dispatch loop / hooks: N/A
- [ ] Surfaces (web/cli/tui parity): N/A (schema-only slice)
- [ ] Tests: migration rolls forward and backward cleanly; index names are present in Drizzle introspection output
- [ ] SPEC conformance traced in `docs/symphony-conformance.md`: N/A

## Blocked by
None

## Notes
`project_id` nullable = org-wide default workflow. COALESCE trick in unique index handles NULL `project_id`. No UI wired yet; surface comes in slice 14.
