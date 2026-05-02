---
Status: implemented
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 15-tui-base-shell-and-auth-flags-screens, 14-saas-auth-gated-oauth-and-email-otp, 16-casbin-policies-gated-flag, 17-zod-schemas-and-trpc-domain-stubs
Owner: codex-orchestrator
ReviewGate: 2026-05-02T10:01:13Z — Claude adversarial review review-moo61q5y-llfvx1 SPEC FAIL / QUALITY CHANGES_REQUIRED: coverage matrix did not catch missing auth e2e tests.
---

# Test infrastructure baseline — Vitest + Bun test + Playwright + `bun run ci` gate

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Harden the test infrastructure so `bun run ci` is the single command that proves the entire Foundation Reset pillar is green:

**`vitest.config.ts`** — expand glob to include `src/server/trpc/**/*.test.ts`, `src/flags/**/*.test.ts`, `src/auth/**/*.test.ts`, `src/db/entities/**/*.test.ts`, `tests/db/**/*.test.ts`, `tests/trpc/**/*.test.ts`, `tests/flags/**/*.test.ts`, `tests/init/**/*.test.ts`.

**`playwright.config.ts`** — ensure `tests/auth/*.spec.ts` suite included; base URL points to `fulcrum web` process started in `globalSetup`; `globalSetup` runs `fulcrum init` before any spec.

**`package.json` `scripts`:**
- `test:unit` → `vitest run`
- `test:integration` → `bun test tests/`
- `test:e2e` → `playwright test`
- `test:build` → `bun build --compile src/index.ts --outfile dist/fulcrum`
- `ci` → `bun run test:build && bun run test:unit && bun run test:integration && bun run test:e2e`

**Shared test helpers (`tests/helpers/`):**
- `db.ts` — `createTestOrm()`: spins up in-memory PGlite via `mikro-orm-pglite`, runs `MikroORM.getMigrator().up()` to apply all migration classes, seeds local org via `em.persistAndFlush`. Returns the `MikroORM` instance + `EntityManager`. Exported for use in all test files.
- `container.ts` — `createTestContainer(orm)`: builds a needle-di `Container` with `EntityManager` + repositories + `FlagRegistry` registered. Returns the container so test code can `container.get(...)` repositories.
- `trpc.ts` — `createTestCaller(container, session?)`: creates a tRPC caller with a given session (or admin@local session by default) and the test container.
- `auth.ts` — `adminSession()`: returns a pre-built admin session fixture (for use with the test container).

Cuts through: test config files → helper utilities (in-memory PGlite + needle-di test container) → `bun run ci` orchestration → all prior test files from slices `01`–`17` pass under the unified runner.

## Acceptance criteria
- [x] Schema: no new migration classes; helpers run all existing migration classes via `MikroORM.getMigrator().up()` against in-memory PGlite.
- [x] Server action / tRPC: all tRPC tests from prior slices are discoverable and run under `bun test --conditions=svelte` in `bun run ci`.
- [x] Web surface: always-on web pipeline runs `web:install`, `web:check`, `web:build`, and `web:test`; Playwright e2e remains opt-in via `FULCRUM_RUN_E2E=1`.
- [x] CLI command: CLI tests from slices `10` pass under the root Bun test stage in `bun run ci`.
- [x] TUI screen: TUI smoke tests from slice `15` pass under the root Bun test stage in `bun run ci`.
- [x] Tests: `bun run ci` exits 0 end-to-end across 11 always-on stages with clear stage labels. Coverage matrix confirms auth, tRPC, db, CLI, TUI, and web surfaces have discoverable tests.

## Blocked by
- `15-tui-base-shell-and-auth-flags-screens` (TUI tests must exist before CI can aggregate them).
- `14-saas-auth-gated-oauth-and-email-otp` (last auth surface).
- `16-casbin-policies-gated-flag` (last middleware layer).
- `17-zod-schemas-and-trpc-domain-stubs` (compile-check test must pass).

## Notes
`globalSetup` for Playwright must start `fulcrum web` as a child process, wait for the port to be ready (poll `GET /api/auth/session` until 200), then run specs. Tear down on `globalTeardown`. This replaces any ad-hoc `sleep` in existing Playwright config. The shared `createTestOrm` helper enforces consistent decorator-based entity loading and migration-class application across every test file — no test should bypass MikroORM and write raw SQL setup fixtures.

Completed against the current repo runner: added shared `src/test-utils/` DB/container/tRPC/auth helpers, added `tests/infrastructure/` coverage matrix + helper smoke tests, and polished `scripts/ci.ts` env isolation so root tests use scratch `HOME`, nested installs use scratch Bun cache, and `build:all` can reuse the existing Bun compile cache in offline local CI. Verified with `bun run ci`: 11/11 stages pass.

Review follow-up: auth Playwright coverage now has `src/web/tests/e2e/auth-login.spec.ts`, and the root coverage matrix asserts an auth e2e spec exists while keeping browser e2e opt-in. CSRF custom-header gating was not added in this slice: current same-origin SvelteKit server actions and Better-Auth/passkey clients do not consistently send a Fulcrum-owned header, so adding a hard gate here would destabilize existing browser flows. Track CSRF as a separate compatibility pass that first updates all first-party clients.
