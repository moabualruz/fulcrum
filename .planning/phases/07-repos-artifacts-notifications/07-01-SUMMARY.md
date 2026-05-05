---
phase: 07-repos-artifacts-notifications
plan: 01
subsystem: repos
tags: [repos, watcher, queue, workers, cron, lru, bun-test]
requires:
  - phase: 02
    provides: "Worker registry primitives used by repo sync tasks"
  - phase: 06
    provides: "Search document ingestion consumed by repo sync workers"
provides:
  - "Repo watcher queue payloads with filename/eventType and retryable enqueue path"
  - "Watcher SLA tests for add/change/unlink latency, burst coalescing, invalid paths, and retry behavior"
  - "Repo sync local/remote queue definitions and LRU warmup cron bootstrap"
affects: [repos, workers, search-indexing, phase-07]
tech-stack:
  added: []
  patterns:
    - "fs.watch backend with bounded async queue payloads"
    - "defineTask/defineQueue worker metadata plus dynamic repo worker bootstrap"
key-files:
  created:
    - src/repos/__tests__/watcher.sla.test.ts
    - src/queue/index.ts
  modified:
    - src/repos/watcher.ts
    - src/repos/workers/sync-local.ts
    - src/repos/workers/sync-remote.ts
key-decisions:
  - "Kept node:fs.watch default backend because deterministic mocked SLA tests passed under 2 seconds."
  - "LRU warmup uses top-five weighted recency scoring with failure penalty instead of introducing another git library."
  - "Queue bootstrap uses dynamic worker imports to avoid sync-local/sync-remote circular import at module initialization."
patterns-established:
  - "Watcher events enqueue repo.sync.local with repoId, filename, eventType, and retryable marker on enqueue retry."
  - "Repo worker startup calls registerRepoWorkerBootstrap to register local sync, remote sync, LRU task, and cron metadata."
requirements-completed: [REP-01, REP-02, REP-03]
duration: 34min
completed: 2026-05-05
---

# Phase 07 Plan 01: Sync Baseline Summary

**Repo watcher SLA with async queue payloads, top-five LRU remote warmup, and worker bootstrap registration**

## Performance

- **Duration:** 34 min
- **Started:** 2026-05-05T20:16:00Z
- **Completed:** 2026-05-05T20:50:06Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added RED/GREEN watcher SLA coverage for add/change/unlink latency, burst coalescing, invalid path rejection, retryable enqueue, and LRU top-five selection.
- Updated `RepoWatcher` to validate event paths under registered repo roots, debounce per path at 250ms default, and enqueue bounded `repo.sync.local` payloads without running git sync inline.
- Added `src/queue/index.ts` worker metadata/bootstrap primitives and registered `repo.sync.local`, `repo.sync.remote`, and `repo.lru.warmup` cron metadata.

## Task Commits

1. **Task 1 RED: Add failing watcher SLA tests** - `69c12289` (test)
2. **Task 1 GREEN / Task 2: Implement watcher SLA and LRU selection** - `672229e2` (feat)
3. **Task 3: Register sync workers and warmup cron** - `9a730f6b` (feat)

## Files Created/Modified

- `src/repos/__tests__/watcher.sla.test.ts` - Bun tests for watcher SLA, debounce, invalid path handling, retryable enqueue, and LRU top-five selection.
- `src/repos/watcher.ts` - Queue-first watcher with path validation, per-path debounce, in-flight guard, and retryable enqueue.
- `src/repos/workers/sync-local.ts` - `defineTask` and `defineQueue` metadata for `repo.sync.local`.
- `src/repos/workers/sync-remote.ts` - `repo.sync.remote` metadata, `repo.lru.warmup` cron metadata, LRU selector, and warmup worker registration.
- `src/queue/index.ts` - Queue definition primitives and repo worker bootstrap.

## Decisions Made

- Kept `node:fs.watch`; no `chokidar@5.0.0` dependency added because mocked deterministic SLA path passes and plan only required chokidar if fs.watch fails the 2-second SLA.
- Kept existing `src/repos/git.ts` shell wrapper; this plan only queues/schedules sync work and does not require changing git implementation.
- Used dynamic imports in `registerRepoWorkerBootstrap` because sync worker modules import queue primitives; static imports would create a module initialization cycle.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added watcher path containment validation**
- **Found during:** Task 2
- **Issue:** OS watcher filenames are trust-boundary input and could point outside the registered repo root.
- **Fix:** Resolve event paths under the repo root and ignore/log invalid outside/null paths.
- **Files modified:** `src/repos/watcher.ts`
- **Verification:** `bun test src/repos/__tests__/watcher.sla.test.ts`
- **Committed in:** `672229e2`

**2. [Rule 3 - Blocking] Preserved legacy WatchHandle compatibility**
- **Found during:** Task 2 verification
- **Issue:** Existing tests still implement `WatchHandle.close()` while plan interface requires `stop()`.
- **Fix:** Support both optional `stop()` and `close()` so new interface works without breaking older handle fakes.
- **Files modified:** `src/repos/watcher.ts`
- **Verification:** `bun test src/repos/__tests__/watcher.sla.test.ts`
- **Committed in:** `672229e2`

**Total deviations:** 2 auto-fixed (Rule 2: 1, Rule 3: 1)
**Impact on plan:** Both changes are correctness/security support for planned watcher behavior.

## Issues Encountered

- Plan verification referenced missing `src/tsconfig.json`; repo only has `tsconfig.json` and `src/web/tsconfig.json`. Used `bun run --bun tsc --noEmit --project tsconfig.json` instead.
- Full repo TypeScript is currently blocked by unrelated parallel/pre-existing failures in artifacts, docs/memory/search/tests, and legacy repo dashboard tests. Filtered TypeScript output showed no errors in plan-owned files.
- Existing `tests/repos/registration-watcher.test.ts` still expects old `{ repoId }` watcher payloads; plan requires richer bounded payload `{ repoId, filename, eventType }`. Left out-of-owned test unchanged.

## Verification

- `bun test src/repos/__tests__/watcher.sla.test.ts` - PASS, 6 tests.
- `rg -n "syncRepoFromRemote|enqueue\\(|watch\\(" src/repos/watcher.ts src/repos/register.ts` - PASS, watcher uses queue enqueue and no direct `syncRepoFromRemote`.
- `rg -n "defineQueue\\(|register.*Cron|repo\\.sync\\.local|repo\\.sync\\.remote|repo\\.lru\\.warmup|REPO_LRU_WARMUP_CRON|registerRepoWorkerBootstrap" src/repos/workers/sync-local.ts src/repos/workers/sync-remote.ts src/queue/index.ts` - PASS.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Repo sync baseline now exposes deterministic watcher-to-queue behavior and worker startup metadata for downstream repo dashboard, artifact, and notification wiring.

## Self-Check: PASSED

- Found created/modified files: `src/repos/__tests__/watcher.sla.test.ts`, `src/repos/watcher.ts`, `src/repos/workers/sync-local.ts`, `src/repos/workers/sync-remote.ts`, `src/queue/index.ts`, summary file.
- Found commits: `69c12289`, `672229e2`, `9a730f6b`.

---
*Phase: 07-repos-artifacts-notifications*
*Completed: 2026-05-05*
