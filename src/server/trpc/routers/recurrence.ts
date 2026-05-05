/**
 * recurrenceRouter — Phase 05 Plan 04 (D-116).
 *
 * tRPC surface for RecurrenceService.
 */

import { z } from "zod";

import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";
import { RecurrenceService } from "../../../services/RecurrenceService.ts";
import { TaskService } from "../../../services/TaskService.ts";

export const recurrenceRouter = t.router({
  list: permissionedProcedure({ resource: "tasks", action: "list" })
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) throw new Error("No entity manager");
      const taskSvc = new TaskService(ctx.em);
      const svc = new RecurrenceService(ctx.em, taskSvc);
      return svc.list(ctx.orgId, input.taskId);
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
      if (!ctx.em) throw new Error("No entity manager");
      const taskSvc = new TaskService(ctx.em);
      const svc = new RecurrenceService(ctx.em, taskSvc);
      return svc.create(ctx.orgId, input.taskId, {
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
      if (!ctx.em) throw new Error("No entity manager");
      const taskSvc = new TaskService(ctx.em);
      const svc = new RecurrenceService(ctx.em, taskSvc);
      await svc.delete(ctx.orgId, input.ruleId);
    }),
});

export type RecurrenceRouter = typeof recurrenceRouter;
