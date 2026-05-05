---
phase: 05-task-management-metrics
plan: "00"
subsystem: test-infrastructure
tags: [tdd, red-stubs, nyquist, backend, frontend]
dependency_graph:
  requires: []
  provides: [RED test stubs for all Phase 05 plans]
  affects: [Plans 03-11 — each plan's implementation turns these RED tests GREEN]
tech_stack:
  added: []
  patterns: [TDD RED-stub pattern — expect(true).toBe(false) bodies replaced by real assertions at implementation time]
key_files:
  created:
    - src/services/CommentService.test.ts
    - src/services/TaskService.test.ts
    - src/services/ReportService.test.ts
    - src/workers/metrics-rollup.test.ts
    - src/services/SprintService.test.ts
    - tests/db/custom-fields.test.ts
    - src/web/tests/vitest/BurndownChart.test.ts
    - src/web/tests/vitest/VelocityChart.test.ts
    - src/web/tests/vitest/GanttView.test.ts
    - src/web/tests/vitest/CalendarView.test.ts
  modified: []
decisions:
  - Backend stubs use bun:test; frontend stubs use vitest — matches existing project test split
  - tests/db/ directory created (did not exist) to house custom-fields.test.ts alongside existing db tests
metrics:
  duration: ~5min
  completed: "2026-05-05"
  tasks_completed: 2
  files_created: 10
---

# Phase 05 Plan 00: RED Test Stubs Summary

10 RED failing test stubs created for Nyquist TDD compliance. All tests fail immediately via `expect(true).toBe(false)` — they go GREEN only when real implementation lands in later Phase 05 plans.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | RED backend stubs (6 files) | 9a16b077 | CommentService, TaskService, ReportService, metrics-rollup, SprintService, custom-fields |
| 2 | RED frontend stubs (4 files) | 67857061 | BurndownChart, VelocityChart, GanttView, CalendarView |

## Requirements Coverage

| File | Requirements | Goes GREEN In |
|------|-------------|---------------|
| CommentService.test.ts | TSK-01, TSK-02 | Plan 03 |
| TaskService.test.ts | TSK-02, TSK-11 | Plans 06, 11 |
| ReportService.test.ts | TSK-05 | Plan 05 |
| metrics-rollup.test.ts | TSK-06 | Plan 05 |
| SprintService.test.ts | TSK-07, TSK-08 | Plan 06 |
| custom-fields.test.ts | TSK-12 | Plan 12 |
| BurndownChart.test.ts | TSK-03 | Plan 09 |
| VelocityChart.test.ts | TSK-04 | Plan 09 |
| GanttView.test.ts | TSK-09 | Plan 10 |
| CalendarView.test.ts | TSK-10 | Plan 10 |

## Deviations from Plan

None — plan executed exactly as written. tests/db/ directory was created (did not exist) as required by tests/db/custom-fields.test.ts placement.

## Known Stubs

All files are intentional RED stubs. Every `expect(true).toBe(false)` is a tracked stub that will be replaced by real assertions in the implementing plan listed above.

## Threat Flags

None — test-only plan, no runtime surface introduced.

## Self-Check: PASSED

All 10 files verified to exist. Both commits confirmed in git log.
