/**
 * relationshipsRouter — Phase 05 Plan 04.
 *
 * tRPC surface for RelationshipService (HIGH-04 fix).
 * D-122: markAsDuplicate
 * D-123: listBlockedBy
 *
 * Security: permissionedProcedure enforces session + org scope.
 */

import { z } from "zod";

import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";
import { RelationshipService } from "../../../services/RelationshipService.ts";

// ── Router ─────────────────────────────────────────────────────────────────────

export const relationshipsRouter = t.router({
  create: permissionedProcedure({ resource: "tasks", action: "update" })
    .input(z.object({
      sourceTaskId: z.string().uuid(),
      targetTaskId: z.string().uuid(),
      type: z.enum(["blocks", "relates_to", "duplicate_of"]),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.em) throw new Error("No entity manager");
      const svc = new RelationshipService(ctx.em);
      return svc.create(ctx.orgId, input.sourceTaskId, input.targetTaskId, input.type, ctx.userId);
    }),

  delete: permissionedProcedure({ resource: "tasks", action: "update" })
    .input(z.object({ relationshipId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.em) throw new Error("No entity manager");
      const svc = new RelationshipService(ctx.em);
      await svc.delete(ctx.orgId, input.relationshipId);
    }),

  listForTask: permissionedProcedure({ resource: "tasks", action: "list" })
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) throw new Error("No entity manager");
      const svc = new RelationshipService(ctx.em);
      return svc.listForTask(ctx.orgId, input.taskId);
    }),

  blockers: permissionedProcedure({ resource: "tasks", action: "list" })
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) throw new Error("No entity manager");
      const svc = new RelationshipService(ctx.em);
      return svc.listBlockers(ctx.orgId, input.taskId);
    }),

  blockedItems: permissionedProcedure({ resource: "tasks", action: "list" })
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) throw new Error("No entity manager");
      const svc = new RelationshipService(ctx.em);
      return svc.getBlockedItems(ctx.orgId, input.projectId);
    }),

  /** D-123: reverse query — what does this task block? */
  listBlockedBy: permissionedProcedure({ resource: "tasks", action: "list" })
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) throw new Error("No entity manager");
      const svc = new RelationshipService(ctx.em);
      return svc.listBlockedBy(ctx.orgId, input.taskId);
    }),

  /** D-122: mark as duplicate with auto-close + watcher transfer */
  markAsDuplicate: permissionedProcedure({ resource: "tasks", action: "update" })
    .input(z.object({
      sourceTaskId: z.string().uuid(),
      targetTaskId: z.string().uuid(),
      autoClose: z.boolean().default(true),
      transferWatchers: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.em) throw new Error("No entity manager");
      const svc = new RelationshipService(ctx.em);
      return svc.markAsDuplicate(ctx.orgId, input.sourceTaskId, input.targetTaskId, {
        autoClose: input.autoClose,
        transferWatchers: input.transferWatchers,
      });
    }),
});

export type RelationshipsRouter = typeof relationshipsRouter;
