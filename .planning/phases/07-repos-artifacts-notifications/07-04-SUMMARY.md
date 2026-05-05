---
phase: 07-repos-artifacts-notifications
plan: 04
subsystem: repos
tags: [repos, rest-api, trpc, queue, zod, tenant-safety, bun-test]

requires:
  - phase: 07-repos-artifacts-notifications
    provides: "07-01 repo sync queue task names and worker registrations"
  - phase: 07-repos-artifacts-notifications
    provides: "07-02 repo dashboard read model and tenant-scoped repo status expectations"
provides:
  - "Repo REST routes delegated to canonical tRPC repo caller"
  - "Shared repo list, sync, and status Zod schemas"
  - "Queue-backed tRPC syncRepo and tenant-scoped statusRepo procedures"
affects: [REP-05, REP-06, REP-07, cli-repos, tui-repos, public-api]

tech-stack:
  added: []
  patterns:
    - "OpenAPIHono route handlers validate request shape then delegate to tRPC caller"
    - "Repo sync mutations enqueue worker task names and return queued job metadata"

key-files:
  created:
    - src/api/__tests__/repos.api.test.ts
  modified:
    - src/api/routes/repos.ts
    - src/trpc/schemas/repos.ts
    - src/trpc/routers/repos.ts

key-decisions:
  - "REST repo routes now require a tRPC caller in Hono context instead of falling back to local stub data."
  - "syncRepo returns queued job metadata while persisted sync state moves to syncing for status visibility."
  - "statusRepo returns null for out-of-org repo IDs, letting REST map tenant misses to 404."

patterns-established:
  - "REST repo handlers use shared schemas from src/trpc/schemas/repos.ts for list/sync/status parity."
  - "Repo queue task selection maps local repos to repo.sync.local and remote repos to repo.sync.remote."

requirements-completed: [REP-05, REP-06]

duration: 9min
completed: 2026-05-05
---

# Phase 07 Plan 04: Repo REST and tRPC Wiring Summary

**Repo REST and tRPC sync/status surfaces now delegate through shared schemas and queue-backed repo sync tasks**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-05T20:48:00Z
- **Completed:** 2026-05-05T20:57:22Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added failing REST contract tests for repo list delegation, sync enqueue response, tenant-safe status, and shared schema validation.
- Replaced the fixed in-memory repo route with OpenAPIHono routes for list, sync, and status that call the canonical tRPC repo caller.
- Added shared repo schemas plus `syncRepo` and `statusRepo` tRPC procedures backed by `repo.sync.local` / `repo.sync.remote` queue task names.

## Task Commits

1. **Task 1: RED tests for repo route delegation and schema integrity** - `0366c435` (test)
2. **Task 2: Replace stub REST handlers with tRPC-backed operations** - `c25c80f5` (feat)
3. **Task 3: Ensure tRPC repos router exposes queue-backed sync/status methods** - `1342fca1` (feat)

## Files Created/Modified

- `src/api/__tests__/repos.api.test.ts` - REST contract tests proving caller delegation, queued sync response, tenant-safe 404, and schema validation.
- `src/api/routes/repos.ts` - Repo OpenAPI routes for list, sync, and status with shared Zod validation and tRPC caller delegation.
- `src/trpc/schemas/repos.ts` - Shared repo output, list, sync, queued-result, and status schemas.
- `src/trpc/routers/repos.ts` - Queue-backed `syncRepo`, tenant-scoped `statusRepo`, and `createRepoTask` helper.

## Decisions Made

- REST route runtime fails closed when no tRPC caller is present; no fallback fixture data remains.
- `syncRepo` enqueues first, then records `syncStatus: "syncing"` so status calls can report `running` while workers process.
- Status mapping is deterministic: error/failed -> `failed`, syncing/running -> `running`, missing or old last sync -> `stale`, recent idle -> `synced`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used scoped TypeScript verification with skipLibCheck**
- **Found during:** Task 2 verification
- **Issue:** Direct scoped TypeScript check surfaced an out-of-scope dependency declaration gap for `@cloudflare/workers-types` through Better Auth types.
- **Fix:** Verified owned files with `--skipLibCheck`, keeping strict checks on plan-owned source and tests.
- **Files modified:** None
- **Verification:** `bun run --bun tsc --noEmit --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --strict --types bun src/trpc/routers/repos.ts src/trpc/schemas/repos.ts src/api/routes/repos.ts src/api/__tests__/repos.api.test.ts`
- **Committed in:** N/A

---

**Total deviations:** 1 auto-fixed (Rule 3: 1).
**Impact on plan:** Verification adapted to existing dependency state only; implementation scope unchanged.

## Issues Encountered

- Stub scan reports the word `stub` in the test name asserting stub removal; no route stubs or fixture arrays remain.
- Raw-SQL scan reports `.query(` tRPC procedure builders in `src/trpc/routers/repos.ts`; no direct SQL query calls exist in route logic.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

REP-05 is complete for REST repo paths. REP-06 CLI wiring can now call `repos.list`, `repos.syncRepo`, and `repos.statusRepo` through the shared tRPC caller in the follow-up plan.

## Verification

- `bun test src/api/__tests__/repos.api.test.ts` - PASS, 4 tests.
- `bun run --bun tsc --noEmit --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --strict --types bun src/trpc/routers/repos.ts src/trpc/schemas/repos.ts src/api/routes/repos.ts src/api/__tests__/repos.api.test.ts` - PASS.
- `rg -n "stub|TODO|NotImplemented|STUB_REPOS|FIXED_ORG|\\[\\]" src/api/routes/repos.ts || true` - PASS, no route stub markers.
- `rg -n "syncRepo|statusRepo|createRepoTask|repo\\.sync|queued|running|stale|synced|failed" src/trpc/routers/repos.ts src/trpc/schemas/repos.ts` - PASS.
- `rg -n "SELECT|INSERT|UPDATE|DELETE|raw\\(|execute\\(|query\\(" src/api/routes/repos.ts` - PASS, no raw SQL in REST route logic.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- Files verified present: `src/api/__tests__/repos.api.test.ts`, `src/api/routes/repos.ts`, `src/trpc/schemas/repos.ts`, `src/trpc/routers/repos.ts`, `.planning/phases/07-repos-artifacts-notifications/07-04-SUMMARY.md`.
- Commits verified present: `0366c435`, `c25c80f5`, `1342fca1`.

---
*Phase: 07-repos-artifacts-notifications*
*Completed: 2026-05-05*
