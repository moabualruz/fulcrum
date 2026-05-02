/**
 * Search sub-router stub — Pillar 12 (unified search + cmd+K) replaces the body.
 *
 * query() returns [] until Pillar 12 wires ctx.container → SearchService.
 * C8: needle-di Container pattern; service resolved from ctx.container when available.
 */

import { z } from "zod";

import { t } from "../trpc.ts";
import { protectedProcedure } from "../middleware.ts";

export const searchRouter = t.router({
  /** query — stub; Pillar 12 replaces with: await searchService.query(input.q, ctx.orgId) */
  query: protectedProcedure
    .input(z.object({ q: z.string() }))
    .query(() => []),
});

export type SearchRouter = typeof searchRouter;
