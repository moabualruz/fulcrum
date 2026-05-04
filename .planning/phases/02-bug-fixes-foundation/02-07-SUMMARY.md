---
phase: 02-bug-fixes-foundation
plan: 07
subsystem: api-security
tags: [trpc, casbin, authorization, ci, codegen]

requires:
  - phase: 02-bug-fixes-foundation
    provides: 02-01 tRPC scaffold and router surface
provides:
  - Explicit resource/action metadata for protected tRPC procedures
  - Hard default CI gate for tRPC permission lint
  - Env-gated local development permission bypass with audit log line
affects: [trpc, cli-codegen, authorization, ci]

tech-stack:
  added: []
  patterns:
    - permissionedProcedure with explicit resource/action metadata
    - local bypass gated by FULCRUM_FEATURES

key-files:
  created:
    - src/trpc/permissions.ts
  modified:
    - src/trpc/middleware.ts
    - src/trpc/trpc.ts
    - src/server/trpc/routers/**
    - src/trpc/routers/**
    - scripts/ci.ts
    - scripts/ci.test.ts
    - tests/trpc/app-router-scaffold.test.ts
    - tests/trpc/router.test.ts

key-decisions:
  - "Protected tRPC routers use explicit permission metadata as the authorization source of truth; path derivation remains fallback only for migration/test surfaces."
  - "Local development permission bypass is controlled by the registered trpc-permission-local-dev-bypass feature flag and logs each bypass."
  - "Default CI now runs a hard trpc:permissions gate before the broad root test suite."

patterns-established:
  - "Use permissionedProcedure({ resource, action }) for protected tRPC routes."
  - "Generated CLI snapshots exclude newly permissioned domains unless codegen can safely wire invocation."

requirements-completed: [FND-02]

duration: 2h 5m
completed: 2026-05-04
---

# Phase 02 Plan 07: tRPC Permission Enforcement Summary

**Explicit tRPC permission metadata backed by Casbin checks, gated local bypass, and a hard CI permission lint stage**

## Performance

- **Duration:** 2h 5m
- **Started:** 2026-05-04T10:59:00Z
- **Completed:** 2026-05-04T13:04:23Z
- **Tasks:** 3
- **Files modified:** 64

## Accomplishments

- Added `src/trpc/permissions.ts` with canonical tRPC resources, actions, permission metadata, and the local bypass flag name.
- Converted protected tRPC routers to `permissionedProcedure({ resource, action })`.
- Updated `assertPermission()` so explicit metadata wins, Casbin remains enforced when enabled, spoofed input cannot override server metadata, and local bypass requires `FULCRUM_FEATURES=trpc-permission-local-dev-bypass`.
- Added `trpc:permissions` as a hard default CI stage before the broad root test suite.
- Refreshed generated CLI completions and generated command snapshots after AppRouter metadata changed.

## Task Commits

1. **Task 1: Add RED permission lint fixtures** - `94382e42` (test)
2. **Task 2: Add explicit permission helper and metadata** - `55ff1775` (feat)
3. **Task 3: Wire permission lint into default CI** - `be985bab` (feat)

## Files Created/Modified

- `src/trpc/permissions.ts` - Permission metadata types, resource/action constants, and helper.
- `src/trpc/middleware.ts` - Explicit metadata authorization, Casbin fallback behavior, and logged local bypass.
- `src/trpc/trpc.ts` - tRPC meta typing for permission metadata.
- `src/server/trpc/routers/**` and `src/trpc/routers/**` - Protected procedure metadata added.
- `scripts/ci.ts` and `scripts/ci.test.ts` - Hard permission lint CI gate and assertions.
- `tests/trpc/app-router-scaffold.test.ts` and `tests/trpc/router.test.ts` - Permission lint and bypass coverage.
- `scripts/cli/completions.*` and `src/cli/generated/*` - Generated CLI artifacts refreshed from AppRouter metadata.

## Decisions Made

- Explicit permission metadata is the source of truth for protected tRPC routes. Path-derived resource/action remains only as fallback for migration and dynamically constructed test routes.
- The bypass flag is intentionally env-feature based, not a silent development default.
- Generated CLI deletion of permissioned domains is intentional output from codegen after protected metadata was added.

## Verification

- `bun test tests/trpc/app-router-scaffold.test.ts tests/trpc/router.test.ts` failed during RED as expected, naming missing explicit permission metadata and denied local bypass.
- `bun test tests/trpc/app-router-scaffold.test.ts tests/trpc/router.test.ts tests/permissions/casbin-adapter.test.ts` passed: 41 pass, 0 fail.
- `bun run --bun tsc --noEmit` passed.
- `semgrep --config auto src/trpc/middleware.ts src/trpc/permissions.ts src/trpc/trpc.ts src/server/trpc/routers src/trpc/routers src/secrets/credentials-router.ts src/subscriptions/procedures.ts --json` reported 0 findings; Semgrep emitted one parser warning for `src/secrets/credentials-router.ts`.
- `bun test scripts/ci.test.ts tests/infrastructure/p1-coverage-matrix.test.ts tests/flags/registry.test.ts` passed: 45 pass, 0 fail.
- `bun run scripts/ci/codegen.ts` passed.
- `bun run ci` reached and passed `trpc:permissions`, then failed in the existing broad `test` stage. Failure was not caused by the new permission gate; see Deferred Issues.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Extended permission metadata beyond initial router glob**
- **Found during:** Task 2
- **Issue:** Protected subscription and credentials tRPC surfaces share the authorization boundary but were outside the narrow initial router examples.
- **Fix:** Added explicit permission metadata to those protected procedures too.
- **Files modified:** `src/secrets/credentials-router.ts`, `src/subscriptions/procedures.ts`
- **Verification:** Focused tRPC tests and typecheck passed.
- **Committed in:** `55ff1775`

**2. [Rule 1 - Bug] Updated tests that encoded old global lists**
- **Found during:** Task 3
- **Issue:** New feature flag and new CI step made registry and baseline tests stale.
- **Fix:** Added `trpc-permission-local-dev-bypass` to flag expectations and updated CI baseline to 15 default stages.
- **Files modified:** `tests/flags/registry.test.ts`, `tests/infrastructure/p1-coverage-matrix.test.ts`
- **Verification:** Focused CI/flag tests passed.
- **Committed in:** `be985bab`

**3. [Rule 3 - Blocking] Refreshed generated CLI artifacts**
- **Found during:** Task 3
- **Issue:** AppRouter metadata changes made the committed generated CLI snapshot diverge.
- **Fix:** Ran `bun run scripts/cli/codegen.ts`, which pruned generated CLI wrappers for newly permissioned domains and updated completions/search output.
- **Files modified:** `scripts/cli/completions.*`, `src/cli/generated/*`
- **Verification:** `bun run scripts/ci/codegen.ts` passed.
- **Committed in:** `be985bab`

---

**Total deviations:** 3 auto-fixed (1 missing critical, 1 bug, 1 blocking)
**Impact on plan:** All changes were required for the permission threat model or CI correctness. No architecture change required.

## Known Stubs

- Existing stub routers remain in `src/trpc/routers/agent-runs.ts`, `src/trpc/routers/connectors.ts`, `src/trpc/routers/context.ts`, `src/trpc/routers/custom-fields.ts`, `src/trpc/routers/doc-comments.ts`, `src/trpc/routers/doc-links.ts`, `src/trpc/routers/doc-versions.ts`, `src/trpc/routers/invitations.ts`, `src/trpc/routers/projects.ts`, `src/trpc/routers/repo-branches.ts`, and `src/trpc/routers/repo-commits.ts`. This plan added explicit permission metadata only; those placeholder data implementations predate this plan.

## Threat Flags

None. This plan hardened an existing authorization boundary and added no new network endpoints, schema changes, or file access trust boundary.

## Deferred Issues

- `bun run ci` broad `test` stage still fails with pre-existing ARCH-02 raw ProductDb versus MikroORM EntityManager migration errors across product-kernel and related tests.
- `tests/a11y/accessibility-audit.test.ts` reports missing `@playwright/test`, pre-existing dependency/config issue.
- Additional broad-suite failures remain outside this plan's changed surface, including REST/OpenAPI parity, sprint migration `updated_at`, and generated shell-completion contract expectations tied to larger CLI/codegen work.

## User Setup Required

None.

## Next Phase Readiness

Protected tRPC procedures now carry explicit permission metadata and CI has a focused hard gate for regressions. Remaining suite health depends on the existing ARCH-02 EntityManager migration cleanup.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/02-bug-fixes-foundation/02-07-SUMMARY.md`.
- Task commits found: `94382e42`, `55ff1775`, `be985bab`.
- Planning state updated for current plan/progress, ROADMAP progress, and requirement `FND-02`.

---
*Phase: 02-bug-fixes-foundation*
*Completed: 2026-05-04*
