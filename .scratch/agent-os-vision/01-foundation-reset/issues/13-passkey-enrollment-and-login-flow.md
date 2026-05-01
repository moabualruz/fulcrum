---
Status: blocked
Triage: HITL
Pillar: 01-foundation-reset
Blocked-by: 11-web-login-signup-logout-pages
---

# Passkey enrollment + passkey login flow (WebAuthn via Better-Auth passkey plugin)

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Wire the Better-Auth `passkey` plugin end-to-end for both enrollment and login. The plugin's credential storage entity (`Passkey` or similar) is registered with the MikroORM-backed Better-Auth adapter and emits its own auto-generated migration class on first run; no hand-written DDL.

**Enrollment (`src/auth/passkey.ts` + web)**
- "Register passkey" button on `/auth/login` and `/settings/profile` (when user is already logged in).
- Calls `auth.passkey.addPasskey()` → triggers WebAuthn `navigator.credentials.create()`; the Better-Auth passkey plugin persists the credential entity via `em.persistAndFlush(...)` through its adapter.
- Fallback: if browser lacks WebAuthn support, button is hidden and email+password is the only option.

**Passkey login**
- "Sign in with passkey" button on `/auth/login`.
- Calls `auth.passkey.signIn()` → triggers WebAuthn `navigator.credentials.get()`; on success creates `Session` row via the same adapter.
- CLI: `fulcrum auth login --passkey` — launches a local browser tab for the WebAuthn ceremony then saves session token (requires browser available on the machine; falls back to `--password` with a warning if no browser).

**TUI**
- Settings → Auth screen: shows passkey enrollment status ("No passkey enrolled" / "1 passkey enrolled" — from `await passkeyRepo.count({ user })`), with a "Enroll passkey" button that opens the browser URL for the enrollment ceremony.

Cuts through: Better-Auth passkey plugin → MikroORM-backed credential entity + auto-generated migration class → WebAuthn ceremony → session creation → web UI → CLI → TUI screen.

## Acceptance criteria
- [ ] Schema: Better-Auth passkey plugin registers its `Passkey` entity with MikroORM; migration class auto-emitted on first run; no hand-written DDL.
- [ ] Server action / tRPC: `auth.passkey.addPasskey()` + `auth.passkey.signIn()` exposed through Better-Auth handler.
- [ ] Web surface: "Register passkey" button on login page triggers enrollment ceremony; passkey login button triggers `navigator.credentials.get()`; successful passkey login lands on dashboard.
- [ ] CLI command: `fulcrum auth login --passkey` opens browser for WebAuthn ceremony; saves session on success; prints warning + falls back to `--password` if no browser detected.
- [ ] TUI screen: Settings → Auth screen shows enrollment status from `passkeyRepo.count({ user })`. "Enroll passkey" action opens browser.
- [ ] Tests: Playwright `tests/auth/passkey.spec.ts` — use Playwright's `browserContext.addInitScript` to mock `navigator.credentials` and simulate a successful ceremony; assert `await sessionRepo.findOne({ user })` returns a row and `await passkeyRepo.count({ user }) === 1`. Vitest `tests/auth/passkey-unit.test.ts` — assert passkey route handlers registered. RED → GREEN.

## Blocked by
- `11-web-login-signup-logout-pages` (shares the login page component).

## Notes
HITL: WebAuthn UX decisions need human review — specifically the enrollment prompt placement and whether to show passkey as default vs. fallback. The rest is AFK. Flag this for a 5-minute UX review before merging the web surface changes. CLI passkey flag opens a local browser `http://localhost:PORT/auth/passkey-cli-flow` which closes after ceremony.
