---
phase: 09-cross-cutting-testing
plan: 06
subsystem: infrastructure-safety
tags: [migrations, downgrade, shutdown, ci, pglite]
requires:
  - phase: 09-00
    provides: Phase 09 parity matrix and RED gates
provides:
  - migration downgrade smoke gate
  - graceful shutdown coordinator
  - local CI infrastructure safety gates
affects: [db-migrations, platform, ci]
tech-stack:
  added: []
  patterns: [migrate-down-up smoke, ordered shutdown hooks, idempotent shutdown promise]
key-files:
  created:
    - tests/db/migration-downgrade.test.ts
    - src/platform/graceful-shutdown.ts
    - tests/platform/graceful-shutdown.test.ts
  modified:
    - scripts/ci.ts
    - scripts/ci.test.ts
requirements-completed: [XCT-10, XCT-12, TST-01]
duration: 11 min
completed: 2026-05-06
---

# Phase 09 Plan 06: Infrastructure Safety Summary

**Migration downgrade smoke, graceful shutdown coordination, and CI safety gates**

## Performance

- **Duration:** 11 min
- **Completed:** 2026-05-06
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added a PGlite/MikroORM migration smoke that migrates to latest, runs `migrateDown` one step, migrates back up, and verifies schema queries still work.
- Added a migration file contract test requiring every migration to implement `down()`.
- Added `createGracefulShutdown` with ordered hooks: workers, subscriptions, HTTP server, database, workspaces.
- Added idempotency and concurrent-call tests for shutdown completion.
- Added `migration:downgrade` and `graceful:shutdown` gates before `build:all` in local CI.

## Task Commits

1. **Task 1: Add migration downgrade smoke** - `e6dcd790` (`test(09-06)`)
2. **Task 2: Implement graceful shutdown coordinator** - `96f8cbf4` (`feat(09-06)`)
3. **Task 3: Add infrastructure gates to CI** - `3cebd3f8` (`ci(09-06)`)

## Files Created/Modified

- `tests/db/migration-downgrade.test.ts` - Downgrade/up smoke and `down()` contract.
- `src/platform/graceful-shutdown.ts` - Ordered, idempotent shutdown coordinator.
- `tests/platform/graceful-shutdown.test.ts` - Hook order, repeated signal, concurrent call coverage.
- `scripts/ci.ts` - Local CI infrastructure gates before build.
- `scripts/ci.test.ts` - CI step ordering and command assertions.

## Decisions Made

- Used MikroORM's migrator API directly for downgrade smoke to exercise actual migration `down()` behavior.
- Cached the first successful shutdown result so repeated and concurrent signals do not run cleanup hooks twice.

## Deviations from Plan

- The smoke verifies the MikroORM migration table plus `SchemaMigration` metadata, rather than populating the custom `schema_migrations` ledger through `MigratorService`.

**Total deviations:** 1 auto-fixed.
**Impact on plan:** No safety gate loss; the test exercises real down/up migration behavior and schema viability.

## Issues Encountered

None.

## Verification

- `bun test scripts/ci.test.ts tests/db/migration-downgrade.test.ts tests/platform/graceful-shutdown.test.ts` - PASS, 21 tests.

## User Setup Required

None.

## Next Phase Readiness

Wave 2 complete. Ready for 09-07 gate inventory and regression coverage.

## Self-Check: PASSED

---
*Phase: 09-cross-cutting-testing*
*Completed: 2026-05-06*
