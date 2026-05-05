---
phase: 05-task-management-metrics
plan: 06
subsystem: task-management
tags: [automation, trpc, integration, workflow, sprint]
dependency_graph:
  requires: [05-03, 05-04, 05-05]
  provides: [appRouter-phase5-complete, AutomationService, getCapacityPreview]
  affects: [src/trpc/router.ts, src/services/TaskService.ts, src/services/SprintService.ts]
tech_stack:
  added: [AutomationService, automationsRouter]
  patterns: [EventBus-subscribe, inline-field-dependency-validation, TDD-red-green]
key_files:
  created:
    - src/services/AutomationService.ts
    - src/services/AutomationService.test.ts
    - src/server/trpc/routers/automations.ts
  modified:
    - src/trpc/router.ts
    - src/services/TaskService.ts
    - src/services/SprintService.ts
decisions:
  - "Inline FieldDependencyRule em.find in TaskService instead of importing FieldDependencyService (plan 12 refactors later) — HIGH-03"
  - "Watcher subscribe is best-effort (try/catch) to avoid failing task updates on subscription errors"
  - "Sprint.retrospectiveNotes stored as {notes: string} JSON object to match entity type (object | null)"
  - "AutomationService.executeAction catches per-action errors to prevent one bad action from halting the chain"
metrics:
  duration: "~25min"
  completed: "2026-05-05"
  tasks_completed: 2
  files_modified: 6
---

# Phase 05 Plan 06: Integration — Mount Routers + Extend Services + AutomationService Summary

One-liner: All 6 Phase 5 tRPC routers mounted in AppRouter; TaskService extended with workflow transition validation, watcher auto-subscribe, and inline field dependency checks; SprintService extended with capacity preview and retrospective; AutomationService created with EventBus integration and cycle detection.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend TaskService + SprintService + mount Phase 5 routers | 7ccc047b | router.ts, TaskService.ts, SprintService.ts |
| 2 | Create AutomationService + automations router + mount | c47b2f8f | AutomationService.ts, AutomationService.test.ts, automations.ts, router.ts |

## What Was Built

### AppRouter (src/trpc/router.ts)
All 6 Phase 5 routers mounted:
- `comments: commentsRouter`
- `workflows: workflowsRouter`
- `relationships: relationshipsRouter`
- `templates: templatesRouter`
- `recurrence: recurrenceRouter`
- `automations: automationsRouter`

### TaskService Extensions
- **D-24 Transition validation**: `WorkflowService.validateTransition` called before status change when projectId known; throws `FORBIDDEN` if not allowed
- **D-08 Watcher auto-subscribe**: `CommentService.subscribe` called when `assigneeId` changes (best-effort)
- **D-25 startedAt**: Set when task enters in_progress/started/active status for first time
- **HIGH-03 Inline field dependency validation**: `em.find(FieldDependencyRule)` used directly — no FieldDependencyService import (Plan 12 will refactor)
- **DDL anti-pattern removed**: `ensureTaskProjectColumn` DDL call removed from `bulkUpdate`

### SprintService Extensions
- **D-27 `getCapacityPreview(orgId, sprintId)`**: Returns `{assigned, capacity, percentage}` — raw SQL sum of task points
- **D-29 `saveRetrospective(orgId, sprintId, notes, summary?)`**: Persists retrospectiveNotes + closedSummary
- **DDL anti-pattern removed**: `ensureTaskProjectColumn` + `ensureTaskProjectColumn` helper deleted

### AutomationService (src/services/AutomationService.ts)
- `evaluate(event, orgId, projectId, depth=0)`: Queries enabled ProjectAutomation records, evaluates condition, executes action
- **D-91 Cycle detection**: Halts at depth 5 with console.warn
- **Actions**: set_status, set_assignee, add_label, remove_label, add_comment (via CommentService — MEDIUM-01 fix), subscribe_watcher, move_to_sprint
- `setupAutomationListener(eventBus)`: Subscribes to 6 task.* EventBus topics
- `getTemplates()`: 4 predefined templates (D-92): Close stale tasks, Auto-assign by label, Notify on status change, Sprint auto-close
- **CRUD**: list, create, update, delete for ProjectAutomation entity

### automationsRouter (src/server/trpc/routers/automations.ts)
- `list`, `create`, `update`, `delete`, `templates` — all behind `permissionedProcedure` (T-05-15)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Sprint.retrospectiveNotes entity type mismatch**
- **Found during:** Task 1
- **Issue:** Plan specified `saveRetrospective(notes: string)` but Sprint entity has `retrospectiveNotes: object | null`
- **Fix:** Store as `{ notes: string }` JSON object
- **Files modified:** src/services/SprintService.ts

**2. [Rule 2 - Missing] Best-effort watcher subscription**
- **Found during:** Task 1
- **Issue:** Watcher subscribe failure would abort task update
- **Fix:** Wrapped in try/catch — watcher is non-fatal best-effort
- **Files modified:** src/services/TaskService.ts

## Test Results

```
AutomationService tests: 6 pass, 0 fail
tsc --noEmit: clean
```

## Self-Check: PASSED

- src/services/AutomationService.ts — FOUND
- src/services/AutomationService.test.ts — FOUND
- src/server/trpc/routers/automations.ts — FOUND
- Commits 7ccc047b, 1f31724d, c47b2f8f — all in git log
