/**
 * Artifacts sub-router stub — Pillar 9 (artifact lifecycle) replaces the body.
 *
 * list() returns [] until Pillar 9 wires ctx.container → ArtifactRepository.
 * C8: needle-di Container pattern; repo resolved from ctx.container when available.
 */

import { t } from "../trpc.ts";
import { protectedProcedure } from "../middleware.ts";

export const artifactsRouter = t.router({
  /** list — stub; Pillar 9 replaces with: await repo.find({ org: ctx.orgId }) */
  list: protectedProcedure.query(() => []),
});

export type ArtifactsRouter = typeof artifactsRouter;
