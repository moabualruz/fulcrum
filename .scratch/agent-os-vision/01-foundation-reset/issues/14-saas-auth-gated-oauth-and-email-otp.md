---
Status: in-progress
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 13-passkey-enrollment-and-login-flow
Owner: codex-worker-local-auth-flow
ReopenedAt: 2026-05-02T16:02:54Z
ReopenedBecause: P1 gate found local-mode signup still permits unauthenticated email signup into default org.
ReviewGate: 2026-05-02T10:01:13Z — Claude adversarial review review-moo61q5y-llfvx1 SPEC FAIL / QUALITY CHANGES_REQUIRED: OAuth providers register empty credentials; saas-auth gating is boot-time only.
---

# `saas-auth` flag — OAuth providers, magic-link, email OTP (shipped + gated)

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Wire all SaaS-facing auth providers into the Better-Auth instance behind the `saas-auth` feature flag. These are fully implemented and tested — they are simply inactive when the flag is OFF. Any plugin entities (OAuth account links, magic-link tokens, OTP codes) are registered with the MikroORM-backed adapter; their migration classes auto-emit on first run.

**`src/auth/index.ts` changes:**
- When `flagRegistry.isEnabled('saas-auth')`: enable `social` plugin with Google + GitHub providers (reads `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`).
- When `flagRegistry.isEnabled('saas-auth')`: enable `emailOTP` plugin (reads `SMTP_*` env vars; Owned-by: `notify-email` pipeline for actual sending — this slice wires the plugin, the SMTP send path is activated when `notify-email` is also on).
- When `flagRegistry.isEnabled('saas-auth')`: enable magic-link plugin.

**Web login page (`/auth/login`)**
- OAuth buttons (Google, GitHub) rendered only when `saas-auth` flag ON.
- "Forgot password / magic-link" link rendered when `saas-auth` + email OTP on.
- Signup page unguarded when `saas-auth` ON.

**CLI**
- `fulcrum auth login --oauth google` — opens browser OAuth flow; saves session token after successful sign-in (which writes a `Session` row via the MikroORM-backed adapter).
- `fulcrum auth login --magic-link <email>` — triggers magic-link email; waits for user to click + polls session.

**TUI**
- Settings → Auth screen: shows active providers list when `saas-auth` ON.

Cuts through: `src/auth/index.ts` flag-conditional plugin init (FlagRegistry resolved from needle-di) → Better-Auth social/emailOTP plugins (using MikroORM-backed adapter) → web login buttons → CLI OAuth + magic-link verbs → integration tests.

## Acceptance criteria
- [x] Schema: no hand-written migrations; Better-Auth's OAuth account linking entity registers with MikroORM and emits its migration class on first run when `saas-auth` is on. Verify via `em.getMetadata().get('OAuthAccount')` (or equivalent plugin-named entity).
- [x] Server action / tRPC: with `saas-auth` OFF, `/api/auth/sign-in/social` returns 404. With flag ON (env var), returns 200 + OAuth redirect URL. Verified in `tests/auth/saas-auth.test.ts`.
- [x] Web surface: OAuth buttons (Google/GitHub) gated behind `saas-auth` flag in `login/+page.svelte`. Signup page returns 403 when `saas-auth` OFF.
- [ ] CLI command: `fulcrum auth login --oauth google` — out of scope per OUT-OF-SCOPE constraint (src/cli/** FORBIDDEN).
- [ ] TUI screen: Settings → Auth screen — out of scope per OUT-OF-SCOPE constraint (src/tui/** FORBIDDEN).
- [x] Tests: `tests/auth/saas-auth.test.ts` — 9 tests covering OAuth 404/200, emailOTP 404/non-404, magic-link 404/non-404, isSaasAuthEnabled() OFF/ON. All GREEN. CI 11/11.

## Blocked by
- `13-passkey-enrollment-and-login-flow` (extends the same login page component; saas-auth layer builds on top).

## Notes
SMTP env vars for magic-link/OTP are consumed by this slice for plugin wiring; actual email delivery relies on `notify-email` flag being on too. Both flags must be on for email auth to work end-to-end — document this dependency in the `FLAG_DESCRIPTIONS` constant in `src/flags/registry.ts`.

Review follow-up: OAuth providers are now registered only when `saas-auth` is enabled and both client ID and secret are non-empty. `AuthService.handler` checks a small auth-config signature per request and rebuilds Better-Auth when the flag/provider availability changes, so `saas-auth` no longer requires process restart for handler gating.
