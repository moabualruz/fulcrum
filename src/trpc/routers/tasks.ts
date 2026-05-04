/**
 * Tasks sub-router stub — Pillar 3 (tasks + kanban) replaces the body.
 *
 * list() returns [] until Pillar 3 wires ctx.container → TaskRepository.
 * C8: needle-di Container pattern; repo resolved from ctx.container when available.
 */

import { t } from "../trpc.ts";
import { permissionedProcedure } from "../middleware.ts";

export const tasksRouter = t.router({
  /** list — stub; Pillar 3 replaces with: await repo.find({ org: ctx.orgId }) */
  list: permissionedProcedure({ resource: "tasks", action: "list" }).query(() => []),
});

export type TasksRouter = typeof tasksRouter;
