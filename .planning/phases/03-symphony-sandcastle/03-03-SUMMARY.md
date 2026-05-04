---
phase: "03"
plan: "03"
title: "Orchestrator lifecycle, retry, reconciliation, stall"
subsystem: orchestration
tags: [symphony, orchestrator, retry, stall, lifecycle, workspace, tdd]
dependency_graph:
  requires: ["03-01", "03-02"]
  provides: [attempt-lifecycle-state, last-codex-timestamp, continuation-retry, reconcile-running-issues, stall-codex-aware, startup-sweep]
  affects: [dispatch, retry, stall, workspace, agent-run-entity]
tech_stack:
  added: []
  patterns: [TDD-RED-GREEN, DB-level-then-in-process-filter, COALESCE-stall-cutoff, startup-sweep-hook]
key_files:
  created:
    - src/db/migrations/Migration20260505010000_agent_runs_lifecycle_codex_columns.ts
  modified:
    - src/orchestration/states.ts
    - src/db/entities/orchestration/AgentRun.ts
    - src/db/entities/orchestration/states.ts
    - src/orchestration/symphony/dispatch.ts
    - src/orchestration/symphony/retry.ts
    - src/orchestration/symphony/stall.ts
    - src/orchestration/symphony/workspace.ts
    - src/orchestration/symphony/schemas.ts
    - src/orchestration/__tests__/symphony-conformance.test.ts
decisions:
  - "Stall cutoff uses DB-level startedAt filter (preserves index + existing test contract) then in-process lastCodexTimestamp override"
  - "scheduleContinuationRetry uses fixed 1000ms delay distinct from exponential failure retry"
  - "sweepTerminalWorkspaces supports dryRun mode and beforeRemove hook for safe startup cleanup"
  - "reconcileRunningIssues classifies terminal/non-active/active with injected stop/clean/snapshot callbacks"
metrics:
  duration: "~40 minutes"
  completed: "2026-05-05T01:30:00Z"
  tasks_completed: 4
  files_modified: 9
  files_created: 1
---

# Phase 03 Plan 03: Orchestrator Lifecycle, Retry, Reconciliation, Stall Summary

**One-liner:** Run-attempt lifecycle states, `lastCodexTimestamp`-aware stall detection, fixed-1000ms continuation retry, explicit reconcile→validate→fetch→dispatch→notify tick sequence, and startup workspace cleanup sweep — all TDD RED-first.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 03-03-01 | RED tests for lifecycle, retry, reconcile, stall, sweep | a83fc306 | symphony-conformance.test.ts |
| 03-03-02 | attemptLifecycleState + lastCodexTimestamp entity + migration | ce9809d8 | AgentRun.ts, states.ts, Migration20260505010000_* |
| 03-03-03 | Dispatch tick explicit sequence + reconcileRunningIssues export | cec218f0 | dispatch.ts |
| 03-03-04 | scheduleContinuationRetry, stall lastCodexTimestamp, sweepTerminalWorkspaces | 2195fbd9 | retry.ts, stall.ts, workspace.ts |

## Verification

- `bun test src/orchestration/__tests__/symphony-conformance.test.ts` — 66 pass, 0 fail (up from 49)
- `bun run ci` — typecheck ✓, symphony:conformance ✓, trpc:permissions ✓, test ✓
  - `web:check` fails with SIGABRT (pre-existing svelte-check crash; not introduced by this plan)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stall scan broke existing unit tests**
- **Found during:** Task 03-03-04
- **Issue:** Refactored `scanForStalledRuns` to remove DB-level `startedAt` filter broke `tests/orchestration/stall.test.ts` tests that assert the query criteria includes `startedAt.$lt`
- **Fix:** Restored DB-level `startedAt` filter as the broad net; added in-process `lastCodexTimestamp` check as an override. Both semantics preserved.
- **Files modified:** `src/orchestration/symphony/stall.ts`
- **Commit:** 2195fbd9

**2. [Rule 2 - Missing critical functionality] Migration missing isLossy flag**
- **Found during:** Task 03-03-04 (CI run)
- **Issue:** New migration with destructive `down()` (drops columns) failed the `marks every destructive down() migration with static isLossy=true` gate
- **Fix:** Added `static isLossy = true` to `Migration20260505010000_agent_runs_lifecycle_codex_columns`
- **Files modified:** `src/db/migrations/Migration20260505010000_agent_runs_lifecycle_codex_columns.ts`
- **Commit:** 2195fbd9

**3. [Rule 1 - Bug] Entity states shim missing AttemptLifecycleState re-export**
- **Found during:** Task 03-03-02 (typecheck)
- **Issue:** `src/db/entities/orchestration/states.ts` re-exports from `src/orchestration/states.ts` but didn't forward `AttemptLifecycleState`; TypeScript error TS2305
- **Fix:** Added `ATTEMPT_LIFECYCLE_STATES` and `AttemptLifecycleState` to entity shim
- **Files modified:** `src/db/entities/orchestration/states.ts`
- **Commit:** 2195fbd9

## Known Stubs

None — all implemented behaviors are wired to real DB state.

## Requirements Addressed

SYM-07, SYM-08, SYM-09, SYM-10, SYM-11, SYM-12, SYM-13, SYM-17, SYM-18, SYM-19, SYM-24, SYM-27

## Self-Check: PASSED
