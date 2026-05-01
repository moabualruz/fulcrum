---
Status: ready-for-agent
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 15-tui-base-shell-and-auth-flags-screens, 14-saas-auth-gated-oauth-and-email-otp, 16-casbin-policies-gated-flag, 17-zod-schemas-and-trpc-domain-stubs
---

# Test infrastructure baseline — Vitest + Bun test + Playwright + `bun run ci` gate

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Harden the test infrastructure so `bun run ci` is the single command that proves the entire Foundation Reset pillar is green:

**`vitest.config.ts`** — expand glob to include `src/server/trpc/**/*.test.ts`, `src/flags/**/*.test.ts`, `src/auth/**/*.test.ts`, `tests/db/**/*.test.ts`, `tests/trpc/**/*.test.ts`, `tests/flags/**/*.test.ts`, `tests/init/**/*.test.ts`.

**`playwright.config.ts`** — ensure `tests/auth/*.spec.ts` suite included; base URL points to `fulcrum web` process started in `globalSetup`; `globalSetup` runs `fulcrum init` before any spec.

**`package.json` `scripts`:**
- `test:unit` → `vitest run`
- `test:integration` → `bun test tests/`
- `test:e2e` → `playwright test`
- `test:build` → `bun build --compile src/index.ts --outfile dist/fulcrum`
- `ci` → `bun run test:build && bun run test:unit && bun run test:integration && bun run test:e2e`

**Shared test helpers (`tests/helpers/`):**
- `db.ts` — `createTestDb()`: spins up in-memory PGlite, runs all migrations, seeds local org. Exported for use in all test files.
- `trpc.ts` — `createTestCaller(session?)`: creates a tRPC caller with a given session (or admin@local session by default).
- `auth.ts` — `adminSession()`: returns a pre-built admin session fixture.

Cuts through: test config files → helper utilities → `bun run ci` orchestration → all prior test files from slices `01`–`17` pass under the unified runner.

## Acceptance criteria
- [ ] Schema: no new migrations.
- [ ] Server action / tRPC: all tRPC tests from prior slices discoverable and run under `bun run test:unit`.
- [ ] Web surface: Playwright tests from slices `11`, `12`, `13`, `14` all pass under `bun run test:e2e`.
- [ ] CLI command: CLI tests from slices `10` pass under `bun run test:integration`.
- [ ] TUI screen: TUI smoke tests from slice `15` pass under `bun run test:unit`.
- [ ] Tests: `bun run ci` exits 0 end-to-end. If any of the four stages fails, `ci` exits non-zero with a clear stage label in stderr. Test coverage for auth, tRPC, and migration tests visible in `bun run test:unit --coverage` output.

## Blocked by
- `15-tui-base-shell-and-auth-flags-screens` (TUI tests must exist before CI can aggregate them).
- `14-saas-auth-gated-oauth-and-email-otp` (last auth surface).
- `16-casbin-policies-gated-flag` (last middleware layer).
- `17-zod-schemas-and-trpc-domain-stubs` (compile-check test must pass).

## Notes
`globalSetup` for Playwright must start `fulcrum web` as a child process, wait for the port to be ready (poll `GET /api/auth/session` until 200), then run specs. Tear down on `globalTeardown`. This replaces any ad-hoc `sleep` in existing Playwright config.
