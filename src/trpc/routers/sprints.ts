/**
 * Sprints sub-router stub — Pillar 3 (tasks + kanban) replaces the body.
 *
 * list() returns [] until Pillar 3 wires ctx.container → SprintRepository.
 * C8: needle-di Container pattern; repo resolved from ctx.container when available.
 */

import { t } from "../trpc.ts";
import { protectedProcedure } from "../middleware.ts";

export const sprintsRouter = t.router({
  /** list — stub; Pillar 3 replaces with: await repo.find({ org: ctx.orgId }) */
  list: protectedProcedure.query(() => []),
});

export type SprintsRouter = typeof sprintsRouter;
