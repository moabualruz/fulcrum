import { z } from "zod";
import { permissionedProcedure } from "@fulcrum/server/trpc/middleware.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import { TRPCError } from "@trpc/server";
import type { EntityManager } from "typeorm";
import { TimeEntry } from "@work-management/infrastructure/database/entities/tasks/TimeEntry.ts";
import { Task } from "@work-management/infrastructure/database/entities/tasks/Task.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

function requireEm(ctx: { em: EntityManager | null }): EntityManager {
  if (!ctx.em) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "EntityManager required." });
  return ctx.em;
}

export const timeEntriesRouter = t.router({
  log: permissionedProcedure({ resource: "tasks", action: "update" })
    .input(z.object({
      taskId: z.string().uuid(),
      durationMinutes: z.number().int().positive().max(1440),
      description: z.string().max(500).optional(),
      loggedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .mutation(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const entry = em.create(TimeEntry, {
        org: { id: ctx.orgId } as Org,
        task: { id: input.taskId } as Task,
        userId: ctx.userId,
        durationMinutes: input.durationMinutes,
        description: input.description ?? null,
        loggedDate: input.loggedDate,
      });
      const saved = await em.save(entry);
      return { id: saved.id, taskId: input.taskId, durationMinutes: saved.durationMinutes, loggedDate: saved.loggedDate };
    }),

  list: permissionedProcedure({ resource: "tasks", action: "list" })
    .input(z.object({
      taskId: z.string().uuid().optional(),
      userId: z.string().uuid().optional(),
      limit: z.number().int().positive().max(100).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const where: Record<string, unknown> = { org: { id: ctx.orgId } };
      if (input.taskId) where["task"] = { id: input.taskId };
      if (input.userId) where["userId"] = input.userId;
      const entries = await em.find(TimeEntry, {
        where: where as never,
        order: { loggedDate: "DESC", createdAt: "DESC" },
        take: input.limit ?? 50,
        relations: ["task"],
      });
      return entries.map((e) => ({
        id: e.id,
        taskId: e.task?.id ?? null,
        taskTitle: (e.task as Task & { title?: string })?.title ?? null,
        userId: e.userId,
        durationMinutes: e.durationMinutes,
        description: e.description,
        loggedDate: e.loggedDate,
        createdAt: e.createdAt,
      }));
    }),

  summary: permissionedProcedure({ resource: "reports", action: "list" })
    .input(z.object({
      taskId: z.string().uuid().optional(),
      userId: z.string().uuid().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const where: Record<string, unknown> = { org: { id: ctx.orgId } };
      if (input.taskId) where["task"] = { id: input.taskId };
      if (input.userId) where["userId"] = input.userId;
      const entries = await em.find(TimeEntry, { where: where as never });
      const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);
      return {
        totalMinutes,
        totalHours: Math.round(totalMinutes / 6) / 10,
        entryCount: entries.length,
      };
    }),

  delete: permissionedProcedure({ resource: "tasks", action: "delete" })
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const entry = await em.findOne(TimeEntry, { where: { id: input.id, org: { id: ctx.orgId } } as never });
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Time entry not found." });
      await em.remove(entry);
      return { ok: true };
    }),
});
