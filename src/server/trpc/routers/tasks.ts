import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { Task } from "../../../db/entities/tasks/Task.ts";
import { TaskRepository } from "../../../db/repositories/tasks/TaskRepository.ts";
import { protectedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";

const TaskOutputSchema = z.object({
  id: z.uuid(),
  orgId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string().nullable(),
  priority: z.number().int().nullable(),
  points: z.number().int().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});

const ListTasksInputSchema = z.object({
  includeDeleted: z.boolean().optional(),
}).optional();

const TaskIdInputSchema = z.object({
  id: z.uuid(),
});

const CreateTaskInputSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  status: z.string().trim().min(1).nullable().optional(),
  priority: z.number().int().nullable().optional(),
  points: z.number().int().nonnegative().nullable().optional(),
});

const UpdateTaskInputSchema = TaskIdInputSchema.extend({
  title: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.string().trim().min(1).nullable().optional(),
  priority: z.number().int().nullable().optional(),
  points: z.number().int().nonnegative().nullable().optional(),
});

type TaskOutput = z.infer<typeof TaskOutputSchema>;

function serializeTask(task: Task): TaskOutput {
  return {
    id: task.id,
    orgId: task.org.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    points: task.points ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    deletedAt: task.deletedAt,
  };
}

function resolveTaskRepository(ctx: {
  container: import("@needle-di/core").Container | null;
  em: import("@mikro-orm/postgresql").EntityManager | null;
}): TaskRepository {
  if (ctx.container?.has(TaskRepository)) {
    return ctx.container.get(TaskRepository);
  }

  if (ctx.em) {
    return ctx.em.getRepository(Task) as TaskRepository;
  }

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "TaskRepository could not be resolved.",
  });
}

function hasTaskRepository(ctx: {
  container: import("@needle-di/core").Container | null;
  em: import("@mikro-orm/postgresql").EntityManager | null;
}): boolean {
  return Boolean(ctx.em || ctx.container?.has(TaskRepository));
}

export const tasksRouter = t.router({
  list: protectedProcedure
    .input(ListTasksInputSchema)
    .output(z.array(TaskOutputSchema))
    .query(async ({ ctx, input }) => {
      if (!hasTaskRepository(ctx)) return [];
      const repo = resolveTaskRepository(ctx);
      const tasks = await repo.list({
        orgId: ctx.orgId,
        includeDeleted: input?.includeDeleted ?? false,
      });
      return tasks.map(serializeTask);
    }),

  get: protectedProcedure
    .input(TaskIdInputSchema)
    .output(TaskOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      if (!hasTaskRepository(ctx)) return null;
      const repo = resolveTaskRepository(ctx);
      const task = await repo.get({ orgId: ctx.orgId, id: input.id });
      return task ? serializeTask(task) : null;
    }),

  create: protectedProcedure
    .input(CreateTaskInputSchema)
    .output(TaskOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const repo = resolveTaskRepository(ctx);
      const task = repo.create({ orgId: ctx.orgId, ...input });
      await repo.getEntityManager().flush();
      return serializeTask(task);
    }),

  update: protectedProcedure
    .input(UpdateTaskInputSchema)
    .output(TaskOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const repo = resolveTaskRepository(ctx);
      const task = await repo.update({ orgId: ctx.orgId, ...input });
      return task ? serializeTask(task) : null;
    }),

  delete: protectedProcedure
    .input(TaskIdInputSchema)
    .output(TaskOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const repo = resolveTaskRepository(ctx);
      const task = await repo.delete({ orgId: ctx.orgId, id: input.id });
      return task ? serializeTask(task) : null;
    }),
});

export type TasksRouter = typeof tasksRouter;
