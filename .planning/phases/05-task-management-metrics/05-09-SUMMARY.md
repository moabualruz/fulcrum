---
phase: 05-task-management-metrics
plan: 09
subsystem: web/reports
tags: [layerchart, charts, monte-carlo, trpc, vitest]
dependency_graph:
  requires: [05-06]
  provides: [reports-ui, chart-components, forecast]
  affects: [src/web/src/routes/projects/[id]/reports, src/web/src/lib/components/reports]
tech_stack:
  added: [layerchart@1.0.13, @testing-library/svelte]
  patterns: [SSR-guard-browser-check, Monte-Carlo-onMount, tRPC-via-locals-em]
key_files:
  created:
    - src/web/src/lib/components/reports/BurndownChart.svelte
    - src/web/src/lib/components/reports/VelocityChart.svelte
    - src/web/src/lib/components/reports/CfdChart.svelte
    - src/web/src/lib/components/reports/CycleTimeChart.svelte
    - src/web/src/lib/components/reports/ThroughputChart.svelte
    - src/web/src/lib/components/reports/WipChart.svelte
    - src/web/src/lib/components/reports/ForecastChart.svelte
    - src/web/src/lib/components/reports/ReportDatePicker.svelte
  modified:
    - src/web/src/routes/projects/[id]/reports/+page.server.ts
    - src/web/src/routes/projects/[id]/reports/+page.svelte
    - src/web/tests/vitest/BurndownChart.test.ts
    - src/web/tests/vitest/VelocityChart.test.ts
decisions:
  - "Use layerchart LineChart/BarChart/AreaChart/ScatterChart primitives directly (not wrapper chart types)"
  - "SSR guard via {#if browser} in each component template"
  - "Monte Carlo runs in onMount (client-only, ~10ms for 1000 iterations)"
  - "page.server.ts uses locals.em (MikroORM EntityManager) — eliminates openProductDb raw SQL"
  - "CfdChart accepts dynamic status keys from data shape"
metrics:
  duration: 25m
  completed: "2026-05-05"
  tasks: 2
  files: 12
---

# Phase 05 Plan 09: LayerChart Report Components + Monte Carlo Forecast Summary

8 LayerChart report components (SSR-guarded, typed props, tooltips) + Monte Carlo fan chart (1000-iteration P50/P75/P85/P95) + date picker + reports page migrated from openProductDb to MikroORM EM.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create 8 LayerChart report components | 53c84112 | BurndownChart, VelocityChart, CfdChart, CycleTimeChart, ThroughputChart, WipChart, ForecastChart, ReportDatePicker |
| 2 | Rewrite reports page + make tests GREEN | 53c84112 | +page.server.ts, +page.svelte, BurndownChart.test.ts, VelocityChart.test.ts |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all chart components accept real data from parent page; page loads live data from server.

## Threat Flags

None — no new network endpoints or auth paths introduced. Reports data gated by existing `locals.orgId` auth check.

## Self-Check: PASSED

- 8 chart files exist: `ls src/web/src/lib/components/reports/*.svelte | wc -l` → 8
- Commit 53c84112 verified: `git log --oneline | grep 53c84112`
- Tests GREEN: BurndownChart (3/3), VelocityChart (3/3)
- openProductDb removed from +page.server.ts (only appears in comment)
