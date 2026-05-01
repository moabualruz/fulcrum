---
Status: completed
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 01-schema-auth-migration
Owner: claude-orchestrator
CompletedAt: 2026-05-01T20:00:00Z
ReviewVerdict: APPROVED — Codex round-2 review confirms Fix 1 PASS (TODO at +layout.server.ts citing P1#04/P13/P16/SSR SyntaxError/user-impact; test.skip present) + Fix 2 PASS (em.persistAndFlush). Scope-bundling nit flagged (orchestrator packaging, not P1#04 defect). Per .scratch/agent-os-vision/research/p1-04-review.md.
---

# Synthetic local-org seed + `fulcrum init` bootstrap

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Implement `src/db/seed.ts` and the `fulcrum init` CLI command so that running `fulcrum init` on a clean `FULCRUM_HOME` inserts via MikroORM repository calls:
- `em.upsert(Org, { id: '00000000-0000-0000-0000-000000000001', name: 'Local' })`.
- `em.upsert(User, { email: 'admin@local', role: 'owner', org: defaultOrg })`.
- `em.create(Session, {...})` + `em.persistAndFlush(...)` for a valid Better-Auth session row.

The seed is idempotent (re-running is safe; `em.upsert` is the canonical no-duplicate path). `fulcrum init` exits 0 on both first run and re-run. Web layout server `+layout.server.ts` calls the same idempotent seed logic on first request so local-mode users who never touch the CLI also get a bootstrapped org.

Cuts through: `src/db/seed.ts` (uses `EntityManager` resolved from needle-di container) → `fulcrum init` CLI command → SvelteKit layout server hook → tRPC `auth.whoami` → tests.

## Acceptance criteria
- [ ] Schema: after `fulcrum init`, `await orgRepo.count() === 1`, `await userRepo.count() === 1`, `await sessionRepo.count() === 1`, `await orgMemberRepo.count() === 1` for the well-known local-org + admin user.
- [ ] Server action / tRPC: `auth.whoami` returns `{ userId, orgId: '00000000-0000-0000-0000-000000000001', email: 'admin@local', role: 'owner' }` after init.
- [ ] Web surface: `+layout.server.ts` calls seed idempotently on first render; subsequent renders skip. No visible UX change for local-mode users (they land directly on the dashboard).
- [ ] CLI command: `fulcrum init` exits 0 on clean install; exits 0 on re-run (idempotent). Prints `✓ Local org bootstrapped` (or `✓ Already initialized`) to stdout.
- [ ] TUI screen: TUI status bar shows org name `Local` and user email `admin@local` after init.
- [ ] Tests: `tests/init/seed.test.ts` — run seed twice via `seedService.run()` (resolved from needle-di container), assert org/user/session count = 1 each time. `tests/cli/init.test.ts` — assert exit code 0 both runs. RED → GREEN.

## Blocked by
- `01-schema-auth-migration` (entities must be registered + migration class applied before seed can call `em.persistAndFlush`).

## Notes
`src/db/context.ts` `getOrgId(session)` helper is delivered in this slice because the layout server needs it. Seed should never prompt; local mode is fully headless/automatic per Q21. `SeedService` is registered as `@Injectable()` and resolved via the needle-di container exposed through `event.locals.container` (web) or the CLI handler context.
