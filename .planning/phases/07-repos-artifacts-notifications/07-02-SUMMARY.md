---
phase: 07-repos-artifacts-notifications
plan: 02
subsystem: repos
tags: [repos, dashboard, read-model, tenancy, tdd]

requires:
  - phase: 07-repos-artifacts-notifications
    provides: REP-01 repo sync persistence rows and worker-updated sync state
provides:
  - Tenant-scoped repo dashboard projection service
  - Repo detail read-model slices for Branches, Commits, Files, and Sync Log tabs
  - Contract tests and typed fixture constructors for repo dashboard models
affects: [REP-04, REP-07, web-repos, cli-repos, tui-repos]

tech-stack:
  added: []
  patterns:
    - Injectable repository adapters for dashboard read models
    - TDD RED/GREEN contract tests for read-model fields

key-files:
  created:
    - src/repos/dashboard.ts
    - src/repos/__tests__/models.ts
  modified:
    - src/repos/__tests__/dashboard.test.ts

key-decisions:
  - "Repo dashboard service exposes injectable repository adapters plus top-level getRepoDashboard/getRepoDetail wrappers for future tRPC wiring."
  - "Dashboard health resolves failed sync before stale recency checks, preserving failed error visibility."

patterns-established:
  - "RepoDashboardRepositories isolates persistence reads from UI/TUI projections while forcing orgId through every query."
  - "Repo detail tabs use a shared capped selector limit of 20 entries per slice."

requirements-completed: [REP-04]

duration: 6min
completed: 2026-05-05
---

# Phase 07 Plan 02: Repo Dashboard Read Model Summary

**Tenant-scoped repo dashboard projection with branch, dirty state, recent commit, open task count, health, watcher status, and capped detail tabs**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-05T20:45:00Z
- **Completed:** 2026-05-05T20:50:51Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added `src/repos/dashboard.ts` with `getRepoDashboard` and `getRepoDetail` exports plus an injectable `createRepoDashboardService`.
- Locked REP-04 dashboard contract with tests for required row fields, stale/failed health, org-scoped open task counts, and latest-20 detail slices.
- Added reusable typed fixture builders in `src/repos/__tests__/models.ts`.

## Task Commits

1. **Task 1: RED tests for dashboard row contract** - `814c5642` (test)
2. **Task 2: Build repo dashboard service** - `acd5ecd4` (feat)
3. **Task 3: Add lightweight fake data fixture helper** - `ed133a42` (test)

## Files Created/Modified

- `src/repos/dashboard.ts` - Repo dashboard projection interfaces, health mapping, default wrapper, and detail selector service.
- `src/repos/__tests__/dashboard.test.ts` - REP-04 contract tests for list rows, health, tenancy, and detail tabs.
- `src/repos/__tests__/models.ts` - Typed mock constructors for repos, branches, commits, files, tasks, sync-log rows, and repository adapters.

## Decisions Made

- Used injected repository adapters instead of embedding persistence reads in the projection service, preserving tRPC/service reuse without adding raw SQL.
- Kept top-level `getRepoDashboard(orgId)` and `getRepoDetail(orgId, repoId)` wrappers to match plan exports while allowing tests and future routers to inject concrete MikroORM-backed repositories.
- Treated sync status `error`/`failed` as `health=failed` before stale checks so last sync errors remain visible.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used project TypeScript command because direct `tsc` was unavailable**
- **Found during:** Task 2 verification
- **Issue:** Plan command `tsc --noEmit --project src/tsconfig.json` failed because `tsc` is not on PATH and `src/tsconfig.json` does not exist.
- **Fix:** Verified owned files with `bun run --bun tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --strict --types bun src/repos/dashboard.ts src/repos/__tests__/dashboard.test.ts src/repos/__tests__/models.ts`.
- **Files modified:** None
- **Verification:** Scoped TypeScript command passed.
- **Committed in:** N/A

---

**Total deviations:** 1 auto-fixed (Rule 3).
**Impact on plan:** Verification adapted to repo configuration only; implementation scope unchanged.

## Issues Encountered

- Root `bun run lint` currently fails on pre-existing, out-of-scope files from other phase work (`src/artifacts`, `src/memory`, `src/search`, docs/trpc tests). Owned files pass scoped TypeScript verification.
- Parallel executors committed other Phase 07 work while this plan ran; no conflicting owned-file edits occurred.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

REP-04 read model is ready for `src/trpc/routers/repos.ts` wiring in a later plan. Detail tab shapes now exist for Web/CLI/TUI parity work.

## Verification

- `bun test src/repos/__tests__/dashboard.test.ts` - PASS, 5 tests.
- `bun run --bun tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --strict --types bun src/repos/dashboard.ts src/repos/__tests__/dashboard.test.ts src/repos/__tests__/models.ts` - PASS.
- `rg -n "SELECT|INSERT|UPDATE|DELETE|raw\\(|execute\\(|query\\(" src/repos/dashboard.ts || true` - PASS, no raw SQL.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- Files verified present: `src/repos/dashboard.ts`, `src/repos/__tests__/dashboard.test.ts`, `src/repos/__tests__/models.ts`, `.planning/phases/07-repos-artifacts-notifications/07-02-SUMMARY.md`.
- Commits verified present: `814c5642`, `acd5ecd4`, `ed133a42`.

---
*Phase: 07-repos-artifacts-notifications*
*Completed: 2026-05-05*
