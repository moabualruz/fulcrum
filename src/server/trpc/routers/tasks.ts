import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { Task } from "../../../db/entities/tasks/Task.ts";
import { DependenciesSchema } from "../../../db/entities/tasks/schemas.ts";
import { TaskRepository } from "../../../db/repositories/tasks/TaskRepository.ts";
import { type TipTapJson } from "../../../db/tasks-rich-text.ts";
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";
import { TaskService, normalizedUnique } from "../../../services/TaskService.ts";

// ── Schemas ────────────────────────────────────────────────────────

const TipTapContentSchema: z.ZodType<TipTapJson> = z.lazy(() =>
  z.object({
    type: z.string().optional(),
    text: z.string().optional(),
    content: z.array(TipTapContentSchema).optional(),
  }).catchall(z.unknown()),
);

const TaskOutputSchema = z.object({
  id: z.uuid(),
  orgId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  title: z.string(),
  description: z.string().nullable(),
  descriptionText: z.string(),
  tiptapContent: TipTapContentSchema,
  status: z.string().nullable(),
  priority: z.number().int().nullable(),
  points: z.number().int().nullable(),
  parentId: z.uuid().nullable(),
  dependencies: DependenciesSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});

const ListTasksInputSchema = z.object({
  includeDeleted: z.boolean().optional(),
}).optional();

const TaskIdInputSchema = z.object({ id: z.uuid() });

const TaskIdsInputSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500).transform(normalizedUnique),
});

const TaskRelationIdInputSchema = z.object({ taskId: z.uuid() });

const SetParentInputSchema = TaskRelationIdInputSchema.extend({
  parentId: z.uuid().nullable(),
});

const SetDependenciesInputSchema = TaskRelationIdInputSchema.extend({
  dependencies: DependenciesSchema,
});

const CreateTaskInputSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  descriptionText: z.string().optional(),
  tiptapContent: TipTapContentSchema.optional(),
  status: z.string().trim().min(1).nullable().optional(),
  priority: z.number().int().nullable().optional(),
  points: z.number().int().nonnegative().nullable().optional(),
});

const UpdateTaskInputSchema = TaskIdInputSchema.extend({
  title: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  descriptionText: z.string().optional(),
  tiptapContent: TipTapContentSchema.optional(),
  status: z.string().trim().min(1).nullable().optional(),
  priority: z.number().int().nullable().optional(),
  points: z.number().int().nonnegative().nullable().optional(),
});

const BulkTaskPatchSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  descriptionText: z.string().optional(),
  tiptapContent: TipTapContentSchema.optional(),
  status: z.string().trim().min(1).nullable().optional(),
  priority: z.number().int().nullable().optional(),
  points: z.number().int().nonnegative().nullable().optional(),
  assignee: z.string().trim().min(1).nullable().optional(),
  label: z.string().trim().min(1).nullable().optional(),
  sprintId: z.uuid().nullable().optional(),
  projectId: z.uuid().nullable().optional(),
}).refine((patch) => Object.keys(patch).length > 0, {
  message: "Bulk update patch must include at least one field.",
});

const BulkUpdateTasksInputSchema = TaskIdsInputSchema.extend({
  patch: BulkTaskPatchSchema,
});

const BulkUpdateOutputSchema = z.object({ updated: z.number().int().nonnegative() });
const BulkDeleteOutputSchema = z.object({ deleted: z.number().int().nonnegative() });

// ── Helpers ────────────────────────────────────────────────────────

function resolveService(ctx: {
  container: import("@needle-di/core").Container | null;
  em: import("@mikro-orm/postgresql").EntityManager | null;
}): TaskService {
  if (ctx.em) return new TaskService(ctx.em);
  if (ctx.container?.has(TaskRepository)) {
    const repo = ctx.container.get(TaskRepository);
    return new TaskService(repo.getEntityManager() as import("@mikro-orm/postgresql").EntityManager);
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "TaskService could not be resolved." });
}

function hasEm(ctx: {
  container: import("@needle-di/core").Container | null;
  em: import("@mikro-orm/postgresql").EntityManager | null;
}): boolean {
  return Boolean(ctx.em || ctx.container?.has(TaskRepository));
}

// ── Router (thin delegation layer) ─────────────────────────────────

export const tasksRouter = t.router({
  list: permissionedProcedure({ resource: "tasks", action: "list" })
    .input(ListTasksInputSchema)
    .output(z.array(TaskOutputSchema))
    .query(async ({ ctx, input }) => {
      if (!hasEm(ctx)) return [];
      return resolveService(ctx).list(ctx.orgId, input?.includeDeleted ?? false);
    }),

  get: permissionedProcedure({ resource: "tasks", action: "get" })
    .input(TaskIdInputSchema)
    .output(TaskOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      if (!hasEm(ctx)) return null;
      return resolveService(ctx).get(ctx.orgId, input.id);
    }),

  create: permissionedProcedure({ resource: "tasks", action: "create" })
    .input(CreateTaskInputSchema)
    .output(TaskOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return resolveService(ctx).create(ctx.orgId, input);
    }),

  update: permissionedProcedure({ resource: "tasks", action: "update" })
    .input(UpdateTaskInputSchema)
    .output(TaskOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return resolveService(ctx).update(ctx.orgId, input);
    }),

  delete: permissionedProcedure({ resource: "tasks", action: "delete" })
    .input(TaskIdInputSchema)
    .output(TaskOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return resolveService(ctx).delete(ctx.orgId, input.id);
    }),

  bulkUpdate: permissionedProcedure({ resource: "tasks", action: "bulkUpdate" })
    .input(BulkUpdateTasksInputSchema)
    .output(BulkUpdateOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return resolveService(ctx).bulkUpdate(ctx, input.ids, input.patch);
    }),

  bulkDelete: permissionedProcedure({ resource: "tasks", action: "bulkDelete" })
    .input(TaskIdsInputSchema)
    .output(BulkDeleteOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return resolveService(ctx).bulkDelete(ctx, input.ids);
    }),

  setParent: permissionedProcedure({ resource: "tasks", action: "setParent" })
    .input(SetParentInputSchema)
    .output(TaskOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return resolveService(ctx).setParent(ctx, input.taskId, input.parentId);
    }),

  listChildren: permissionedProcedure({ resource: "tasks", action: "listChildren" })
    .input(TaskRelationIdInputSchema)
    .output(z.array(TaskOutputSchema))
    .query(async ({ ctx, input }) => {
      return resolveService(ctx).listChildren(ctx.orgId, input.taskId);
    }),

  setDependencies: permissionedProcedure({ resource: "tasks", action: "setDependencies" })
    .input(SetDependenciesInputSchema)
    .output(TaskOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return resolveService(ctx).setDependencies(ctx, input.taskId, input.dependencies);
    }),
});

export type TasksRouter = typeof tasksRouter;
