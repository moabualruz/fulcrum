---
Status: ready-for-agent
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [01-foundation-reset/issues/11-web-login-signup-logout-pages.md, 01-foundation-reset/issues/13-passkey-enrollment-and-login-flow.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q21, Q30, Q-permissions]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (row: "Multi-user / accounts / collaboration / SaaS")
Docs: https://www.better-auth.com/docs
---

# Auth routes — /auth/login, /auth/signup, /auth/invite/[token], /auth/logout

## What to build

Build the four auth routes as product-grade SvelteKit pages. `/auth/login`: passkey button (WebAuthn) + email+password form; local-mode auto-redirect (when `admin@local` session exists → redirect `/`). `/auth/signup`: active only when `saas-auth` flag ON via `<FeatureGate>`; renders registration form (email + password + confirm) otherwise 404. `/auth/invite/[token]`: validates token, renders "Accept invitation" form, creates org_member row on submit. `/auth/logout`: POST server action invalidates Better-Auth session, redirects to `/auth/login`.

Cuts through: `/auth/login` form → Better-Auth `signIn.email()` / WebAuthn → session cookie → `hooks.server.ts` populated → redirect `/`. Three-surface: CLI (no standalone login flow per Q30; `fulcrum init` creates `admin@local`); TUI (no login flow; session inherited).

## Acceptance criteria

- [ ] `/auth/login`: passkey button renders; email+password form submits → session set → redirected to `/`; bad password → inline error "Invalid email or password"; local-mode session present → skip login (redirect `/` immediately).
- [ ] `/auth/signup`: `saas-auth` OFF → `<FeatureGate>` callout; ON → form renders, valid submit creates user row + session + redirect `/`.
- [ ] `/auth/invite/[token]`: valid token → "Accept invitation" form; accepted → `org_members` row created → redirect `/`; expired/invalid token → error message.
- [ ] `/auth/logout`: POST → session destroyed → redirect `/auth/login`; GET → redirect `/auth/login`.
- [ ] All auth pages: no sidebar/topbar (public layout); WCAG 2.1 AA — all inputs have `<label>`, keyboard-reachable, axe zero violations.
- [ ] Playwright: login happy path end-to-end; bad password error; invite accept; logout clears session.
- [ ] CLI: `fulcrum init` creates `admin@local` — no web dependency (Q30 verified by doctor check).

## Blocked by

- Pillar 1 issues 11 (web login/signup pages) and 13 (passkey enrollment) — Better-Auth flows must be wired.
