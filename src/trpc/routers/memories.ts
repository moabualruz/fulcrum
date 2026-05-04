/**
 * Memories sub-router stub — Pillar 10 (memory + retrieval) replaces the body.
 *
 * list() returns [] until Pillar 10 wires ctx.container → MemoryRepository.
 * C8: needle-di Container pattern; repo resolved from ctx.container when available.
 */

import { t } from "../trpc.ts";
import { permissionedProcedure } from "../middleware.ts";

export const memoriesRouter = t.router({
  /** list — stub; Pillar 10 replaces with: await repo.find({ org: ctx.orgId }) */
  list: permissionedProcedure({ resource: "memories", action: "list" }).query(() => []),
});

export type MemoriesRouter = typeof memoriesRouter;
