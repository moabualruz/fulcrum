---
Status: ready-for-agent
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 13-passkey-enrollment-and-login-flow
---

# `saas-auth` flag — OAuth providers, magic-link, email OTP (shipped + gated)

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Wire all SaaS-facing auth providers into the Better-Auth instance behind the `saas-auth` feature flag. These are fully implemented and tested — they are simply inactive when the flag is OFF.

**`src/auth/index.ts` changes:**
- When `isEnabled('saas-auth')`: enable `social` plugin with Google + GitHub providers (reads `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`).
- When `isEnabled('saas-auth')`: enable `emailOTP` plugin (reads `SMTP_*` env vars; Owned-by: `notify-email` pipeline for actual sending — this slice wires the plugin, the SMTP send path is activated when `notify-email` is also on).
- When `isEnabled('saas-auth')`: enable magic-link plugin.

**Web login page (`/auth/login`)**
- OAuth buttons (Google, GitHub) rendered only when `saas-auth` flag ON.
- "Forgot password / magic-link" link rendered when `saas-auth` + email OTP on.
- Signup page unguarded when `saas-auth` ON.

**CLI**
- `fulcrum auth login --oauth google` — opens browser OAuth flow; saves session token.
- `fulcrum auth login --magic-link <email>` — triggers magic-link email; waits for user to click + polls session.

**TUI**
- Settings → Auth screen: shows active providers list when `saas-auth` ON.

Cuts through: `src/auth/index.ts` flag-conditional plugin init → Better-Auth social/emailOTP plugins → web login buttons → CLI OAuth + magic-link verbs → integration tests.

## Acceptance criteria
- [ ] Schema: no new migrations; Better-Auth's OAuth account linking uses existing `users` table.
- [ ] Server action / tRPC: with `saas-auth` OFF, `/api/auth/signin/google` returns 404. With flag ON (env var), returns OAuth redirect. `auth.whoami` returns correct `email` and `userId` after OAuth login.
- [ ] Web surface: OAuth buttons appear/disappear based on `saas-auth` flag. Clicking Google button redirects to Google (in test: mock the redirect). Signup page accessible when `saas-auth` ON, returns 403 when OFF.
- [ ] CLI command: `fulcrum auth login --oauth google` exits with instructions when flag OFF. When flag ON: opens browser URL + polls for session.
- [ ] TUI screen: Settings → Auth screen shows `OAuth: Google, GitHub` when `saas-auth` ON; hidden when OFF.
- [ ] Tests: `tests/auth/saas-auth.test.ts` — assert OAuth route returns 404 when flag OFF; assert route returns 302 when flag ON. `tests/auth/saas-auth-web.spec.ts` Playwright — assert OAuth buttons visible/hidden per flag. RED → GREEN.

## Blocked by
- `13-passkey-enrollment-and-login-flow` (extends the same login page component; saas-auth layer builds on top).

## Notes
SMTP env vars for magic-link/OTP are consumed by this slice for plugin wiring; actual email delivery relies on `notify-email` flag being on too. Both flags must be on for email auth to work end-to-end — document this dependency in the `FLAG_DESCRIPTIONS` constant in `src/flags/registry.ts`.
