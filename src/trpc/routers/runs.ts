/**
 * Runs sub-router stub — Pillar 5 (Symphony + agent dispatch) replaces the body.
 *
 * list() returns [] until Pillar 5 wires ctx.container → RunRepository.
 * C8: needle-di Container pattern; repo resolved from ctx.container when available.
 */

import { t } from "../trpc.ts";
import { protectedProcedure } from "../middleware.ts";

export const runsRouter = t.router({
  /** list — stub; Pillar 5 replaces with: await repo.find({ org: ctx.orgId }) */
  list: protectedProcedure.query(() => []),
});

export type RunsRouter = typeof runsRouter;
