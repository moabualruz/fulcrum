import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { Event } from "../../../db/entities/core/Event.ts";
import { Org } from "../../../db/entities/auth/Org.ts";
import { Task } from "../../../db/entities/tasks/Task.ts";
import { DependenciesSchema, type TaskDependencies } from "../../../db/entities/tasks/schemas.ts";
import { TaskRepository } from "../../../db/repositories/tasks/TaskRepository.ts";
import { tipTapDocToText, type TipTapJson } from "../../../db/tasks-rich-text.ts";
import { protectedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";

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

const TaskIdInputSchema = z.object({
  id: z.uuid(),
});

const TaskRelationIdInputSchema = z.object({
  taskId: z.uuid(),
});

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

type TaskOutput = z.infer<typeof TaskOutputSchema>;

function serializeTask(task: Task): TaskOutput {
  return {
    id: task.id,
    orgId: task.org.id,
    title: task.title,
    description: task.description,
    descriptionText: tipTapDocToText(task.tiptapContent as TipTapJson),
    tiptapContent: task.tiptapContent as TipTapJson,
    status: task.status,
    priority: task.priority,
    points: task.points ?? null,
    parentId: task.parent?.id ?? null,
    dependencies: task.dependencies,
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

async function emitTaskEvent(ctx: {
  orgId: string;
  userId: string | null;
  em: import("@mikro-orm/postgresql").EntityManager | null;
}, input: {
  verb: "parent_changed" | "dependency_updated";
  taskId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  if (!ctx.em) return;

  const event = ctx.em.create(Event, {
    org: ctx.em.getReference(Org, ctx.orgId),
    verb: input.verb,
    subjectKind: "task",
    subjectId: input.taskId,
    payload: input.payload,
    createdAt: new Date(),
  });
  ctx.em.persist(event);
}

function normalizedUnique(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

async function findTaskOrNull(repo: TaskRepository, orgId: string, id: string): Promise<Task | null> {
  return repo.get({ orgId, id });
}

async function assertParentDoesNotCycle(input: {
  repo: TaskRepository;
  orgId: string;
  taskId: string;
  parentId: string | null;
}): Promise<void> {
  let cursor = input.parentId;
  const seen = new Set<string>();

  while (cursor) {
    if (cursor === input.taskId || seen.has(cursor)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Task parent cycle rejected.",
      });
    }
    seen.add(cursor);

    const parent = await findTaskOrNull(input.repo, input.orgId, cursor);
    cursor = parent?.parent?.id ?? null;
  }
}

function assertDependencyGraphDoesNotCycle(edges: Map<string, Set<string>>): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(id: string): void {
    if (visiting.has(id)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Task dependency cycle rejected.",
      });
    }
    if (visited.has(id)) return;

    visiting.add(id);
    for (const next of edges.get(id) ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of edges.keys()) visit(id);
}

function replaceTaskDependencyEdges(input: {
  taskId: string;
  tasks: Task[];
  dependencies: TaskDependencies;
}): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>();

  for (const task of input.tasks) {
    edges.set(task.id, new Set(task.dependencies.blocks));
  }

  for (const [from, blocks] of edges) {
    if (from === input.taskId) {
      edges.set(from, new Set());
    }
  }

  edges.set(input.taskId, new Set(input.dependencies.blocks));
  for (const blockerId of input.dependencies.blocked_by) {
    const blocks = edges.get(blockerId) ?? new Set<string>();
    blocks.add(input.taskId);
    edges.set(blockerId, blocks);
  }

  return edges;
}

function dependenciesForTask(taskId: string, edges: Map<string, Set<string>>): TaskDependencies {
  const blocks = normalizedUnique([...(edges.get(taskId) ?? [])]);
  const blockedBy: string[] = [];
  for (const [from, to] of edges) {
    if (to.has(taskId)) blockedBy.push(from);
  }
  return { blocks, blocked_by: normalizedUnique(blockedBy) };
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

  setParent: protectedProcedure
    .input(SetParentInputSchema)
    .output(TaskOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const repo = resolveTaskRepository(ctx);
      const task = await findTaskOrNull(repo, ctx.orgId, input.taskId);
      if (!task) return null;

      const parent = input.parentId
        ? await findTaskOrNull(repo, ctx.orgId, input.parentId)
        : null;
      if (input.parentId && !parent) return null;

      await assertParentDoesNotCycle({
        repo,
        orgId: ctx.orgId,
        taskId: task.id,
        parentId: input.parentId,
      });

      const previousParentId = task.parent?.id ?? null;
      task.parent = parent;
      task.updatedAt = new Date();
      repo.getEntityManager().persist(task);
      await emitTaskEvent(ctx, {
        verb: "parent_changed",
        taskId: task.id,
        payload: { previousParentId, parentId: input.parentId },
      });
      await repo.getEntityManager().flush();
      return serializeTask(task);
    }),

  listChildren: protectedProcedure
    .input(TaskRelationIdInputSchema)
    .output(z.array(TaskOutputSchema))
    .query(async ({ ctx, input }) => {
      const repo = resolveTaskRepository(ctx);
      const task = await findTaskOrNull(repo, ctx.orgId, input.taskId);
      if (!task) return [];

      const children = await repo.find(
        { org: ctx.orgId, parent: input.taskId, deletedAt: null } as never,
        { orderBy: { createdAt: "ASC", id: "ASC" } },
      );
      return children.map(serializeTask);
    }),

  setDependencies: protectedProcedure
    .input(SetDependenciesInputSchema)
    .output(TaskOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const repo = resolveTaskRepository(ctx);
      const task = await findTaskOrNull(repo, ctx.orgId, input.taskId);
      if (!task) return null;

      const referencedIds = new Set([
        ...input.dependencies.blocks,
        ...input.dependencies.blocked_by,
      ]);
      referencedIds.delete(task.id);
      if (referencedIds.size !== input.dependencies.blocks.length + input.dependencies.blocked_by.length) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Task dependency cycle rejected.",
        });
      }

      const tasks = await repo.find({ org: ctx.orgId, deletedAt: null } as never);
      const knownIds = new Set(tasks.map((candidate) => candidate.id));
      if ([...referencedIds].some((id) => !knownIds.has(id))) return null;

      const edges = replaceTaskDependencyEdges({
        taskId: task.id,
        tasks,
        dependencies: {
          blocks: normalizedUnique(input.dependencies.blocks),
          blocked_by: normalizedUnique(input.dependencies.blocked_by),
        },
      });
      assertDependencyGraphDoesNotCycle(edges);

      for (const candidate of tasks) {
        const nextDependencies = dependenciesForTask(candidate.id, edges);
        if (
          candidate.dependencies.blocks.join("\0") !== nextDependencies.blocks.join("\0") ||
          candidate.dependencies.blocked_by.join("\0") !== nextDependencies.blocked_by.join("\0")
        ) {
          candidate.dependencies = nextDependencies;
          candidate.updatedAt = new Date();
          repo.getEntityManager().persist(candidate);
        }
      }

      await emitTaskEvent(ctx, {
        verb: "dependency_updated",
        taskId: task.id,
        payload: { dependencies: task.dependencies },
      });
      await repo.getEntityManager().flush();
      return serializeTask(task);
    }),
});

export type TasksRouter = typeof tasksRouter;
