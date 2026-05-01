/**
 * Documents sub-router stub — Pillar 7 (documents + wiki) replaces the body.
 *
 * list() returns [] until Pillar 7 wires ctx.container → DocumentRepository.
 * C8: needle-di Container pattern; repo resolved from ctx.container when available.
 */

import { t } from "../trpc.ts";
import { protectedProcedure } from "../middleware.ts";

export const documentsRouter = t.router({
  /** list — stub; Pillar 7 replaces with: await repo.find({ org: ctx.orgId }) */
  list: protectedProcedure.query(() => []),
});

export type DocumentsRouter = typeof documentsRouter;
