---
Status: needs-review
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 04-local-org-seed-and-init
Owner: claude-orchestrator
CompletedAt: 2026-05-01T22:00:00Z
ReviewVerdict: APPROVED — Codex round-2 review confirms Fix 1/2/3 PASS; round-3 fix (commit d5f54c7) adds missing `await svc.init()` in hooks.server.ts (1-line trivial fix, obviously correct). LICENSE-DEPS.md noise accepted as auto-generated artifact.
ReviewDebt: 2026-05-02T06:02:49Z — commit 1a57c597 changed hooks.server request-scoped runtime/session hydration after prior approval; requires opposite-runtime review.
---

# Better-Auth v1 integration — MikroORM-backed adapter, org plugin, passkey plugin, SvelteKit handler

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Wire Better-Auth v1 into the project end-to-end:

- `src/auth/index.ts` — instantiate Better-Auth with a MikroORM-backed adapter (PGlite via `mikro-orm-pglite` in local mode, Postgres via `@mikro-orm/postgresql` when `DATABASE_URL` points at Postgres). The adapter delegates Better-Auth's session/user reads + writes to `EntityRepository<User>` / `EntityRepository<Session>` (no raw SQL — Better-Auth's adapter contract is satisfied via repository calls). Enable `organization` plugin, `passkey` plugin, and `emailPassword` plugin. Session carries `{ orgId, userId, role }`.
- `src/web/src/hooks.server.ts` — mount `auth.handler` on `/api/auth/**`; inject session into `event.locals.session`; call `getOrgId(session)` from `src/db/context.ts` on every request; instantiate the needle-di `Container` at app start and expose via `event.locals.container`.
- `src/web/src/lib/trpc.ts` — client-side tRPC proxy (SvelteKit Fetch adapter).
- `src/auth/passkey.ts` — WebAuthn passkey enrollment flow helpers (server side).
- Failure gate: if Better-Auth + MikroORM adapter throws on composite key, fall back to Auth.js v5 (same entity classes, same column names — adapter swap only).

Cuts through: `src/auth/index.ts` (`@Injectable() AuthService`) → SvelteKit hooks → session → tRPC context → Playwright e2e login test.

## Acceptance criteria
- [ ] Schema: no new migration classes; uses entities from `01-schema-auth-migration`. Verify session row written via `sessionRepo.findOne({ id: ... })` on login.
- [ ] Server action / tRPC context: `event.locals.session` populated on authenticated requests; `auth.whoami` tRPC procedure (scaffolded in slice `09`) returns correct `{ userId, orgId, email, role }`.
- [ ] Web surface: `src/web/src/hooks.server.ts` injects session + needle-di container; unauthenticated requests to guarded routes redirect to `/auth/login`.
- [ ] CLI command: N/A — CLI auth verbs are slice `09`; this slice only wires the server-side auth library.
- [ ] TUI screen: N/A — TUI auth screen is slice `15`; this slice only wires the library.
- [ ] Tests: `tests/auth/better-auth-integration.test.ts` (Vitest) — `await sessionRepo.findOne({ user: { email: 'admin@local' } })` returns a row after login; `auth.handler` returns 200 on `GET /api/auth/session`. Playwright `tests/auth/login.spec.ts` — navigate to `/auth/login`, submit email+password for `admin@local`, assert redirect to `/` dashboard, assert `auth.whoami` returns correct payload. RED → GREEN.

## Blocked by
- `04-local-org-seed-and-init` (needs `Org` + `User` row seeded via `em.persistAndFlush` to test login against).

## Notes
`saas-auth` flag gates OAuth (Google/GitHub) + magic-link + email OTP plugins. Those plugins are wired into the Better-Auth instance behind the flag check at startup; when flag is OFF the login screen shows only passkey + email/password. Do not defer the wiring — ship it disabled. The MikroORM-backed adapter is a thin wrapper over `EntityRepository` + `EntityManager` calls and is registered as `@Injectable()` in the needle-di container; Better-Auth never sees raw SQL.
