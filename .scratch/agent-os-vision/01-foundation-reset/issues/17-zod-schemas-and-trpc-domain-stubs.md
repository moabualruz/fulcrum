---
Status: completed
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 06-trpc-core-router-and-permission-middleware
ReviewDebtResolved: 2026-05-02T10:01:13Z — Claude adversarial review review-moo61q5y-llfvx1 SPEC PASS for this issue; no blocking findings.
---

# Zod schema folder + tRPC domain stub routers for all subsequent pillars

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Establish the `src/server/trpc/schemas/` folder layout and populate stub tRPC sub-routers for every domain that later pillars will fill in. This creates the compile-time skeleton so all pillars can extend without reorganizing the router structure. Stub procedures that need data access resolve repositories from `ctx.container` (needle-di) — placeholders return `[]` but the resolution path is wired so later pillars only need to swap the body.

**`src/server/trpc/schemas/` files (Zod):**
- `auth.ts`, `orgs.ts`, `flags.ts` — already done in slices `09` + `07`; finalize here.
- `tasks.ts`, `documents.ts`, `memories.ts`, `runs.ts`, `artifacts.ts`, `repos.ts`, `sprints.ts`, `search.ts`, `notifications.ts`, `webhooks.ts` — placeholder Zod schemas with the primary entity shape (id, orgId, createdAt, name/title, status). Exact fields filled by owning pillar.

**`src/server/trpc/routers/` stub routers:**
- One file per domain: `tasks.ts`, `documents.ts`, `memories.ts`, `runs.ts`, `artifacts.ts`, `repos.ts`, `sprints.ts`, `search.ts`, `notifications.ts`, `webhooks.ts`.
- Each exports a sub-router with a single `list()` procedure that returns an empty array (placeholder; will be replaced with `await repo.find({ org: ctx.orgId })` by the owning pillar). Enough to type-check; later pillars replace the placeholder.
- All stub routers merged into the root router in `src/server/trpc/index.ts`.

**SvelteKit client proxy** `src/web/src/lib/trpc.ts` — updated to include all stub routers so the client-side type tree is complete.

Cuts through: Zod schemas → tRPC stub procedures → root router merge → TypeScript compile check → client-proxy type check.

## Acceptance criteria
- [ ] Schema: no migration classes.
- [ ] Server action / tRPC: `bun tsc --noEmit` passes with zero type errors after all stub routers merged into root. Each stub `list()` returns `[]` when called.
- [ ] Web surface: SvelteKit client proxy `src/web/src/lib/trpc.ts` has typed access to every stub domain (e.g. `trpc.tasks.list.query()` resolves to `[]`).
- [ ] CLI command: N/A — stubs are internal; CLI bindings added per-domain by owning pillar.
- [ ] TUI screen: N/A — stubs are internal.
- [ ] Tests: `tests/trpc/stubs.test.ts` — call each stub `list()` procedure; assert return value is `[]` and no error thrown. `tests/types/trpc-compile.test.ts` — assert `bun tsc --noEmit` exits 0. RED → GREEN.

## Blocked by
- `06-trpc-core-router-and-permission-middleware` (root router must exist before merging domain routers).

## Notes
This is a pure-internal structural slice — no web, CLI, or TUI surfaces because stubs carry no behavior. Explicitly noted as internal per rule in the process instructions. The goal is zero schema-rewrites or router reorganizations in Pillars 2–16.
