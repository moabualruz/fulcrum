---
Status: completed
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 05-better-auth-integration
Owner: claude-orchestrator
CompletedAt: 2026-05-01T21:30:00Z
ReviewVerdict: APPROVED — Codex functional checks ALL PASS (context type, AppRouter export, assertPermission UNAUTHORIZED, SvelteKit handler at /api/trpc/**, 11 tests). Scope "FAIL" overridden: package.json/bun.lock/src/trpc/schemas/*/issue file were all in dispatched allowed list.
ReviewDebtResolved: 2026-05-02T06:44:06Z — Claude adversarial review review-monyckiz-hm38tr SPEC PASS, follow-up review-monz2qeb-brwjnb SPEC PASS / QUALITY APPROVED after F1/F2 fixes.
---

# tRPC v11 core router + context + assertPermission middleware

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Scaffold the tRPC v11 core router that all subsequent pillars extend:

- `src/server/trpc/index.ts` — `initTRPC` with context; root router; sub-router merge pattern.
- `src/server/trpc/context.ts` — `createContext(req, container)` extracts session from Better-Auth (resolved through the MikroORM-backed adapter from slice `05`), resolves `{ orgId, userId, role }`, and attaches the needle-di `container` so handlers can `inject(EntityManager)` / repositories lazily. Called by SvelteKit fetch adapter, CLI in-process caller, and TUI in-process caller.
- `src/server/trpc/middleware/assertPermission.ts` — middleware that calls `Better-Auth hasPermission()` for mutations; missing or invalid role → throws `TRPCError({ code: 'FORBIDDEN' })`. Applied to every mutation procedure by default via a `protectedProcedure` builder.
- `src/server/trpc/schemas/` — create one placeholder Zod file per domain: `auth.ts`, `flags.ts`, `orgs.ts`. Other pillars add their domain schemas here.
- SvelteKit mount: `src/web/src/routes/api/trpc/[...path]/+server.ts` — `fetchRequestHandler` adapter; passes `event.locals.container` into `createContext`.

Cuts through: tRPC init → context (with needle-di container + EM) → middleware → SvelteKit route handler → unit tests for FORBIDDEN path. `Event` rows are written via `eventRepo.create({...}); em.persistAndFlush(...)` from the middleware where applicable (e.g., audit-log entry on permission denial when `audit-permission-denials` flag is on later).

## Acceptance criteria
- [ ] Schema: no migration classes; reads existing session entities via `sessionRepo`.
- [ ] Server action / tRPC: calling any mutation procedure without a valid session returns `TRPCError code='FORBIDDEN'`. Calling with `admin@local` owner session succeeds. `ctx.orgId` + `ctx.userId` + `ctx.container` populated on every authenticated call.
- [ ] Web surface: `GET /api/trpc/auth.whoami` (via SvelteKit `[...path]` handler) returns 200 with correct payload when session cookie present; 401/FORBIDDEN when absent.
- [ ] CLI command: in-process tRPC call from `src/cli/` resolves correctly (no HTTP round-trip). Verified by calling `ctx` factory directly in CLI test, with the same shared needle-di container.
- [ ] TUI screen: N/A — TUI in-process binding verified in slice `15`.
- [ ] Tests: `tests/trpc/middleware.test.ts` — unauthenticated mutation → FORBIDDEN; authenticated mutation → passes. `tests/trpc/context.test.ts` — assert `ctx.orgId` equals well-known local org UUID for `admin@local` session; assert `ctx.container.get(EntityManager)` returns a usable EM. RED → GREEN.

## Blocked by
- `05-better-auth-integration` (context factory reads Better-Auth session via the MikroORM-backed adapter).

## Notes
`protectedProcedure = t.procedure.use(assertPermission)` — all mutations in this pillar use this builder. Query procedures use `publicProcedure` only for the few endpoints that genuinely need unauthenticated access (e.g. invite-accept token validation). Failure gate: if tRPC v11 + Bun `--compile` incompatible → switch to Hono + `@hono/zod-openapi` (keep Zod schemas + needle-di container unchanged).
