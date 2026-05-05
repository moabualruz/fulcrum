---
phase: "03"
plan: "02"
subsystem: orchestration/symphony
tags: [symphony, tracker, issue-model, tdd, conformance]
dependency_graph:
  requires: ["03-01"]
  provides: [SymphonyIssueSchema, BlockedByRefSchema, TrackerBlockerResolutionError, fetchSymphonyIssues, refreshRunningIssues, resolvePerStateConcurrency]
  affects: [src/orchestration/symphony/schemas.ts, src/orchestration/symphony/tracker.ts, src/orchestration/__tests__/symphony-conformance.test.ts]
tech_stack:
  added: []
  patterns: [strict-zod-schema, tdd-red-green, blocker-ref-resolution, ingest-only-boundary]
key_files:
  created: []
  modified:
    - src/orchestration/symphony/schemas.ts
    - src/orchestration/symphony/tracker.ts
    - src/orchestration/__tests__/symphony-conformance.test.ts
    - src/orchestration/symphony/linear-tracker.ts
decisions:
  - "SymphonyIssueSchema labels use Zod .transform() to normalize lowercase at parse time"
  - "TrackerBlockerResolutionError thrown before filtering — any unresolvable blocker ID is a hard fail"
  - "branch_name derived from task title slug; null for untitled tasks until Pillar 6 named identifiers land"
  - "identifier is task.id (stable) until Pillar 6 adds human-readable named identifiers"
  - "refreshRunningIssues loads all runs (limit 200) and classifies in-process; no separate query per state"
  - "resolvePerStateConcurrency returns Map<AgentRunOrchestrationState, number>; invalid keys silently dropped"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-05"
  tasks_completed: 4
  files_modified: 4
---

# Phase 03 Plan 02: Native Tracker Strict Issue Model Summary

**One-liner:** Zod-enforced 12-field Symphony Issue with full blocker ref resolution, TrackerBlockerResolutionError, and deterministic candidate ordering — plus refreshRunningIssues/resolvePerStateConcurrency primitives and ingest-only external tracker boundary.

## What Was Built

### SymphonyIssueSchema (SYM-05)
All 12 required fields: `id`, `identifier`, `title`, `description`, `branch_name`, `url`, `labels`, `state`, `priority`, `created_at`, `updated_at`, `blocked_by`. Labels transform normalizes to lowercase at parse time via Zod `.transform()`.

### BlockedByRefSchema (SYM-06)
Full blocker reference shape: `{id, identifier, state}`. All 3 fields required — no partial refs allowed.

### TrackerBlockerResolutionError (SYM-07)
Typed error thrown when any `blocked_by` ID referenced by a task cannot be resolved in org scope. Carries `taskId` and `unresolvedBlockerIds[]` for diagnostic context.

### fetchSymphonyIssues
Strict Symphony candidate fetch:
- Batch-loads all blocker tasks in a single query via `fetchBlockerTasksById`
- Validates all blocker IDs are resolvable before filtering — throws `TrackerBlockerResolutionError` on first unresolvable ID
- Excludes tasks blocked by non-terminal statuses (ineligible for dispatch)
- Includes tasks blocked by terminal statuses (blocker resolved)
- Sorts: priority asc → created_at oldest → id lexicographic (SYM-08)
- Parses result through `SymphonyIssueSchema` for strict runtime validation

### refreshRunningIssues (SYM-15)
Returns `{active, nonActive, terminal}` snapshot of all runs for reconciliation:
- Active: `claimed | running`
- Terminal: `released | succeeded | failed | timed_out | stalled | cancelled`
- NonActive: everything else (e.g. `retry_queued`, `unclaimed`)

### resolvePerStateConcurrency (SYM-17)
Normalizes a `Record<string, number>` config into `Map<AgentRunOrchestrationState, number>`. Silently drops empty string keys and unknown state names.

### Ingest-only external tracker posture (SYM-24 / D-04)
- `linear-tracker.ts` INGEST-ONLY comment documents D-04/D-05 boundary
- Conformance tests assert Linear adapter has no `fetchSymphonyIssues`, `refreshRunningIssues`, or `resolvePerStateConcurrency`
- Tests assert native tracker is the exclusive source for dispatch-side functions
- No new dispatch code imports `src/connectors/linear.ts`

## TDD Gate Compliance

RED commit: `b528317b` — test(03-02): add RED tests for strict Symphony Issue model and tracker ops
GREEN commits: `afa81b3c`, `6f6f8bee`, `1a006955` — implementation across tasks 02/03/04

All 49 conformance tests pass. 74 tests pass across conformance + connector suites.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 03-02-01 RED | b528317b | test(03-02): add RED tests for strict Symphony Issue model and tracker ops |
| 03-02-02 | afa81b3c | feat(03-02): implement SymphonyIssueSchema strict 12-field Issue model |
| 03-02-03 | 6f6f8bee | feat(03-02): add refreshRunningIssues and resolvePerStateConcurrency |
| 03-02-04 | 1a006955 | feat(03-02): enforce ingest-only external tracker posture (SYM-24) |

## Verification

```
bun test src/orchestration/__tests__/symphony-conformance.test.ts
# 49 pass, 0 fail

bun run ci
# ✓ install, ✓ typecheck, ✓ symphony:lock, ✓ symphony:conformance,
# ✓ trpc:permissions, ✓ test, ✓ license-audit, ✓ ci:codegen, ✓ build:all
# ✗ web:check — pre-existing SIGABRT, unrelated to this plan
```

## Deviations from Plan

### Auto-fixed Issues

None introduced.

**1. [Rule 2 - Missing Critical] TypeScript strict type for resolvePerStateConcurrency test**
- **Found during:** Task 03-02-04 (CI typecheck)
- **Issue:** Test passed `"INVALID_STATE"` and `""` to `Map<AgentRunOrchestrationState>.has()` which TypeScript rejects as not assignable to the enum
- **Fix:** Cast invalid test keys as `never` — this is test-only; the runtime function accepts `Record<string, number>` (string keys)
- **Files modified:** `src/orchestration/__tests__/symphony-conformance.test.ts`
- **Commit:** 1a006955

## Known Stubs

- `identifier` in `toSymphonyIssue` uses `task.id` as stable fallback until Pillar 6 named identifiers land
- `url` is always `null` — no public URL surface in local-first Fulcrum v1.0
- `labels` is always `[]` — Pillar 6 task label domain not yet implemented
- `branch_name` is derived from title slug when title exists, `null` for untitled tasks

These stubs are intentional and documented: Pillar 6 (Task management domain) will fill them in a future phase.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All changes are in-process TypeScript logic within the existing orchestration module boundary.

## Self-Check: PASSED

- b528317b exists: confirmed
- afa81b3c exists: confirmed
- 6f6f8bee exists: confirmed
- 1a006955 exists: confirmed
- schemas.ts exports SymphonyIssueSchema: confirmed
- tracker.ts exports TrackerBlockerResolutionError: confirmed
- tracker.ts exports refreshRunningIssues: confirmed
- tracker.ts exports resolvePerStateConcurrency: confirmed
- 49 conformance tests pass: confirmed
