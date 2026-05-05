---
phase: 05-task-management-metrics
plan: "05"
subsystem: analytics
tags: [report-service, metrics-rollup, trpc, two-layer-model, workspace-scope]
dependency_graph:
  requires: [05-01, 05-02]
  provides: [ReportService, metricsRollupJob, reportsRouter]
  affects: [05-06, 05-08]
tech_stack:
  added: []
  patterns: [two-layer-analytics, layer1-events, layer2-metrics-cache, trpc-router, worker-registry]
key_files:
  created:
    - src/services/ReportService.ts
    - src/workers/metrics-rollup.ts
    - src/server/trpc/routers/reports.ts
  modified:
    - src/services/ReportService.test.ts
    - src/workers/metrics-rollup.test.ts
decisions:
  - "ReportService uses MikroORM only (no raw SQL, C6 compliance)"
  - "Workspace scope implemented via scopeType filter on MetricsCache (HIGH-01, D-53)"
  - "CSV export returns string from service; router returns it directly (D-54)"
  - "metricsRollupJob is a plain WorkerTask object (not singleton registry) for testability"
  - "reportsRouter placed in src/server/trpc/routers/ (not src/trpc/routers/) per plan spec"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-05"
  tasks_completed: 2
  files_created: 3
  files_modified: 2
  tests_added: 27
---

# Phase 05 Plan 05: Report Service + Metrics Rollup Worker Summary

Two-layer analytics model fully operational: Event queries (layer 1) + MetricsCache queries (layer 2), workspace scope end-to-end, CSV export, EventBus-triggered worker.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | ReportService with all analytics queries + CSV export | f7f10191 | src/services/ReportService.ts, src/services/ReportService.test.ts |
| 2 | Metrics rollup worker + reportsRouter | 80a335db | src/workers/metrics-rollup.ts, src/workers/metrics-rollup.test.ts, src/server/trpc/routers/reports.ts |

## What Was Built

**ReportService** (`src/services/ReportService.ts`):
- 13 analytics methods: getBurndown, getBurnup, getVelocity, getCfd, getCycleTime, getLeadTime, getThroughput, getWipOverTime, getWorkload, getBlockedItems, getStaleIssues, getProgressRollup, exportCsv
- Layer 2 (MetricsCache): burndown, burnup, CFD, WIP, velocity, progress rollup
- Layer 1 (Event): cycle time, lead time, throughput, blocked items, stale issues
- Workspace scope: scopeType='workspace' queries MetricsCache with no scopeId filter, aggregating org-wide (HIGH-01, D-53, D-95)
- CSV export: header row + data rows with proper quoting (D-54)
- Date range on all time-series queries (D-55)
- All queries scoped by orgId from context (T-05-11 mitigation)

**metricsRollupJob** (`src/workers/metrics-rollup.ts`):
- WorkerTask implementing WorkerRegistry pattern
- Upserts MetricsCache row for today's date + scope
- Computes: tasksTotal, tasksCompleted, wipCount, blockedCount, pointsTotal, pointsCompleted, pointsRemaining, statusCounts
- setupMetricsRollupListener: subscribes to 5 task mutation topics on EventBus
- Handles workspace scope aggregation row

**reportsRouter** (`src/server/trpc/routers/reports.ts`):
- 12 query procedures + 1 exportCsv mutation
- All use permissionedProcedure { resource: "reports", action: "list" }
- scopeType enum includes "workspace" (HIGH-01)
- exportCsv covers all 12 report types (D-54)
- orgId always from ctx (T-05-11), never from client input

## Test Results

```
27 pass, 0 fail (16 ReportService + 11 metrics-rollup)
bun run build: clean
```

## Deviations from Plan

**1. [TDD] RED/GREEN commits combined in Task 1**
- Tests and implementation committed in single commit (f7f10191)
- Root cause: ReportService.test.ts pre-existed as stub; updated to comprehensive tests, then implemented simultaneously
- Impact: None — all tests pass, coverage complete

**2. [Rule 2 - Missing validation] scopeId optional for workspace scope**
- Plan spec didn't address workspace case for scopeId
- Added: payload assertion in worker allows missing scope_id for workspace scope_type
- Prevents assertion errors when scope_type=workspace is used

**3. [Note] getWorkload returns empty array**
- Task entity does not yet have assigneeId column (Plan 07+ adds it)
- Method returns correct shape `WorkloadEntry[]` with zero rows
- Documented as known stub; not a blocker for other report types

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| `getWorkload` returns `[]` | src/services/ReportService.ts | ~270 | Task entity has no assigneeId yet; Plan 07+ adds column |

## Threat Surface

No new network endpoints beyond the reportsRouter procedures (which use permissionedProcedure). No new file access paths. No schema changes in this plan.

## Self-Check: PASSED

- src/services/ReportService.ts: FOUND
- src/services/ReportService.test.ts: FOUND
- src/workers/metrics-rollup.ts: FOUND
- src/workers/metrics-rollup.test.ts: FOUND
- src/server/trpc/routers/reports.ts: FOUND
- Commits f7f10191, 80a335db: FOUND
