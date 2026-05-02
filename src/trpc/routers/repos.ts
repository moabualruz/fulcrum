/**
 * Repos sub-router stub — Pillar 8 (repo supervision) replaces the body.
 *
 * list() returns [] until Pillar 8 wires ctx.container → RepoRepository.
 * C8: needle-di Container pattern; repo resolved from ctx.container when available.
 */

import { t } from "../trpc.ts";
import { protectedProcedure } from "../middleware.ts";

export const reposRouter = t.router({
  /** list — stub; Pillar 8 replaces with: await repo.find({ org: ctx.orgId }) */
  list: protectedProcedure.query(() => []),
});

export type ReposRouter = typeof reposRouter;
