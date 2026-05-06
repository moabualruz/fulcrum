import type { EntityManager } from "@mikro-orm/postgresql";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  bulkDelete,
  bulkUpdate,
  createTask,
  deleteTask,
  setDependencies,
  setParent,
  updateTask,
} from "../../../application/tasks/commands.ts";
import { getTask, listChildren, listTasks } from "../../../application/tasks/queries.ts";
import {
  BulkDeleteOutputSchema,
  BulkUpdateOutputSchema,
  BulkUpdateTasksInputSchema,
  CreateTaskInputSchema,
  ListTasksInputSchema,
  SetDependenciesInputSchema,
  SetParentInputSchema,
  TaskDtoSchema,
  TaskIdInputSchema,
  TaskIdsInputSchema,
  TaskRelationIdInputSchema,
  UpdateTaskInputSchema,
} from "../../../application/tasks/schema.ts";
import type { AppContext } from "../../../application/tasks/types.ts";
import { appErrorToTrpcError } from "../../../application/error-mapping.ts";
import { AppError } from "../../../application/errors.ts";
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";

const taskApplication = {
  createTask,
  updateTask,
  deleteTask,
  bulkUpdate,
  bulkDelete,
  setParent,
  setDependencies,
  listTasks,
  getTask,
  listChildren,
};

export function __setTaskApplicationForTest(overrides: Partial<typeof taskApplication>): () => void {
  const previous = { ...taskApplication };
  Object.assign(taskApplication, overrides);
  return () => Object.assign(taskApplication, previous);
}

// ── Helpers ────────────────────────────────────────────────────────

function requireEntityManager(ctx: { em: EntityManager | null }): EntityManager {
  if (ctx.em) return ctx.em;
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "EntityManager could not be resolved." });
}

function appContext(ctx: { orgId: string; userId: string }): AppContext {
  return { orgId: ctx.orgId, userId: ctx.userId, projectId: null };
}

async function mapAppError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) throw appErrorToTrpcError(error);
    throw error;
  }
}

// ── Router (thin delegation layer) ─────────────────────────────────

export const tasksRouter = t.router({
  list: permissionedProcedure({ resource: "tasks", action: "list" })
    .input(ListTasksInputSchema)
    .output(z.array(TaskDtoSchema))
    .query(async ({ ctx, input }) => {
      return mapAppError(() => taskApplication.listTasks(requireEntityManager(ctx), appContext(ctx), input ?? {}));
    }),

  get: permissionedProcedure({ resource: "tasks", action: "get" })
    .input(TaskIdInputSchema)
    .output(TaskDtoSchema)
    .query(async ({ ctx, input }) => {
      return mapAppError(() => taskApplication.getTask(requireEntityManager(ctx), appContext(ctx), input.id));
    }),

  create: permissionedProcedure({ resource: "tasks", action: "create" })
    .input(CreateTaskInputSchema)
    .output(TaskDtoSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => taskApplication.createTask(requireEntityManager(ctx), appContext(ctx), input));
    }),

  update: permissionedProcedure({ resource: "tasks", action: "update" })
    .input(UpdateTaskInputSchema)
    .output(TaskDtoSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      return mapAppError(() => taskApplication.updateTask(requireEntityManager(ctx), appContext(ctx), id, patch));
    }),

  delete: permissionedProcedure({ resource: "tasks", action: "delete" })
    .input(TaskIdInputSchema)
    .output(TaskDtoSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => taskApplication.deleteTask(requireEntityManager(ctx), appContext(ctx), input.id));
    }),

  bulkUpdate: permissionedProcedure({ resource: "tasks", action: "bulkUpdate" })
    .input(BulkUpdateTasksInputSchema)
    .output(BulkUpdateOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => taskApplication.bulkUpdate(requireEntityManager(ctx), appContext(ctx), input.ids, input.patch));
    }),

  bulkDelete: permissionedProcedure({ resource: "tasks", action: "bulkDelete" })
    .input(TaskIdsInputSchema)
    .output(BulkDeleteOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => taskApplication.bulkDelete(requireEntityManager(ctx), appContext(ctx), input.ids));
    }),

  setParent: permissionedProcedure({ resource: "tasks", action: "setParent" })
    .input(SetParentInputSchema)
    .output(TaskDtoSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => taskApplication.setParent(requireEntityManager(ctx), appContext(ctx), input.taskId, input.parentId));
    }),

  listChildren: permissionedProcedure({ resource: "tasks", action: "listChildren" })
    .input(TaskRelationIdInputSchema)
    .output(z.array(TaskDtoSchema))
    .query(async ({ ctx, input }) => {
      return mapAppError(() => taskApplication.listChildren(requireEntityManager(ctx), appContext(ctx), input.taskId));
    }),

  setDependencies: permissionedProcedure({ resource: "tasks", action: "setDependencies" })
    .input(SetDependenciesInputSchema)
    .output(TaskDtoSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() =>
        taskApplication.setDependencies(requireEntityManager(ctx), appContext(ctx), input.taskId, input.dependencies)
      );
    }),
});

export type TasksRouter = typeof tasksRouter;
