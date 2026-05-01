---
Status: ready-for-agent
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 10-cli-auth-and-flags-verbs, 07-feature-flag-registry
---

# OpenTUI base shell + auth screen + feature-flags screen

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Implement the OpenTUI application entry point and the two Foundation screens:

**`src/tui/index.ts`** — OpenTUI app root. Renders a status bar, a navigation panel, and a main content area. `fulcrum tui` (from the binary dispatcher in slice `08`) spawns this in-process.

**Status bar** — always-visible bottom bar showing: org name (`Local` / org.name) + user email. Reads from `auth.whoami` in-process tRPC call on mount. Updates on session change.

**Settings → Auth screen (`src/tui/screens/auth.tsx`)**
- Shows: current user email, org name, role, passkey enrollment status (`N passkeys enrolled`).
- "Enroll passkey" action → opens browser URL (from slice `13`).
- Shows active auth providers list when `saas-auth` flag ON.

**Settings → Feature Flags screen (`src/tui/screens/flags.tsx`)**
- Renders all registered flags as a toggleable list with descriptions.
- Toggle calls `flags.set` in-process; re-queries `flags.list` after each toggle.
- Keyboard: `j`/`k` to navigate, `Space` or `Enter` to toggle, `q` to exit.

**Navigation** — keyboard-navigable settings panel with at minimum: "Auth" and "Feature Flags" entries. Other settings entries (filled by later pillars) are stubs that print "Owned by Pillar N".

Cuts through: OpenTUI component tree → in-process tRPC calls → status bar render → keyboard interaction → smoke tests.

## Acceptance criteria
- [ ] Schema: no migrations.
- [ ] Server action / tRPC: `auth.whoami` + `flags.list` + `flags.set` called in-process from TUI (no HTTP).
- [ ] Web surface: N/A.
- [ ] CLI command: `fulcrum tui` launches TUI; exits cleanly on `q` or `Ctrl+C`.
- [ ] TUI screen: Status bar renders org name + email on startup. Settings → Auth screen shows correct user info. Settings → Feature Flags screen shows all registered flags; Space toggles; subsequent `flags.list` reflects change. TUI renders without crash with zero flags enabled.
- [ ] Tests: `tests/tui/smoke.test.ts` — instantiate TUI in headless mode (no TTY); assert status bar renders `admin@local`; assert flags screen renders without throwing; assert toggle calls `flags.set`. RED → GREEN.

## Blocked by
- `10-cli-auth-and-flags-verbs` (TUI calls the same in-process tRPC procedures; auth verbs must be live first).
- `07-feature-flag-registry` (flags screen consumes `flags.list`/`flags.set`).

## Notes
Per Q-tui-lib: OpenTUI (Bun-native JSX/TS). Failure gate: if OpenTUI is too immature, fall back to ratatui (Rust) in the inference sidecar workspace. Evaluate at the start of this slice before writing component code — if evaluation fails, open a HITL decision issue before proceeding.
