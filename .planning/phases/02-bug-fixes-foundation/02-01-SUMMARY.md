---
phase: 02-bug-fixes-foundation
plan: 01
subsystem: ci
tags: [bun, sveltekit, playwright, ci, release, lockfile]

requires:
  - phase: 02-bug-fixes-foundation
    provides: Phase 2 bug-fix planning and CI dependency-first decisions
provides:
  - Root CI stable web gates with smoke e2e always-on
  - Full web e2e suite retained as FULCRUM_RUN_E2E opt-in
  - Release gate ownership of skills lint and compression checks
  - Web lockfile no longer resolves runtime cookie@0.6.0
affects: [ci, release, web, security, phase-02]

tech-stack:
  added: []
  patterns:
    - Bun package overrides for vulnerable transitive runtime dependencies
    - Product CI and release-only content gates split by scripts/ci.ts and scripts/release.ts

key-files:
  created:
    - .planning/phases/02-bug-fixes-foundation/02-01-SUMMARY.md
  modified:
    - scripts/ci.ts
    - scripts/ci.test.ts
    - scripts/release.ts
    - src/web/package.json
    - src/web/bun.lock
    - tests/infrastructure/p1-coverage-matrix.test.ts

key-decisions:
  - "Root CI now owns stable product gates; skills lint and compression run during release."
  - "web:e2e:smoke is default CI; web:e2e:full remains opt-in through FULCRUM_RUN_E2E=1."
  - "cookie@0.6.0 is removed with a Bun override to cookie@0.7.2 because latest SvelteKit still declares cookie ^0.6.0."

patterns-established:
  - "CI STEPS contract tests assert required product gates and excluded release-only gates."
  - "Web package keeps web:e2e as compatibility alias for the full Playwright suite."

requirements-completed: [BUG-03, BUG-04, BUG-16]

duration: 5min
completed: 2026-05-04
---

# Phase 02 Plan 01: CI Web Gates and Cookie Lockfile Summary

**Root CI now runs stable web checks, build, unit tests, and smoke e2e while release owns content gates and web runtime cookie resolves to 0.7.2**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-04T11:03:00Z
- **Completed:** 2026-05-04T11:07:42Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added RED CI contract tests for stable web gates, smoke e2e, release-only exclusions, web e2e scripts, and vulnerable cookie lockfile resolution.
- Updated root CI to include `web:check`, `web:build`, `web:test`, and default `web:e2e:smoke`; renamed opt-in full e2e step to `web:e2e:full`.
- Moved `skills:lint` and `compress:check` from product CI into `scripts/release.ts`.
- Upgraded SvelteKit package metadata and added a Bun `overrides.cookie` entry so the web lockfile resolves runtime `cookie@0.7.2`.

## Task Commits

1. **Task 1: Add RED CI contract tests** - `f8233c05` (test)
2. **Task 2: Restructure CI and web scripts** - `e36e4e7a` (feat)
3. **Task 3: Remove cookie 0.6.0 from web lockfile** - `b9107b72` (fix)

## Files Created/Modified

- `scripts/ci.test.ts` - CI policy and lockfile contract tests.
- `scripts/ci.ts` - Stable product CI steps, smoke e2e, and opt-in full e2e naming.
- `scripts/release.ts` - Release-only skills lint and compression checks.
- `src/web/package.json` - Smoke/full e2e scripts, SvelteKit metadata update, and Bun cookie override.
- `src/web/bun.lock` - Bun-generated lockfile resolving runtime `cookie@0.7.2`.
- `tests/infrastructure/p1-coverage-matrix.test.ts` - Baseline CI matrix updated for new product gate contract.

## Decisions Made

- Kept `web:e2e` as an alias for `web:e2e:full` to preserve existing callers while making full-suite intent explicit.
- Used a Bun override for `cookie` because `@sveltejs/kit@2.59.0` still declares `cookie: ^0.6.0`; frozen install verifies the override is honored.
- Treated the existing P1 CI baseline test update as required collateral because it asserted the old CI contract directly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing CI baseline test for new gate policy**
- **Found during:** Task 2 (Restructure CI and web scripts)
- **Issue:** `tests/infrastructure/p1-coverage-matrix.test.ts` asserted the old 15-step CI list with `skills:lint` and `compress:check`.
- **Fix:** Updated the expected list to 14 product stages with `web:e2e:smoke` and full e2e opt-in.
- **Files modified:** `tests/infrastructure/p1-coverage-matrix.test.ts`
- **Verification:** `bun test tests/infrastructure/p1-coverage-matrix.test.ts`
- **Committed in:** `e36e4e7a`

**2. [Rule 3 - Blocking] Resolved Task 2/Task 3 verification ordering conflict**
- **Found during:** Task 2 (Restructure CI and web scripts)
- **Issue:** Task 1 correctly added the cookie lockfile RED test, making Task 2's `bun test scripts/ci.test.ts` impossible to pass until Task 3 changed the lockfile.
- **Fix:** Verified all Task 2 CI/script criteria except the known cookie assertion before committing Task 2, then cleared the cookie assertion in Task 3.
- **Files modified:** `scripts/ci.test.ts`, `src/web/package.json`, `src/web/bun.lock`
- **Verification:** `bun test scripts/ci.test.ts` passed after Task 3.
- **Committed in:** `e36e4e7a`, `b9107b72`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** No scope expansion beyond direct CI contract fallout and planned lockfile remediation.

## Verification

- `bun test scripts/ci.test.ts` - PASS
- `bun test tests/infrastructure/p1-coverage-matrix.test.ts` - PASS
- `cd src/web && bun install --frozen-lockfile` - PASS
- `rg '"cookie": \["cookie@0\.6\.0"' src/web/bun.lock` - PASS (no matches)
- `FULCRUM_RUN_E2E=1 bun -e 'const m=await import("./scripts/ci.ts"); ...'` - PASS, includes `web:e2e:full`
- `bun run ci` - FAIL on pre-existing `symphony:conformance` migration issue, after `install`, `typecheck`, and `symphony:lock` passed

## Issues Encountered

- `bun run ci` fails outside this plan's touched surface in `Migration20260504130000_ddl_cleanup`: `alter table "doc_links" alter column "id" set default gen_random_uuid()::text` attempts to set a text default on a uuid column. This blocks full root CI before web gates run. It was not introduced by this plan and was left for the relevant migration bug-fix plan.

## Known Stubs

None.

## Threat Flags

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CI/web/cookie plan objectives are implemented and targeted checks pass.
- Full root CI remains blocked by unrelated migration default-type mismatch in `Migration20260504130000_ddl_cleanup`.

## Self-Check: PASSED

- Summary file exists.
- Task commits exist: `f8233c05`, `e36e4e7a`, `b9107b72`.
- Required files modified by the plan are present.

---
*Phase: 02-bug-fixes-foundation*
*Completed: 2026-05-04*
