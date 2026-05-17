import type { EntityManager } from "typeorm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createRecurrenceRule,
  deleteRecurrenceRule,
  listRecurrenceRules,
  type RecurrenceAppContext,
} from "@work-management/application/recurrence/commands.ts";
import { permissionedProcedure } from "@fulcrum/server/trpc/middleware.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const recurrenceApplication = {
  listRecurrenceRules,
  createRecurrenceRule,
  deleteRecurrenceRule,
};

export function __setRecurrenceApplicationForTest(overrides: Partial<typeof recurrenceApplication>): () => void {
  const previous = { ...recurrenceApplication };
  Object.assign(recurrenceApplication, overrides);
  return () => Object.assign(recurrenceApplication, previous);
}

function requireEntityManager({ em }: { em: EntityManager | null }): EntityManager {
  if (em) return em;
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "EntityManager could not be resolved." });
}

function appContext(ctx: { orgId: string; userId: string }): RecurrenceAppContext {
  return { orgId: ctx.orgId, userId: ctx.userId };
}

export const recurrenceRouter = t.router({
  list: permissionedProcedure({ resource: "tasks", action: "list" })
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return recurrenceApplication.listRecurrenceRules(requireEntityManager(ctx), appContext(ctx), input.taskId);
    }),

  create: permissionedProcedure({ resource: "tasks", action: "update" })
    .input(z.object({
      taskId: z.string().uuid(),
      triggerType: z.enum(["schedule", "on_complete"]),
      cronExpression: z.string().optional(),
      intervalDays: z.number().int().positive().optional(),
      timezone: z.string().optional(),
      includeSubtasks: z.boolean().optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      maxOccurrences: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return recurrenceApplication.createRecurrenceRule(requireEntityManager(ctx), appContext(ctx), input.taskId, {
        triggerType: input.triggerType,
        cronExpression: input.cronExpression,
        intervalDays: input.intervalDays,
        timezone: input.timezone,
        includeSubtasks: input.includeSubtasks,
        startDate: input.startDate,
        endDate: input.endDate,
        maxOccurrences: input.maxOccurrences,
      });
    }),

  delete: permissionedProcedure({ resource: "tasks", action: "update" })
    .input(z.object({ ruleId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await recurrenceApplication.deleteRecurrenceRule(requireEntityManager(ctx), appContext(ctx), input.ruleId);
    }),
});

export type RecurrenceRouter = typeof recurrenceRouter;
