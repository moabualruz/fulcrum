# Phase 2: Bug Fixes + Foundation - Research

**Researched:** 2026-05-04
**Status:** Ready for planning

## Research Goal

Phase 2 should produce dependency-cluster plans for BUG-01 through BUG-18 and FND-01 through FND-07. Planning should preserve the decisions from `02-CONTEXT.md`: dependency-first order, strict RED to GREEN evidence, separate RED commits, stable all-gates CI, explicit migrations for every DB backend, and hard permission coverage.

## Phase Shape

Recommended plan lanes:

1. **CI and web gate lane** — BUG-03, BUG-04, BUG-16, CI recipe restructuring.
2. **Compiled binary and DB backend lane** — BUG-01 plus DB config surface and explicit `fulcrum db migrate`.
3. **Installer ownership lane** — BUG-02, BUG-06, BUG-07, BUG-08, BUG-10, BUG-11, BUG-13, BUG-14.
4. **Product CLI and runtime bugs lane** — BUG-09, BUG-12, BUG-15, BUG-18.
5. **Foundation DB/flags/tenant lane** — FND-01, FND-03, FND-06, FND-07.
6. **Permissions lane** — FND-02.
7. **Worker/auth parity lane** — FND-04, FND-05.

BUG-17 is intentionally deferred from Phase 2 product/runtime execution per context.

## Current Code Findings

### CI/Web Gates

- Root CI lives in `scripts/ci.ts`.
- Current root CI already runs root install, typecheck, Symphony tests, root tests, license audit, codegen, `build:all`, web install, web check, web build, web Vitest, schema check, `skills:lint`, and `compress:check`.
- Current e2e behavior is opt-in via `FULCRUM_RUN_E2E=1`.
- Phase decision changes this shape:
  - Keep `bun run ci` as all stable gates.
  - Add smoke e2e to default CI.
  - Add named full e2e recipe.
  - Move `skills:lint` and `compress:check` to release gate.
  - Preserve focused target recipes.
- Web scripts exist in `src/web/package.json`: `check`, `build`, `web:test`, `web:e2e`, `web:a11y`.
- `src/web/bun.lock` still pins transitive `cookie@0.6.0` through `@sveltejs/kit`; BUG-16 should update web lock/dependency resolution and prove `cookie@0.6.0` absent.

### Compiled Binary and DB Backend

- `src/product-kernel/db/pglite.ts` currently detects compiled Bun binary via `/$bunfs/` and throws a friendly unsupported error.
- Phase 2 reverses that behavior: compiled binary must work with PGlite and PostgreSQL.
- Existing product-kernel CLI opens PGlite directly in `src/cli/product.ts` through local `openProductDb()`.
- MikroORM already supports PostgreSQL when `DATABASE_URL` starts with `postgresql://` or `postgres://`, and defaults to PGlite otherwise in `src/db/mikro-orm.config.ts`.
- Product-kernel has separate raw DB adapters:
  - `src/product-kernel/db/pglite.ts`
  - `src/product-kernel/db/postgres.ts`
  - `src/product-kernel/db/migrate.ts`
- Current migration command surface in help is `fulcrum db <migrate|status|history>`, but `product init` still auto-runs product-kernel migrations. Phase 2 should make `fulcrum db migrate` the explicit migration command for all backends.
- DB config should be surfaced as CLI setting + persisted config + env override. Existing env convention uses `DATABASE_URL`; project-specific names can be added only if they clearly map to existing config patterns.

### Permissions

- `src/trpc/middleware.ts` exports `assertPermission` and `protectedProcedure`.
- `assertPermission` currently enforces session/org/user presence, and conditionally checks Casbin when `casbin-policies` is enabled.
- Resource/action currently derives from procedure path: parent path as resource, leaf as action.
- Existing tests in `tests/trpc/router.test.ts` cover Casbin behavior, including derived resource/action and spoofing protection.
- Existing scaffold test `tests/trpc/app-router-scaffold.test.ts` checks mutation procedures use `protectedProcedure` except allowlisted public auth flows.
- Phase 2 should harden this into a default CI lint/gate:
  - Maintain or expand existing test-based lint.
  - Add explicit resource/action constants if planner finds current path-derived model too implicit.
  - Keep Casbin as optional backend when flag enabled.
  - Require logged feature/env gated local-dev bypass.

### Feature Flags

- Canonical server registry: `src/flags/registry.ts`.
- TUI has a separate env-only flag list in `src/tui/feature-flags.ts` with drift risk.
- Web settings flags route and tRPC `flags` router exist.
- Tests already cover FlagRegistry behavior in `tests/flags/registry.test.ts` and platform checks.
- FND-07 should converge stable booleans on `src/flags/registry.ts`, or explicitly document/bridge TUI env-only parsing.

### Tenant Settings

- Product-kernel tenant settings already exist:
  - `src/product-kernel/tenant-settings.ts`
  - `src/product-kernel/tenant-settings.test.ts`
  - `src/product-kernel/db/migrations/0004_tenant_settings.sql`
- Current SQL migration creates `tenant_settings` without `id`, but repository attempts to insert `id`; test likely exposes this mismatch.
- Phase 2 requires canonical MikroORM `tenant_settings` entity, repository, tests, and minimal surface. Planner should decide whether to preserve product-kernel compatibility or migrate to ORM canonical path per Phase 1.

### Worker Registry

