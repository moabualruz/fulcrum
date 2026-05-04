---
phase: 02-bug-fixes-foundation
plan: 08
subsystem: workers-auth-runtime
tags: [workers, auth, cli, tui, web, bug-17]
requirements: [FND-04, FND-05, BUG-17]
dependency_graph:
  requires: [02-02, 02-06, 02-07]
  provides:
    - Extensible worker registry with runtime payload assertions
    - CLI/TUI/Web auth and init parity for local seeded sessions
    - BUG-17 deferral preserved exactly
  affects: [workers, notifications, artifacts, repos, cli, tui, web]
tech_stack:
  added: []
  patterns:
    - Typed worker task registry with assertion-before-handler execution
    - Shared database resolver for init and auth commands
    - Explicit local-dev auth route handling
key_files:
  created:
    - src/workers/registry.ts
    - tests/workers/registry.test.ts
    - src/cli/commands/auth.test.ts
    - src/tui/screens/auth.test.ts
    - src/web/src/routes/auth/auto-session/+server.ts
  modified:
    - src/artifacts/worker.ts
    - src/notifications/fanout-worker.ts
    - src/repos/workers/sync-local.ts
    - src/repos/workers/sync-remote.ts
    - src/cli/commands/auth.ts
    - src/cli/commands/init.ts
    - src/web/src/hooks.server.ts
    - src/web/src/lib/server/dashboard.ts
    - src/web/tests/e2e/auth-login.spec.ts
decisions:
  - Worker payload assertions run before task handlers and async handler failures propagate.
  - fulcrum init and auth whoami use the same PGlite resolver path.
  - Local dev auto-session is excluded from /auth/*; /auth/auto-session keeps the explicit seeded-session redirect.
  - BUG-17 deferred outside Phase 2 product/runtime execution per D-04
metrics:
  duration: "~100m"
  completed_at: 2026-05-04
  tasks: 4
  task_commits: 4
---

# Phase 02 Plan 08: Worker Registry and Auth Parity Summary

Extensible worker registry with runtime payload validation, plus Web/CLI/TUI auth-init parity for local seeded sessions.

## Tasks Completed

| Task | Name | Commit | Result |
| --- | --- | --- | --- |
| 1 | RED tests for worker registry and auth parity | da911c96 | Added failing coverage for missing registry, CLI session error, TUI auth screen, and Web auto-session smoke. |
| 2 | Worker registry implementation | c2d542b4 | Added typed registry and wired artifact, notification, and repo sync worker payload assertions. |
| 3 | Auth/init parity implementation | 1b158cd1 | Aligned init DB path with auth commands, fixed local-dev auth routing, and added dashboard DB-handle compatibility. |
| 4 | Preserve BUG-17 deferral | 535446a8 | Kept repo hygiene outside Phase 2 runtime scope and fixed blocking registry assertion typing discovered by typecheck. |

BUG-17 deferred outside Phase 2 product/runtime execution per D-04

No local main sync, pull, push, or repo hygiene action was performed for BUG-17.

## Verification

Passed:

- `bun test tests/workers/registry.test.ts tests/notifications/fanout-worker.test.ts tests/artifacts/worker.test.ts tests/repos/sync-local.test.ts tests/repos/sync-remote.test.ts`
- `bun test src/cli/commands/auth.test.ts tests/cli/auth.test.ts src/tui/screens/auth.test.ts tests/trpc/auth.test.ts`
- `cd src/web && bunx playwright test tests/e2e/auth-login.spec.ts`
- `bun run --bun tsc --noEmit`
- `rg "BUG-17.*defer|D-04" .planning/phases/02-bug-fixes-foundation/02-CONTEXT.md`

Full `bun run ci` result:

- Passed stages: `install`, `typecheck`, `symphony:lock`, `symphony:conformance`, `trpc:permissions`
- Failed stage: `test`
- Final count: 3661 pass, 2 skip, 244 fail, 1 error

The failing full-suite tests are outside this plan's worker/auth files and match pre-existing ARCH-02 raw `ProductDb` vs MikroORM `EntityManager` fixture migration drift, plus existing schema/snapshot drift in sprints and shell completions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed CLI init/auth database path mismatch**
- **Found during:** Task 3
- **Issue:** `fulcrum init` seeded one PGlite directory while `auth whoami` opened the shared resolver default.
- **Fix:** `init` now uses `resolveDatabaseConfig()` so seeded sessions are visible to auth commands.
- **Files modified:** `src/cli/commands/init.ts`
- **Commit:** 1b158cd1

**2. [Rule 1 - Bug] Fixed local-dev auth route interception**
- **Found during:** Task 3 Web auth verification
- **Issue:** local-dev auto-session creation redirected `/auth/login` to the dashboard before login/logout route assertions could run.
- **Fix:** excluded `/auth/*` from implicit local-dev auto-session creation and added explicit `/auth/auto-session` redirect route.
- **Files modified:** `src/web/src/hooks.server.ts`, `src/web/src/routes/auth/auto-session/+server.ts`
- **Commit:** 1b158cd1

**3. [Rule 1 - Bug] Fixed dashboard DB handle compatibility**
- **Found during:** Task 3 Web auth verification
- **Issue:** dashboard loading expected `em.getConnection()` but the route passed raw `ProductDb`.
- **Fix:** added a small query adapter so dashboard loading accepts either MikroORM `EntityManager` or `ProductDb`.
- **Files modified:** `src/web/src/lib/server/dashboard.ts`
- **Commit:** 1b158cd1

**4. [Rule 3 - Blocking] Fixed TypeScript assertion-function call target**
- **Found during:** Overall typecheck
- **Issue:** `task.assertPayload(payload)` failed `TS2775` because assertion functions need an explicitly typed call target.
- **Fix:** copied the assertion function into an explicitly typed local before invocation.
- **Files modified:** `src/workers/registry.ts`
- **Commit:** 535446a8

## Known Stubs

| File | Line | Reason |
| --- | ---: | --- |
| `src/cli/commands/auth.ts` | 215 | Existing interactive `login` stub predates this plan; FND-05 only required stable session/error parity for current auth commands. |
| `src/cli/commands/auth.ts` | 234 | Existing `logout` stub predates this plan; session invalidation remains a later pillar. |

## Deferred Issues

- `bun run ci` broad `test` stage remains blocked by pre-existing ARCH-02 EntityManager fixture migration across product-kernel, connector, search, TUI, REST, notification, and sprint suites.
- Sprint tests also expose existing `closed_at` schema drift.
- Shell completion test expects `notifications` while generated completion exposes current `notify` domain.

## Threat Flags

None. New worker and auth surfaces were planned in the task threat model and include runtime payload assertion and explicit missing-session behavior.

## Self-Check: PASSED

- Summary file created: `.planning/phases/02-bug-fixes-foundation/02-08-SUMMARY.md`
- Task commits found: `da911c96`, `c2d542b4`, `1b158cd1`, `535446a8`
- BUG-17 exact deferral string present.
