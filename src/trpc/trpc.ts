/**
 * tRPC v11 instance — superjson transformer + error formatter.
 *
 * C8: Context carries needle-di container so procedures resolve services lazily.
 * C4: Single shared core — all three surfaces (web, CLI, TUI) consume these builders.
 */

import { initTRPC } from "@trpc/server";
import SuperJSON from "superjson";

import type { TRPCContext } from "./context.ts";

export const t = initTRPC.context<TRPCContext>().create({
  /**
   * superjson transformer — transparently handles Date, Map, Set, Infinity, etc.
   * Required for Date columns from MikroORM to round-trip correctly over tRPC.
   */
  transformer: SuperJSON,

  /**
   * Error formatter — strip internal stack traces in production.
   * Always exposes TRPCError code and message; hides cause in prod.
   */
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Only surface stack in non-production environments
        stack: process.env["NODE_ENV"] !== "production" ? error.message : undefined,
      },
    };
  },
});

/**
 * Public procedure builder — no auth required.
 * Use only for genuinely unauthenticated endpoints (e.g. invite-accept token validation).
 */
export const publicProcedure = t.procedure;
