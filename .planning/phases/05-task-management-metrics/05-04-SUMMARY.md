---
phase: 05-task-management-metrics
plan: "04"
subsystem: services/workflow-relationships
tags: [workflow, relationships, cycle-detection, templates, recurrence, trpc]
dependency_graph:
  requires:
    - src/db/entities/tasks/TaskRelationship.ts
    - src/db/entities/tasks/TaskTemplate.ts
    - src/db/entities/tasks/TaskRecurrenceRule.ts
    - src/db/entities/tasks/TaskWatcher.ts
  provides:
    - src/services/WorkflowService.ts
    - src/services/RelationshipService.ts
    - src/services/TemplateService.ts
    - src/services/RecurrenceService.ts
    - src/server/trpc/routers/workflows.ts
    - src/server/trpc/routers/relationships.ts
    - src/server/trpc/routers/templates.ts
    - src/server/trpc/routers/recurrence.ts
    - src/db/entities/tasks/Project.ts
  affects:
    - src/db/entities/tasks/ (added Project.ts)
tech_stack:
  added: []
  patterns:
    - Service constructor(em: EntityManager) pattern
    - TRPCError NOT_FOUND/BAD_REQUEST/CONFLICT for domain errors
    - DFS with max-depth guard for cycle detection
    - permissionedProcedure for all endpoints
key_files:
  created:
    - src/db/entities/tasks/Project.ts
    - src/services/WorkflowService.ts
    - src/services/WorkflowService.test.ts
    - src/services/RelationshipService.ts
    - src/services/RelationshipService.test.ts
    - src/services/TemplateService.ts
    - src/services/RecurrenceService.ts
    - src/server/trpc/routers/workflows.ts
    - src/server/trpc/routers/relationships.ts
    - src/server/trpc/routers/templates.ts
    - src/server/trpc/routers/recurrence.ts
  modified: []
decisions:
  - "Project entity created as minimal stub for workflow_config/methodology columns — Plan 01 migration owns DDL"
  - "DFS cycle detection max depth 50 prevents DoS without hard recursion limit (T-05-09)"
  - "Permissive transition default — empty workflow_config = all transitions allowed (D-23)"
  - "getBlockedItems scoped to org only (no projectId on Task entity yet); comment notes future projectId filter"
  - "RecurrenceService.processDue uses TaskService.create for task cloning — no duplicate logic needed"
  - "markAsDuplicate uses sourceTaskId as createdBy reference for system action"
metrics:
  duration: "18 minutes"
  completed_date: "2026-05-05"
  tasks_completed: 2
  files_created: 11
  files_modified: 0
---

# Phase 05 Plan 04: WorkflowService + RelationshipService Summary

WorkflowService (transition validation + scrum/kanban/none presets, D-22..D-25) and RelationshipService (full CRUD + DFS cycle detection, HIGH-04 fix) with tRPC surfaces. TemplateService (D-115) and RecurrenceService (D-116) also implemented. 20 unit tests green.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 (RED) | Add failing tests + entity deps | a1a9e28c | WorkflowService.test.ts, RelationshipService.test.ts, Project.ts + 4 entity files |
| 1 (GREEN) | Implement WorkflowService + RelationshipService | d4b160c4 | WorkflowService.ts, RelationshipService.ts |
| 2 | Create 4 tRPC routers + TemplateService + RecurrenceService | fd733333 | 6 new files |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Project entity missing from codebase**
- **Found during:** Task 1 setup
- **Issue:** Plan references `project.workflowConfig`/`project.methodology` but no Project entity existed. Plan 01 migration created the columns, Plan 04 needed the entity to query them.
- **Fix:** Created minimal `src/db/entities/tasks/Project.ts` with only the columns needed by WorkflowService.
- **Files modified:** `src/db/entities/tasks/Project.ts`
- **Commit:** a1a9e28c

**2. [Rule 3 - Blocking] Worktree missing entity files from Plan 02**
- **Found during:** Task 1 setup
- **Issue:** Worktree branch predated Phase 05 Plan 02 entity commits (TaskRelationship, TaskTemplate, etc.)
- **Fix:** Merged `origin/dev/v1.0` into worktree branch, then copied missing entity files.
- **Files modified:** TaskRelationship.ts, TaskTemplate.ts, TaskRecurrenceRule.ts, TaskWatcher.ts
- **Commit:** a1a9e28c

**3. [Rule 1 - Bug] RecurrenceService.processDue used wrong TaskService.create signature**
- **Found during:** Task 2 implementation
- **Issue:** Plan spec called `taskService.create(orgId, null, {...})` but actual signature is `taskService.create(orgId, {...})`
- **Fix:** Removed spurious `null` argument
- **Files modified:** RecurrenceService.ts (inline fix before commit)

## TDD Gate Compliance

- RED commit: a1a9e28c (test(05-04): add failing tests...) — 2 fail confirmed
- GREEN commit: d4b160c4 (feat(05-04): implement...) — 20 pass confirmed

## Known Stubs

- `getBlockedItems` filters by org only (no projectId filter). Task entity has no projectId column in current schema. Comment in service notes the future filter. Does not block plan goal — HIGH-04 CRUD is complete.

## Threat Flags

None beyond plan's threat register (T-05-08, T-05-09, T-05-10 all mitigated in implementation).

## Self-Check: PASSED
