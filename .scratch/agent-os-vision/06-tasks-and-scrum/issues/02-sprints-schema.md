---
Status: ready-for-agent
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: []
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C2, Q7, Q22]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Sprint/scrum/dev cycles row)
Docs: []
---

# Sprints schema + at-most-one-active constraint

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-01)

## What to build
Idempotent Drizzle migration that creates the `sprints` table with all columns,
`status IN ('planned','active','completed')` CHECK constraint, composite index
`sprints_org_project_status(org_id, project_id, status)`, and the partial unique
index `sprints_one_active_per_project(project_id) WHERE status = 'active'` that
enforces the at-most-one-active invariant at the DB level. `SprintRow` Drizzle
type + `SprintStatus` enum exported from `src/db/schema/sprints.ts`.

## Acceptance criteria
- [ ] Schema migration: `sprints` table created idempotently with all columns and FK to `orgs`, `projects`
- [ ] Schema migration: `status` CHECK constraint rejects values outside `('planned','active','completed')`
- [ ] Schema migration: `sprints_org_project_status` composite index present
- [ ] Schema migration: `sprints_one_active_per_project` partial unique index present — verified by attempting to insert two `active` sprints for the same project and receiving a unique violation
- [ ] Logic: `SprintRow` inferred type; `SprintStatus` enum (`planned | active | completed`) exported
- [ ] Logic: `CreateSprintInput` Zod schema validates `start_date < end_date`
- [ ] Tests: migration idempotency (apply twice, no error)
- [ ] Tests: `status` CHECK violation test
- [ ] Tests: inserting second `active` sprint for same project raises unique violation; first `active` + second `planned` succeeds
- [ ] Tests: FK cascade — delete `projects` row → sprint cascade deleted

## Blocked by
None — can start immediately (parallel to slice 01)

## Notes / Tech-stack hints
- `capacity_points` is nullable — project may not use story points
- `goal` is nullable — goal is optional at sprint creation
- The at-most-one-active partial unique index is the canonical enforcement mechanism; the application-layer `start` procedure must still check and raise a user-friendly error before hitting the DB constraint
