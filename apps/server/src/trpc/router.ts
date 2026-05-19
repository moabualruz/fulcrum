/**
 * Core AppRouter — root tRPC router for Fulcrum.
 *
 * Declarative mount-only: each domain router lives in its own file.
 * No inline stub helpers or duplicate aliases.
 */

import { buildFulcrumAppRouter } from "./root-router.ts";

export const appRouter = buildFulcrumAppRouter();

export type AppRouter = typeof appRouter;
