---
Status: ready-for-agent
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 04-local-org-seed-and-init
---

# Better-Auth v1 integration — SQLite/PGlite adapter, org plugin, passkey plugin, SvelteKit handler

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Wire Better-Auth v1 into the project end-to-end:

- `src/auth/index.ts` — instantiate Better-Auth with SQLite adapter (PGlite in local mode, Postgres adapter when `DATABASE_URL` points at Postgres), enable `organization` plugin, `passkey` plugin, and `emailPassword` plugin. Session carries `{ orgId, userId, role }`.
- `src/web/src/hooks.server.ts` — mount `auth.handler` on `/api/auth/**`; inject session into `event.locals.session`; call `getOrgId(session)` from `src/db/context.ts` on every request.
- `src/web/src/lib/trpc.ts` — client-side tRPC proxy (SvelteKit Fetch adapter).
- `src/auth/passkey.ts` — WebAuthn passkey enrollment flow helpers (server side).
- Failure gate: if Better-Auth PGlite adapter throws on composite key, fall back to Auth.js v5 (same schema, same column names).

Cuts through: `src/auth/index.ts` → SvelteKit hooks → session → tRPC context → Playwright e2e login test.

## Acceptance criteria
- [ ] Schema: no new migrations; uses tables from `01-schema-auth-migration`. Verify session row written to `sessions` table on login.
- [ ] Server action / tRPC context: `event.locals.session` populated on authenticated requests; `auth.whoami` tRPC procedure (scaffolded in `05`) returns correct `{ userId, orgId, email, role }`.
- [ ] Web surface: `src/web/src/hooks.server.ts` injects session; unauthenticated requests to guarded routes redirect to `/auth/login`.
- [ ] CLI command: N/A — CLI auth verbs are slice `09`; this slice only wires the server-side auth library.
- [ ] TUI screen: N/A — TUI auth screen is slice `15`; this slice only wires the library.
- [ ] Tests: `tests/auth/better-auth-integration.test.ts` (Vitest) — assert session created for `admin@local`; assert `auth.handler` returns 200 on `GET /api/auth/session`. Playwright `tests/auth/login.spec.ts` — navigate to `/auth/login`, submit email+password for `admin@local`, assert redirect to `/` dashboard, assert `auth.whoami` returns correct payload. RED → GREEN.

## Blocked by
- `04-local-org-seed-and-init` (needs org + admin user row to test login against).

## Notes
`saas-auth` flag gates OAuth (Google/GitHub) + magic-link + email OTP plugins. Those plugins are wired into the Better-Auth instance behind the flag check at startup; when flag is OFF the login screen shows only passkey + email/password. Do not defer the wiring — ship it disabled.
