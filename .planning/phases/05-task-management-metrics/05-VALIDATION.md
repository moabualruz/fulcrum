---
phase: 5
slug: task-management-metrics
status: draft
nyquist_compliant: true
wave_0_complete: true  # 05-00-PLAN.md creates all 9 RED stubs
created: 2026-05-05
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (backend)** | bun:test (co-located `.test.ts` files) |
| **Framework (web)** | Vitest 4.x (`src/web/vitest.config.ts`) |
| **Framework (e2e)** | Playwright 1.59 (`FULCRUM_RUN_E2E=1`) |
| **Config file** | `src/web/vitest.config.ts` (web), none needed for bun:test |
| **Quick run command** | `bun test src/db/entities/tasks/ src/services/ src/filters/` |
| **Full suite command** | `bun run ci` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test src/db/entities/tasks/ src/services/ src/filters/`
- **After every plan wave:** Run `bun run ci`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|--------------------|-------------|--------|
| TBD | TBD | 1 | TSK-01 | unit | `bun test src/services/CommentService.test.ts` | ❌ | pending |
| TBD | TBD | 1 | TSK-02 | unit | `bun test src/services/ -t watcher` | ❌ | pending |
| TBD | TBD | 2 | TSK-03 | vitest | `cd src/web && bun run web:test -- BurndownChart` | ❌ | pending |
| TBD | TBD | 2 | TSK-04 | vitest | `cd src/web && bun run web:test -- VelocityChart` | ❌ | pending |
| TBD | TBD | 2 | TSK-05 | unit | `bun test src/services/ReportService.test.ts` | ❌ | pending |
| TBD | TBD | 1 | TSK-06 | unit | `bun test src/workers/metrics-rollup.test.ts` | ❌ | pending |
| TBD | TBD | 1 | TSK-07 | unit | `bun test src/services/SprintService.test.ts -t capacity` | ❌ | pending |
| TBD | TBD | 1 | TSK-08 | unit | `bun test src/services/SprintService.test.ts -t retrospective` | ❌ | pending |
| TBD | TBD | 3 | TSK-09 | vitest | `cd src/web && bun run web:test -- Gantt` | ❌ | pending |
| TBD | TBD | 3 | TSK-10 | vitest | `cd src/web && bun run web:test -- TaskCalendar` | PARTIAL | pending |
| TBD | TBD | 1 | TSK-11 | unit | `bun test src/services/TaskService.test.ts -t bulk` | ❌ | pending |
| TBD | TBD | 1 | TSK-12 | unit | `bun test tests/db/custom-fields.test.ts` | ❌ | pending |
| TBD | TBD | 1 | TSK-13 | unit | `bun test src/filters/ast.test.ts` | ✅ | exists |
| TBD | TBD | 3 | TSK-14 | integration | `bun run ci` | PARTIAL | pending |

---

## Wave 0 Gaps

- [ ] `src/services/CommentService.test.ts` — TSK-01
- [ ] `src/services/TaskService.test.ts` (watcher tests) — TSK-02
- [ ] `src/services/ReportService.test.ts` — TSK-05
- [ ] `src/workers/metrics-rollup.test.ts` — TSK-06
- [ ] `src/services/SprintService.test.ts` (capacity + retrospective) — TSK-07, TSK-08
- [ ] `tests/db/custom-fields.test.ts` — TSK-12 (all 8 types round-trip)
- [ ] `src/web/tests/vitest/BurndownChart.test.ts` — TSK-03
- [ ] `src/web/tests/vitest/VelocityChart.test.ts` — TSK-04
- [ ] `src/web/tests/vitest/GanttView.test.ts` — TSK-09
