---
phase: 08-surface-delivery
plan: 3
subsystem: api
tags: [hono, zod-openapi, trpc, rate-limit, rest]

requires:
  - phase: 08-surface-delivery
    provides: surface parity inventory and API gap tests
provides:
  - Public REST OpenAPI parity tests for Phase 08 domains
  - Shared schema validation coverage for API-facing tRPC schemas
  - REST docs, artifacts, runs, and memory adapters delegated to shared tRPC callers
  - Fulcrum-owned fixed-window API rate limiter with standard headers
affects: [phase-08-api, public-api, cli-tui-web-parity]

tech-stack:
  added: []
  patterns:
    - Hono middleware for local-first fixed-window limits
    - REST route adapters delegate to injected shared tRPC caller
    - OpenAPI 3.1 validation through existing @hono/zod-openapi

key-files:
  created:
    - src/api/rate-limit.ts
    - src/trpc/__tests__/schema-validation.test.ts
  modified:
    - src/api/hono.ts
    - src/api/routes/docs.ts
    - src/api/routes/artifacts.ts
    - src/api/routes/runs.ts
    - src/api/routes/memory.ts
    - src/api/__tests__/phase08-api-parity.test.ts

key-decisions:
  - "Rate limiting stays Fulcrum-owned: fixed-window in-memory middleware keyed by user id, org id, API key hash, then remote address."
  - "REST route modules for docs/artifacts/runs/memory now require shared tRPC callers instead of maintaining local mutable stores."
  - "Unsupported memory action endpoints return explicit 501 errors rather than faking success without tRPC backing."

patterns-established:
  - "REST adapters use OpenAPI route definitions for contract generation and call shared tRPC/service paths for behavior."
  - "API limit headers are emitted as X-RateLimit-Limit, X-RateLimit-Remaining, and X-RateLimit-Reset on public API routes."

requirements-completed: [API-01, API-02, API-03, API-04, API-05]

duration: 34min
completed: 2026-05-05T23:35:40Z
---

# Phase 08 Plan 03: REST/API Surface Summary

**Hono REST surface now exposes OpenAPI 3.1 parity tests, schema validation gates, tRPC-backed route adapters, and identity-keyed rate limiting.**

## Performance

- **Duration:** 34 min
- **Started:** 2026-05-05T23:01:00Z
- **Completed:** 2026-05-05T23:35:40Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added RED/GREEN API parity tests for `/api/v1/openapi.json`, required Phase 08 paths, rate-limit headers, and schema validation rejection.
- Replaced docs, artifacts, runs, and memory REST-local stores with injected shared tRPC caller adapters.
- Added `src/api/rate-limit.ts` fixed-window middleware and mounted it in `src/api/hono.ts`.

## Task Commits

1. **Task 1: RED API route/OpenAPI/rate-limit tests** - `e8153396` (test)
2. **Task 2: Replace REST stubs with real handlers** - `d1c770fa` (feat)
3. **Task 3: Add Fulcrum-owned rate limiter** - `eaf77ca1` (feat)

## Files Created/Modified

- `src/api/rate-limit.ts` - Fixed-window Hono middleware with identity keying, standard headers, and `RATE_LIMITED` 429 body.
- `src/api/hono.ts` - Adds optional shared tRPC caller injection and mounts rate limiting on the public API app.
- `src/api/routes/docs.ts` - Delegates docs REST operations to `trpc.docs`.
- `src/api/routes/artifacts.ts` - Delegates artifact listing to `trpc.artifacts.list`.
- `src/api/routes/runs.ts` - Delegates run listing/detail to `trpc.orchestration`.
- `src/api/routes/memory.ts` - Delegates memory CRUD to `trpc.memories`; unsupported action endpoints fail explicitly with 501.
- `src/api/__tests__/phase08-api-parity.test.ts` - OpenAPI, route parity, route-store, and rate-limit tests.
- `src/trpc/__tests__/schema-validation.test.ts` - Shared schema rejection tests for tasks, docs, search, notifications, artifacts, repos, runs, and memory.

## Decisions Made

- Used existing `@hono/zod-openapi` and `OpenAPIHono`; no API framework change.
- Implemented Fulcrum-owned rate limiting instead of adding `hono-rate-limiter`.
- Returned explicit 501 for memory promote/archive/restore/context preview when no real tRPC contract exists, avoiding false successful behavior.
- Did not update `.planning/STATE.md`, `.planning/ROADMAP.md`, or `.planning/REQUIREMENTS.md`; user explicitly assigned phase state to orchestrator.

## Deviations from Plan

None requiring scope change. Implementation stayed within listed API/test files plus created planned `src/api/rate-limit.ts`.

## Issues Encountered

- The plan-level broad grep still finds legacy wording in `src/api/routes/tasks.ts`, `src/api/routes/sprints.ts`, and `src/api/routes/saved-views.ts`. Those files were outside the 08-03 file list and were not edited. Required 08-03 route modules (`docs`, `search`, `artifacts`, `runs`, `memory`, `hono`) are clean.
- Other agents modified CLI and migration files concurrently; those files were left untouched.

## Verification

- `bun test src/api/__tests__/phase08-api-parity.test.ts src/trpc/__tests__/schema-validation.test.ts` - 14 pass, 0 fail.
- `rg -n "stub store|In-memory|replaced by Pillar|hardcoded" src/api/routes/docs.ts src/api/routes/search.ts src/api/routes/artifacts.ts src/api/routes/runs.ts src/api/routes/memory.ts src/api/hono.ts` - no matches.
- `rg -n "stub store|In-memory|replaced by Pillar|hardcoded" src/api/routes src/api/hono.ts` - residual matches only in out-of-scope legacy `tasks.ts`, `sprints.ts`, and `saved-views.ts`.

## Known Stubs

- `src/api/routes/memory.ts` memory promote/archive/restore/context preview endpoints return 501 because no real tRPC contract currently exists for those actions. They do not mutate local state or fake success.

## User Setup Required

None.

## Next Phase Readiness

Phase 08 API tests are green for 08-03-owned surfaces. Later API cleanup should decide whether to replace or remove legacy standalone `tasks`, `sprints`, and `saved-views` route modules now bypassed by kernel routes for authenticated public API usage.

## Self-Check: PASSED

- Created/modified files exist.
- Task commits `e8153396`, `d1c770fa`, and `eaf77ca1` exist in git history.
- Summary file exists.

---
*Phase: 08-surface-delivery*
*Completed: 2026-05-05T23:35:40Z*
