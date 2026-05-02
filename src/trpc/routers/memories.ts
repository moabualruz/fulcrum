/**
 * Memories sub-router stub — Pillar 10 (memory + retrieval) replaces the body.
 *
 * list() returns [] until Pillar 10 wires ctx.container → MemoryRepository.
 * C8: needle-di Container pattern; repo resolved from ctx.container when available.
 */

import { t } from "../trpc.ts";
import { protectedProcedure } from "../middleware.ts";

export const memoriesRouter = t.router({
  /** list — stub; Pillar 10 replaces with: await repo.find({ org: ctx.orgId }) */
  list: protectedProcedure.query(() => []),
});

export type MemoriesRouter = typeof memoriesRouter;
