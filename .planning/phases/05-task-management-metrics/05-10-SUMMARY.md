---
phase: 05-task-management-metrics
plan: 10
subsystem: web/tasks
tags: [gantt, calendar, critical-path, cpm, svar, event-calendar, svelte]
dependency_graph:
  requires: [05-04, 05-06]
  provides: [GanttView, CalendarView, CriticalPath]
  affects: [view-switcher]
tech_stack:
  added: [wx-svelte-gantt, "@event-calendar/core"]
  patterns: [CPM-algorithm, reactive-cache, form-action-reschedule]
key_files:
  created:
    - src/web/src/lib/components/tasks/CriticalPath.ts
    - src/web/src/lib/components/tasks/GanttView.svelte
    - src/web/src/lib/components/tasks/CalendarView.svelte
    - src/web/src/routes/projects/[id]/gantt/+page.server.ts
    - src/web/src/routes/projects/[id]/gantt/+page.svelte
    - src/web/src/routes/projects/[id]/calendar/+page.server.ts
    - src/web/src/routes/projects/[id]/calendar/+page.svelte
  modified:
    - src/web/src/lib/components/board/view-switcher.ts
    - src/web/tests/vitest/GanttView.test.ts
    - src/web/tests/vitest/CalendarView.test.ts
decisions:
  - "CriticalPath.ts pure TS CPM (O(V+E) Kahn topological sort + forward/backward pass) — no SVAR PRO dependency"
  - "CriticalPathCache class for identity-based caching (D-103); avoids recomputing on same array refs"
  - "task_relationships query in gantt server wrapped in try/catch — table lives in MikroORM DB not pglite"
  - "Task click navigates to board?task=ID instead of inline sheet — avoids BoardTask type mismatch"
  - "Added 'gantt' to PROJECT_VIEWS tuple in view-switcher.ts for ProjectViewSwitcher nav"
metrics:
  duration: 25m
  completed: "2026-05-05"
  tasks_completed: 2
  files_created: 7
  files_modified: 3
---

# Phase 05 Plan 10: Gantt + Calendar Views Summary

SVAR wx-svelte-gantt Gantt wrapper with manual CPM critical path + @event-calendar/core CalendarView with sprint overlay.

## Tasks Completed

| # | Name | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Gantt + CriticalPath + GREEN test | 782fa9ec | CriticalPath.ts, GanttView.svelte, gantt/+page.* |
| 2 | CalendarView + GREEN test | 782fa9ec | CalendarView.svelte, calendar/+page.* |

## Decisions Made

1. **CPM algorithm manual** — SVAR critical path is PRO-only. Implemented pure TS CPM: topological sort (Kahn), forward pass (ES/EF), backward pass (LS/LF), slack = LS-ES. O(V+E).
2. **CriticalPathCache** — identity-based reference caching (same array ref = skip recompute). D-103.
3. **DB graceful degradation** — `task_relationships` table not in pglite product DB (only MikroORM); wrapped query in try/catch. Gantt works with empty relationships when table absent.
4. **Task click = navigate** — `goto(/board?task=id)` rather than inline BoardSheet; avoids needing `description_text`/`tiptap_content` from gantt server query.
5. **Added 'gantt' to ProjectView** — `view-switcher.ts` PROJECT_VIEWS now includes "gantt" so ProjectViewSwitcher renders Gantt tab.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] task_relationships not in pglite product DB**
- **Found during:** Task 1 implementation
- **Issue:** Plan said to query `task_relationships` via `openProductDb()` but the table only exists in the MikroORM/TypeORM server DB
- **Fix:** Wrapped query in try/catch; returns empty relationships on error
- **Files modified:** gantt/+page.server.ts

**2. [Rule 2 - Missing] tasks.start_date/due_date not in pglite schema**
- **Found during:** Task 1 implementation
- **Issue:** `tasks` table in pglite product DB has no `start_date`/`due_date` columns
- **Fix:** Used `NULL::text AS start_date, NULL::text AS due_date` in SELECT until a migration adds them; GanttView and CalendarView handle null dates gracefully
- **Files modified:** gantt/+page.server.ts, calendar/+page.server.ts

**3. [Rule 1 - Bug] updateTaskAction uses camelCase fields**
- **Found during:** Task 1
- **Issue:** Plan used `start_date`/`due_date` field names; actual service expects `startDate`/`dueDate`
- **Fix:** Used `startDate`/`dueDate` in updateTaskAction calls

**4. [Rule 2 - Missing] 'gantt' not in ProjectView type**
- **Found during:** Task 1 route page
- **Issue:** `PROJECT_VIEWS` didn't include 'gantt', causing TypeScript error on `active="gantt"`
- **Fix:** Added 'gantt' to PROJECT_VIEWS tuple

## Known Stubs

- `start_date`/`due_date` on tasks always return `null` from pglite server until a migration adds those columns to the `tasks` table. Gantt bars will use `created_at` fallback; Calendar will show no events. Future plan should add migration: `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date date; ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date date;`

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: tampering | gantt/+page.server.ts | reschedule action validates id presence but no task ownership check beyond DB isolation |

## Self-Check

### Files exist:
- src/web/src/lib/components/tasks/CriticalPath.ts — FOUND
- src/web/src/lib/components/tasks/GanttView.svelte — FOUND
- src/web/src/lib/components/tasks/CalendarView.svelte — FOUND
- src/web/src/routes/projects/[id]/gantt/+page.svelte — FOUND
- src/web/src/routes/projects/[id]/calendar/+page.svelte — FOUND

### Tests: 6/6 pass (GanttView.test.ts + CalendarView.test.ts)

### Commit: 782fa9ec

## Self-Check: PASSED
