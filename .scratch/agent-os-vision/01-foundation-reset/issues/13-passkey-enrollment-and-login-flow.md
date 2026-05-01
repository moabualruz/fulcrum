---
Status: ready-for-agent
Triage: HITL
Pillar: 01-foundation-reset
Blocked-by: 11-web-login-signup-logout-pages
---

# Passkey enrollment + passkey login flow (WebAuthn via Better-Auth passkey plugin)

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Wire the Better-Auth `passkey` plugin end-to-end for both enrollment and login:

**Enrollment (`src/auth/passkey.ts` + web)**
- "Register passkey" button on `/auth/login` and `/settings/profile` (when user is already logged in).
- Calls `auth.passkey.addPasskey()` → triggers WebAuthn `navigator.credentials.create()`; stores credential in Better-Auth passkey table.
- Fallback: if browser lacks WebAuthn support, button is hidden and email+password is the only option.

**Passkey login**
- "Sign in with passkey" button on `/auth/login`.
- Calls `auth.passkey.signIn()` → triggers WebAuthn `navigator.credentials.get()`; on success creates Better-Auth session.
- CLI: `fulcrum auth login --passkey` — launches a local browser tab for the WebAuthn ceremony then saves session token (requires browser available on the machine; falls back to `--password` with a warning if no browser).

**TUI**
- Settings → Auth screen: shows passkey enrollment status ("No passkey enrolled" / "1 passkey enrolled"), with a "Enroll passkey" button that opens the browser URL for the enrollment ceremony.

Cuts through: Better-Auth passkey plugin → WebAuthn ceremony → session creation → web UI → CLI → TUI screen.

## Acceptance criteria
- [ ] Schema: Better-Auth passkey plugin creates its own credential storage table. No additional manual migration needed.
- [ ] Server action / tRPC: `auth.passkey.addPasskey()` + `auth.passkey.signIn()` exposed through Better-Auth handler.
- [ ] Web surface: "Register passkey" button on login page triggers enrollment ceremony; passkey login button triggers `navigator.credentials.get()`; successful passkey login lands on dashboard.
- [ ] CLI command: `fulcrum auth login --passkey` opens browser for WebAuthn ceremony; saves session on success; prints warning + falls back to `--password` if no browser detected.
- [ ] TUI screen: Settings → Auth screen shows enrollment status. "Enroll passkey" action opens browser.
- [ ] Tests: Playwright `tests/auth/passkey.spec.ts` — use Playwright's `browserContext.addInitScript` to mock `navigator.credentials` and simulate a successful ceremony; assert session created. Vitest `tests/auth/passkey-unit.test.ts` — assert passkey route handlers registered. RED → GREEN.

## Blocked by
- `11-web-login-signup-logout-pages` (shares the login page component).

## Notes
HITL: WebAuthn UX decisions need human review — specifically the enrollment prompt placement and whether to show passkey as default vs. fallback. The rest is AFK. Flag this for a 5-minute UX review before merging the web surface changes. CLI passkey flag opens a local browser `http://localhost:PORT/auth/passkey-cli-flow` which closes after ceremony.
