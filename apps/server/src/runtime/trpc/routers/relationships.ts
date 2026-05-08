import type { EntityManager } from "@mikro-orm/postgresql";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createRelationship,
  deleteRelationship,
  listBlockedItems,
  listRelationshipsForTask,
  listTaskBlockers,
  listTasksBlockedBy,
  markTaskAsDuplicate,
  summarizeEntityRelationships,
  type RelationshipsAppContext,
} from "@/application/relationships/commands.ts";
import { relationshipBucketSchema } from "@/application/relationships/summary.ts";
import { traceRefSchema, traceSpineSchema } from "@/application/trace/schemas.ts";
import { permissionedProcedure } from "@fulcrum/server/trpc/middleware.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const relationshipsApplication = {
  createRelationship,
  deleteRelationship,
  listRelationshipsForTask,
  listTaskBlockers,
  listBlockedItems,
  listTasksBlockedBy,
  markTaskAsDuplicate,
  summarizeEntityRelationships,
};

export function __setRelationshipsApplicationForTest(overrides: Partial<typeof relationshipsApplication>): () => void {
  const previous = { ...relationshipsApplication };
  Object.assign(relationshipsApplication, overrides);
  return () => Object.assign(relationshipsApplication, previous);
}

function requireEntityManager({ em }: { em: EntityManager | null }): EntityManager {
  if (em) return em;
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "EntityManager could not be resolved." });
}

function appContext(ctx: { orgId: string; userId: string }): RelationshipsAppContext {
  return { orgId: ctx.orgId, userId: ctx.userId };
}

export const relationshipsRouter = t.router({
  create: permissionedProcedure({ resource: "tasks", action: "update" })
    .input(z.object({
      sourceTaskId: z.string().uuid(),
      targetTaskId: z.string().uuid(),
      type: z.enum(["blocks", "relates_to", "duplicate_of"]),
    }))
    .mutation(async ({ ctx, input }) => {
      return relationshipsApplication.createRelationship(requireEntityManager(ctx), appContext(ctx), {
        sourceTaskId: input.sourceTaskId,
        targetTaskId: input.targetTaskId,
        type: input.type,
        userId: ctx.userId,
      });
    }),

  delete: permissionedProcedure({ resource: "tasks", action: "update" })
    .input(z.object({ relationshipId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await relationshipsApplication.deleteRelationship(requireEntityManager(ctx), appContext(ctx), input.relationshipId);
    }),

  listForTask: permissionedProcedure({ resource: "tasks", action: "list" })
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return relationshipsApplication.listRelationshipsForTask(requireEntityManager(ctx), appContext(ctx), input.taskId);
    }),

  blockers: permissionedProcedure({ resource: "tasks", action: "list" })
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return relationshipsApplication.listTaskBlockers(requireEntityManager(ctx), appContext(ctx), input.taskId);
    }),

  blockedItems: permissionedProcedure({ resource: "tasks", action: "list" })
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return relationshipsApplication.listBlockedItems(requireEntityManager(ctx), appContext(ctx), input.projectId);
    }),

  listBlockedBy: permissionedProcedure({ resource: "tasks", action: "list" })
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return relationshipsApplication.listTasksBlockedBy(requireEntityManager(ctx), appContext(ctx), input.taskId);
    }),

  markAsDuplicate: permissionedProcedure({ resource: "tasks", action: "update" })
    .input(z.object({
      sourceTaskId: z.string().uuid(),
      targetTaskId: z.string().uuid(),
      autoClose: z.boolean().default(true),
      transferWatchers: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      return relationshipsApplication.markTaskAsDuplicate(requireEntityManager(ctx), appContext(ctx), {
        sourceTaskId: input.sourceTaskId,
        targetTaskId: input.targetTaskId,
        autoClose: input.autoClose,
        transferWatchers: input.transferWatchers,
      });
    }),

  summary: permissionedProcedure({ resource: "tasks", action: "list" })
    .input(z.object({
      entity: traceRefSchema,
      trace: traceSpineSchema,
      refs: z.array(traceRefSchema),
      include: z.array(relationshipBucketSchema).optional(),
    }))
    .query(({ input }) => relationshipsApplication.summarizeEntityRelationships(input)),
});

export type RelationshipsRouter = typeof relationshipsRouter;