- Product-kernel has a raw SQL job queue helper in `src/product-kernel/jobs.ts`.
- MikroORM has a stub `Job` entity in `src/db/entities/jobs/Job.ts`, but comments say richer columns are later.
- Several domain workers already use an internal `addTask`-style interface:
  - `src/artifacts/worker.ts`
  - `src/notifications/fanout-worker.ts`
  - `src/repos/workers/sync-local.ts`
  - `src/repos/workers/sync-remote.ts`
- Graphile Worker official docs define jobs as rows queued with `addJob()`/SQL `graphile_worker.add_job`, and task executors as async functions receiving `(payload, helpers)`. Docs warn every async operation inside a task must be awaited because success is inferred from task return. TypeScript docs recommend runtime payload assertion because DB-inserted jobs bypass TS type safety. Sources: `https://worker.graphile.org/docs/tasks`, `https://worker.graphile.org/docs/typescript`, `https://worker.graphile.org/docs/library/run`, `https://worker.graphile.org/docs/library/queue`.
- FND-04 should introduce an extensible registry that can register current internal workers and bridge to Graphile Worker task names/payload assertions, without forcing all existing workers to rewrite at once.

### Auth Parity

- CLI auth surface exists in `src/cli/commands/auth.ts`.
- `fulcrum auth whoami` exists, but login/logout are stubs.
- TUI auth screen exists in `src/tui/screens/auth.ts`.
- tRPC auth router exists in `src/server/trpc/routers/auth.ts`.
- Phase decision requires full FND-05 now: Web login/auto-session, CLI `fulcrum auth whoami`, and TUI auth screen. Planning should verify existing behavior, fill missing wiring, and avoid deep UX polish beyond parity.

## Bug Notes

- **BUG-01:** Replace compiled-binary unsupported guard with working asset/config strategy. Must prove compiled binary starts and can use PGlite default plus PostgreSQL override.
- **BUG-02/06/07/08:** Ownership markers and confirmation gates belong in install/uninstall/plugin lifecycle code. Use existing install/uninstall tests as analogs.
- **BUG-03/04:** Web type-check and root CI coverage are tightly coupled. Root CI must include stable web gates.
- **BUG-05/13:** Config/frontmatter patchers should be targeted, not parse/stringify whole-file rewrites. Search existing patch helpers before adding utilities.
- **BUG-09:** Product CLI flag parser already has local parser code and comments referencing this bug. Verify whether tests fully cover positional/flag combinations before planning more work.
- **BUG-10/11/14:** Component/package parity bugs likely cluster around `src/cli/component.ts`, `src/cli/package-parity.ts`, package mirror code, and component status tests.
- **BUG-12:** Doctor warning count bug lives in doctor checks around product-kernel DB errors.
- **BUG-15:** Complexity hotspots include `src/tui/index.ts`, `src/cli/doctor.ts`, and large routers/files called out in codebase maps. Use `lizard` for RED evidence and acceptance.
- **BUG-16:** Lockfile contains `cookie@0.6.0` in `src/web/bun.lock`.
- **BUG-18:** Cmd+K component/palette exists but layout keydown binding missing. This may overlap Phase 6 search/Cmd+K, but roadmap explicitly includes BUG-18 in Phase 2 success.

## Planning Guidance

- Use dependency clusters with exact requirement IDs in frontmatter.
- Every bug plan needs a RED evidence task before the fix task.
- RED evidence can be a failing test, failing repro script, or captured command output for compiled/toolchain bugs.
- Include separate commit instructions in plan text for RED tests, because executor workflow requires one logical commit per change.
- Plans should avoid changing `AGENTS.md`; it is dirty/unrelated in the current worktree.
- Plans modifying schema-relevant files must include explicit migration task and `fulcrum db migrate` verification.

## Validation Architecture

Dimension 1: **Requirement Coverage**
- Every Phase 2 ID except deferred BUG-17 must appear in at least one plan `requirements` field.
- BUG-17 must be explicitly listed as deferred in the phase context or omitted with justification.

Dimension 2: **TDD Evidence**
- Each BUG plan has a RED task before a GREEN task.
- RED task acceptance must include exact failing command/output or test name.
- Shared foundation plans include both unit and integration verification where meaningful.

Dimension 3: **CI/Web Gates**
- `bun run ci` includes root and stable web gates.
- Default CI includes smoke e2e.
- Full e2e has a named recipe.
- Release gate owns compression/skills lint.

Dimension 4: **DB Runtime**
- Compiled binary works in dev/shipped mode with PGlite default and PostgreSQL override.
- DB config surface includes CLI/config/env.
- Migrations are explicit via `fulcrum db migrate`.

Dimension 5: **Permissions**
- Protected procedures are permission-gated.
- Permission lint hard-fails default CI.
- Local-dev bypass is feature/env gated and logged.

Dimension 6: **Foundation**
- Tenant settings entity/repository/tests exist.
- Feature flag registry returns stable booleans from canonical registry path.
- Worker registry can register task names and payload handlers needed by later pillars.
- Web/CLI/TUI auth/init parity is demonstrable.

## Risks

- Phase 2 is broad; plan count should be higher than Phase 1 if needed. Do not compress unrelated bugs into huge plans.
- Existing `state.record-session` can mutate STATE frontmatter unexpectedly through compatibility shim; planners should not depend on STATE session mutation for plan correctness.
- Graphile Worker may require external PostgreSQL; local PGlite support should be treated as queue abstraction compatibility, not assumed Graphile runtime compatibility.
- Moving compression/skills lint from CI to release may require updating release script/tests so those gates are not lost.

## RESEARCH COMPLETE
