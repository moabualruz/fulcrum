---
Status: integration-review
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 09-auth-trpc-procedures-and-org-management
Owner: codex-worker-local-auth-flow
ReopenedAt: 2026-05-02T16:02:54Z
ReopenedBecause: P1 gate requires seeded admin browser login/logout to work, not just page rendering.
RepairVerifiedAt: 2026-05-02T16:24:24Z
ReviewGate: 2026-05-02T10:01:13Z — Claude adversarial review review-moo61q5y-llfvx1 SPEC FAIL / QUALITY CHANGES_REQUIRED: Playwright login/logout coverage missing.
---

# Web login, signup, and logout pages

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Implement the SvelteKit auth pages that expose the Better-Auth session system to browser users:

- `src/web/src/routes/auth/login/+page.svelte` — passkey button + email/password form. OAuth buttons (Google/GitHub) rendered only when `isEnabled('saas-auth')` is true (resolved via the `FlagRegistry` from `event.locals.container`). "Forgot password" link rendered when email OTP enabled. On submit, calls Better-Auth client `signIn`; redirects to `/` on success.
- `src/web/src/routes/auth/signup/+page.svelte` — name + email + password form; inline passkey enrollment step. Active in SaaS mode (`saas-auth` flag); in local-only mode this page is guarded (local mode auto-creates admin@local on `fulcrum init`, no human signup needed).
- `src/web/src/routes/auth/logout/+server.ts` — POST handler: calls `auth.signOut()` (which removes the session row via `sessionRepo.nativeDelete` under the hood); clears session cookie; redirects to `/auth/login`.
- `src/web/src/hooks.server.ts` — updated: unauthenticated requests to non-auth routes redirect to `/auth/login`.

Cuts through: SvelteKit page/server routes → Better-Auth client/server (with MikroORM-backed adapter) → session row → hooks redirect → Playwright e2e tests.

## Acceptance criteria
- [ ] Schema: `Session` entity row created on successful login (verified via `sessionRepo.findOne({ user: ... })`).
- [ ] Server action / tRPC: `event.locals.session` populated after login; cleared after logout.
- [ ] Web surface: `/auth/login` renders without crash; submitting `admin@local` + correct password redirects to `/`. Submitting wrong password shows error. `/auth/logout` POST clears cookie, redirects to `/auth/login`. OAuth buttons absent when `saas-auth` flag is OFF.
- [ ] CLI command: N/A.
- [ ] TUI screen: N/A.
- [ ] Tests: Playwright `tests/auth/login.spec.ts` — full login + logout round-trip for `admin@local`. Assert session cookie present after login, absent after logout. After login: `await sessionRepo.findOne({ user: { email: 'admin@local' } })` returns a row; after logout: same query returns null. Assert OAuth buttons are not rendered when `saas-auth` OFF. RED → GREEN.

## Blocked by
- `09-auth-trpc-procedures-and-org-management` (needs Better-Auth session infrastructure + `auth.whoami` live).

## Notes
Local mode: `/auth/signup` returns 403 when `saas-auth` flag is OFF (local-mode users never need to sign up manually). Signup page is shipped, gated — not deferred.

Review follow-up: added Playwright auth coverage at `src/web/tests/e2e/auth-login.spec.ts` for login page local-auth controls, SaaS OAuth absence, and logout redirect. Full seeded `admin@local` login/session-row round trip remains dependent on the e2e global setup seeding path.
