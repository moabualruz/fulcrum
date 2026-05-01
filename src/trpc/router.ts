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

import { t, publicProcedure } from "./trpc.ts";
import { protectedProcedure } from "./middleware.ts";

// Real implementations (filled by owning pillar)
import { flagsRouter } from "../server/trpc/routers/flags.ts";

// Domain stub routers — src/trpc/routers/<domain>.ts
// Each exports list() → [] until the owning pillar replaces the body.
import { tasksRouter } from "./routers/tasks.ts";
import { documentsRouter } from "./routers/documents.ts";
import { memoriesRouter } from "./routers/memories.ts";
import { runsRouter } from "./routers/runs.ts";
import { artifactsRouter } from "./routers/artifacts.ts";
import { reposRouter } from "./routers/repos.ts";
import { sprintsRouter } from "./routers/sprints.ts";
import { searchRouter } from "./routers/search.ts";
import { notificationsRouter } from "./routers/notifications.ts";
import { webhooksRouter } from "./routers/webhooks.ts";

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
// orchestration sub-router stub — Pillar 5 (Symphony + agent dispatch)
// ─────────────────────────────────────────────────────────────────────────────
const orchestrationRouter = t.router({
  list: protectedProcedure.query(() => []),
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
  // Domain stub routers — owning pillar replaces list() with real impl
  tasks: tasksRouter,
  docs: documentsRouter,
  memory: memoriesRouter,
  runs: runsRouter,
  artifacts: artifactsRouter,
  repos: reposRouter,
  sprints: sprintsRouter,
  search: searchRouter,
  notifications: notificationsRouter,
  webhooks: webhooksRouter,
  // Real implementations
  flags: flagsRouter,
  orchestration: orchestrationRouter,
  health: healthRouter,
});

/**
 * AppRouter type — exported for:
 *   - Pillar 14 CLI codegen (reads tRPC procedure signatures → `fulcrum <domain> <verb>`)
 *   - Pillar 16 web client (`createTRPCClient<AppRouter>`)
 *   - TUI in-process caller (Pillar 15)
 */
export type AppRouter = typeof appRouter;
