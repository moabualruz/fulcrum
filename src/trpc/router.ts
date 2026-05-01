/**
 * Core AppRouter — root tRPC router for Fulcrum.
 *
 * Pattern: stub sub-router namespaces that downstream pillars fill via sub-router merge.
 * Each namespace is an empty router today; Pillar N replaces it with the real implementation
 * without touching this file (open/closed principle via re-export + merge).
 *
 * A6: Pillar 1 ships the skeleton; Pillar 13 finalises the full OpenAPI surface.
 * C4: Single shared AppRouter across web (SvelteKit), CLI, and TUI surfaces.
 *
 * Export checklist:
 *   - AppRouter (type) — consumed by Pillar 14 codegen + Pillar 16 web client.
 *   - appRouter (value) — passed to fetchRequestHandler in hooks.server.ts.
 */

import { z } from "zod";

import { t, publicProcedure } from "./trpc.ts";
import { protectedProcedure } from "./middleware.ts";

// ─────────────────────────────────────────────────────────────────────────────
// auth sub-router stub — Pillar 9 (auth tRPC procedures + org management)
// ─────────────────────────────────────────────────────────────────────────────
const authRouter = t.router({
  /**
   * auth.whoami — returns the current session's user + org info.
   * This is the canonical "are you alive?" probe used by Pillar 16 web client.
   */
  whoami: protectedProcedure.query(({ ctx }) => {
    return {
      userId: ctx.userId,
      orgId: ctx.orgId,
      sessionId: ctx.session.id,
    };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// db sub-router stub — Pillar 2 (MikroORM data layer procedures)
// ─────────────────────────────────────────────────────────────────────────────
const dbRouter = t.router({
  ping: publicProcedure.query(() => ({ ok: true })),
});

// ─────────────────────────────────────────────────────────────────────────────
// tasks sub-router stub — Pillar 3 (tasks + kanban)
// ─────────────────────────────────────────────────────────────────────────────
const tasksRouter = t.router({
  list: protectedProcedure.query(() => []),
});

// ─────────────────────────────────────────────────────────────────────────────
// docs sub-router stub — Pillar 7 (documents + wiki)
// ─────────────────────────────────────────────────────────────────────────────
const docsRouter = t.router({
  list: protectedProcedure.query(() => []),
});

// ─────────────────────────────────────────────────────────────────────────────
// memory sub-router stub — Pillar 10 (memory + retrieval)
// ─────────────────────────────────────────────────────────────────────────────
const memoryRouter = t.router({
  list: protectedProcedure.query(() => []),
});

// ─────────────────────────────────────────────────────────────────────────────
// flags sub-router stub — Pillar 7 (feature-flag registry)
// ─────────────────────────────────────────────────────────────────────────────
const flagsRouter = t.router({
  list: protectedProcedure.query(() => []),
});

// ─────────────────────────────────────────────────────────────────────────────
// orchestration sub-router stub — Pillar 5 (Symphony + agent dispatch)
// ─────────────────────────────────────────────────────────────────────────────
const orchestrationRouter = t.router({
  list: protectedProcedure.query(() => []),
});

// ─────────────────────────────────────────────────────────────────────────────
// repos sub-router stub — Pillar 8 (repo supervision)
// ─────────────────────────────────────────────────────────────────────────────
const reposRouter = t.router({
  list: protectedProcedure.query(() => []),
});

// ─────────────────────────────────────────────────────────────────────────────
// artifacts sub-router stub — Pillar 9 (artifact lifecycle)
// ─────────────────────────────────────────────────────────────────────────────
const artifactsRouter = t.router({
  list: protectedProcedure.query(() => []),
});

// ─────────────────────────────────────────────────────────────────────────────
// search sub-router stub — Pillar 12 (unified search + cmd+K)
// ─────────────────────────────────────────────────────────────────────────────
const searchRouter = t.router({
  query: protectedProcedure
    .input(z.object({ q: z.string() }))
    .query(() => []),
});

// ─────────────────────────────────────────────────────────────────────────────
// health sub-router — always public, no auth required
// ─────────────────────────────────────────────────────────────────────────────
const healthRouter = t.router({
  ping: publicProcedure.query(() => ({ ok: true, timestamp: new Date() })),
});

// ─────────────────────────────────────────────────────────────────────────────
// Root AppRouter — merge all domain namespaces
// ─────────────────────────────────────────────────────────────────────────────
export const appRouter = t.router({
  auth: authRouter,
  db: dbRouter,
  tasks: tasksRouter,
  docs: docsRouter,
  memory: memoryRouter,
  flags: flagsRouter,
  orchestration: orchestrationRouter,
  repos: reposRouter,
  artifacts: artifactsRouter,
  search: searchRouter,
  health: healthRouter,
});

/**
 * AppRouter type — exported for:
 *   - Pillar 14 CLI codegen (reads tRPC procedure signatures → `fulcrum <domain> <verb>`)
 *   - Pillar 16 web client (`createTRPCClient<AppRouter>`)
 *   - TUI in-process caller (Pillar 15)
 */
export type AppRouter = typeof appRouter;
