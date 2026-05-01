---
Status: ready-for-agent
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 01-schema-auth-migration
---

# Synthetic local-org seed + `fulcrum init` bootstrap

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Implement `src/db/seed.ts` and the `fulcrum init` CLI command so that running `fulcrum init` on a clean `FULCRUM_HOME` inserts:
- Org row `{id: '00000000-0000-0000-0000-000000000001', name: 'Local'}`.
- User row `{email: 'admin@local', role: 'owner', org_id: <local-org>}`.
- A valid Better-Auth session row.

The seed is idempotent (re-running is safe; no duplicates). `fulcrum init` exits 0 on both first run and re-run. Web layout server `+layout.server.ts` calls the same idempotent seed logic on first request so local-mode users who never touch the CLI also get a bootstrapped org.

Cuts through: `src/db/seed.ts` → `fulcrum init` CLI command → SvelteKit layout server hook → tRPC `auth.whoami` → tests.

## Acceptance criteria
- [ ] Schema: after `fulcrum init`, the `orgs`, `users`, `sessions`, `org_members` tables contain exactly one row each for the well-known local-org + admin user.
- [ ] Server action / tRPC: `auth.whoami` returns `{ userId, orgId: '00000000-0000-0000-0000-000000000001', email: 'admin@local', role: 'owner' }` after init.
- [ ] Web surface: `+layout.server.ts` calls seed idempotently on first render; subsequent renders skip. No visible UX change for local-mode users (they land directly on the dashboard).
- [ ] CLI command: `fulcrum init` exits 0 on clean install; exits 0 on re-run (idempotent). Prints `✓ Local org bootstrapped` (or `✓ Already initialized`) to stdout.
- [ ] TUI screen: TUI status bar shows org name `Local` and user email `admin@local` after init.
- [ ] Tests: `tests/init/seed.test.ts` — run seed twice, assert org/user/session count = 1 each time. `tests/cli/init.test.ts` — assert exit code 0 both runs. RED → GREEN.

## Blocked by
- `01-schema-auth-migration` (tables must exist before seed can write rows).

## Notes
`src/db/context.ts` `getOrgId(session)` helper is delivered in this slice because the layout server needs it. Seed should never prompt; local mode is fully headless/automatic per Q21.
