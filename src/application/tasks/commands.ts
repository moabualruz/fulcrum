import type { EntityManager } from "@mikro-orm/postgresql";

import { Event } from "../../db/entities/core/Event.ts";
import { Org } from "../../db/entities/auth/Org.ts";
import { Task } from "../../db/entities/tasks/Task.ts";
import type { TaskDependencies } from "../../db/entities/tasks/schemas.ts";
import { TaskRepository } from "../../db/repositories/tasks/TaskRepository.ts";
import { AppConflictError, AppNotFoundError, AppValidationError } from "../errors.ts";
import { CreateTaskInputSchema, UpdateTaskInputSchema } from "./schema.ts";
import { findVisibleTask, serializeTask } from "./queries.ts";
import type { AppContext, BulkTaskPatch, CreateTaskInput, TaskDto, UpdateTaskInput } from "./types.ts";

export async function createTask(
  em: EntityManager,
  ctx: AppContext,
  input: CreateTaskInput,
): Promise<TaskDto> {
  const parsed = parseOrThrow(CreateTaskInputSchema, input);
  return await em.transactional(async (txEm) => {
    const repo = txEm.getRepository(Task) as TaskRepository;
    const parent = parsed.parentId ? await findVisibleTask(txEm, ctx, parsed.parentId) : null;
    const projectId = parsed.projectId ?? ctx.projectId ?? null;
    assertProjectCompatible(projectId, parent);
    assertAllowedParent(parsed.taskType ?? "task", parent?.taskType ?? null);
    const task = repo.create({
      orgId: ctx.orgId,
      title: parsed.title,
      description: parsed.description,
      descriptionText: parsed.descriptionText,
      tiptapContent: parsed.tiptapContent,
      status: parsed.status,
      priority: parsed.priority,
      points: parsed.points,
    });
    task.assigneeId = parsed.assigneeId ?? null;
    task.projectId = projectId;
    task.parent = parent;
    task.taskType = parsed.taskType ?? "task";
    task.customFields = withWorkGrouping(task.customFields, parsed);
    txEm.persist(task);
    await txEm.flush();
    return serializeTask(task);
  });
}

export async function updateTask(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
  input: UpdateTaskInput,
): Promise<TaskDto> {
  const parsed = parseOrThrow(UpdateTaskInputSchema.omit({ id: true }), input);
  return await em.transactional(async (txEm) => {
    const task = await findVisibleTask(txEm, ctx, taskId);
    applyTaskPatch(task, parsed);
    txEm.persist(task);
    await txEm.flush();
    return serializeTask(task);
  });
}

export async function deleteTask(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
): Promise<TaskDto> {
  return await em.transactional(async (txEm) => {
    const task = await findVisibleTask(txEm, ctx, taskId);
    task.deletedAt = new Date();
    task.updatedAt = task.deletedAt;
    txEm.persist(task);
    await txEm.flush();
    return serializeTask(task);
  });
}

export async function bulkUpdate(
  em: EntityManager,
  ctx: AppContext,
  ids: string[],
  patch: BulkTaskPatch,
): Promise<{ updated: number }> {
  if (ids.length > 200) {
    throw new AppValidationError("Bulk operations are limited to 200 tasks at a time.");
  }
  return await em.transactional(async (txEm) => {
    const tasks = await findBulkTasksOrThrow(txEm, ctx, ids);
    for (const task of tasks) {
      applyBulkPatch(task, patch);
      txEm.persist(task);
      emitTaskEvent(txEm, ctx, {
        verb: "bulk_updated",
        taskId: task.id,
        payload: { patch },
      });
    }
    await txEm.flush();
    return { updated: ids.length };
  });
}

export async function bulkDelete(
  em: EntityManager,
  ctx: AppContext,
  ids: string[],
): Promise<{ deleted: number }> {
  if (ids.length > 200) {
    throw new AppValidationError("Bulk operations are limited to 200 tasks at a time.");
  }
  return await em.transactional(async (txEm) => {
    const tasks = await findBulkTasksOrThrow(txEm, ctx, ids);
    const deletedAt = new Date();
    for (const task of tasks) {
      task.deletedAt = deletedAt;
      task.updatedAt = deletedAt;
      txEm.persist(task);
      emitTaskEvent(txEm, ctx, {
        verb: "bulk_deleted",
        taskId: task.id,
        payload: { deletedAt },
      });
    }
    await txEm.flush();
    return { deleted: ids.length };
  });
}

export async function setParent(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
  parentId: string | null,
): Promise<TaskDto> {
  return await em.transactional(async (txEm) => {
    const task = await findVisibleTask(txEm, ctx, taskId);
    const parent = parentId ? await findVisibleTask(txEm, ctx, parentId) : null;
    await assertParentDoesNotCycle(txEm, ctx, task.id, parentId);
    assertProjectCompatible(task.projectId ?? null, parent);
    assertAllowedParent(task.taskType ?? "task", parent?.taskType ?? null);
    const previousParentId = task.parent?.id ?? null;
    task.parent = parent;
    task.updatedAt = new Date();
    txEm.persist(task);
    emitTaskEvent(txEm, ctx, {
      verb: "parent_changed",
      taskId: task.id,
      payload: { previousParentId, parentId },
    });
    await txEm.flush();
    return serializeTask(task);
  });
}

export async function setDependencies(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
  dependencies: TaskDependencies,
): Promise<TaskDto> {
  return await em.transactional(async (txEm) => {
    const task = await findVisibleTask(txEm, ctx, taskId);
    const referencedIds = new Set([...dependencies.blocks, ...dependencies.blocked_by]);
    referencedIds.delete(task.id);
    if (referencedIds.size !== dependencies.blocks.length + dependencies.blocked_by.length) {
      throw new AppConflictError("Task dependency cycle rejected.");
    }

    const tasks = await txEm.find(Task, {
      org: ctx.orgId,
      ...(ctx.projectId ? { projectId: ctx.projectId } : {}),
      deletedAt: null,
    } as never);
    const knownIds = new Set(tasks.map((candidate) => candidate.id));
    if ([...referencedIds].some((id) => !knownIds.has(id))) {
      throw new AppNotFoundError("One or more tasks were not found.");
    }

    const normalizedDeps: TaskDependencies = {
      blocks: normalizedUnique(dependencies.blocks),
      blocked_by: normalizedUnique(dependencies.blocked_by),
    };
    const proposedEdges = proposedTaskDependencyEdges({ taskId: task.id, tasks, dependencies: normalizedDeps });
    assertDependencyGraphDoesNotCycle(proposedEdges);
    const edges = replaceTaskDependencyEdges({ taskId: task.id, tasks, dependencies: normalizedDeps });

    for (const candidate of tasks) {
      const nextDependencies = dependenciesForTask(candidate.id, edges);
      if (
        candidate.dependencies.blocks.join("\0") !== nextDependencies.blocks.join("\0") ||
        candidate.dependencies.blocked_by.join("\0") !== nextDependencies.blocked_by.join("\0")
      ) {
        candidate.dependencies = nextDependencies;
        candidate.updatedAt = new Date();
        txEm.persist(candidate);
      }
    }

    emitTaskEvent(txEm, ctx, {
      verb: "dependency_updated",
      taskId: task.id,
      payload: { dependencies: task.dependencies },
    });
    await txEm.flush();
    return serializeTask(task);
  });
}

export function normalizedUnique(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

function parseOrThrow<T>(schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: { flatten: () => { fieldErrors: Record<string, string[]> } } } }, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new AppValidationError("Task input validation failed.", {
    fieldErrors: result.error.flatten().fieldErrors,
  });
}

function applyTaskPatch(task: Task, patch: UpdateTaskInput): void {
  if (patch.title !== undefined) task.title = patch.title;
  if (patch.description !== undefined) task.description = patch.description;
  if (patch.descriptionText !== undefined) {
    task.tiptapContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: patch.descriptionText }] }],
    };
  }
  if (patch.tiptapContent !== undefined) task.tiptapContent = patch.tiptapContent;
  if (patch.status !== undefined) task.status = patch.status;
  if (patch.priority !== undefined) task.priority = patch.priority;
  if (patch.points !== undefined) task.points = patch.points;
  if (patch.assigneeId !== undefined) task.assigneeId = patch.assigneeId;
  if (patch.projectId !== undefined) task.projectId = patch.projectId;
  if (patch.taskType !== undefined) task.taskType = patch.taskType;
  if (patch.cycleId !== undefined || patch.moduleId !== undefined) {
    task.customFields = withWorkGrouping(task.customFields, patch);
  }
  task.updatedAt = new Date();
}

const ALLOWED_PARENT_TYPES: Record<string, readonly string[]> = {
  initiative: [],
  epic: ["initiative"],
  story: ["epic", "initiative"],
  task: ["epic", "story", "initiative"],
  bug: ["epic", "story", "task"],
  chore: ["epic", "story", "task"],
  subtask: ["story", "task", "bug", "chore"],
};

function assertAllowedParent(childType: string, parentType: string | null): void {
  if (!parentType) return;
  const allowed = ALLOWED_PARENT_TYPES[childType] ?? ["initiative", "epic", "story", "task", "bug", "chore"];
  if (!allowed.includes(parentType)) {
    throw new AppValidationError(`Work item type '${childType}' cannot be parented by '${parentType}'.`);
  }
}

function assertProjectCompatible(projectId: string | null, parent: Task | null): void {
  if (!parent) return;
  const parentProjectId = parent.projectId ?? null;
  if (projectId !== parentProjectId) {
    throw new AppConflictError("Work item parent must belong to the same project unless an explicit relation is used.");
  }
}

function withWorkGrouping(
  existing: Record<string, unknown> | null | undefined,
  patch: { cycleId?: string | null; moduleId?: string | null },
): Record<string, unknown> {
  const next = { ...(existing ?? {}) };
  if (patch.cycleId !== undefined) {
    if (patch.cycleId === null) delete next["cycleId"];
    else next["cycleId"] = patch.cycleId;
  }
  if (patch.moduleId !== undefined) {
    if (patch.moduleId === null) delete next["moduleId"];
    else next["moduleId"] = patch.moduleId;
  }
  return next;
}

function applyBulkPatch(task: Task, patch: BulkTaskPatch): void {
  applyTaskPatch(task, patch);
  if (patch.sprintId !== undefined) task.sprint = patch.sprintId;
  if (patch.assignee !== undefined || patch.label !== undefined) {
    const customFields = { ...task.customFields };
    if (patch.assignee !== undefined) {
      if (patch.assignee === null) delete customFields.assignee;
      else customFields.assignee = patch.assignee;
    }
    if (patch.label !== undefined) {
      if (patch.label === null) delete customFields.label;
      else customFields.label = patch.label;
    }
    task.customFields = customFields;
  }
}

async function findBulkTasksOrThrow(em: EntityManager, ctx: AppContext, ids: string[]): Promise<Task[]> {
  const tasks = await em.find(Task, {
    org: ctx.orgId,
    ...(ctx.projectId ? { projectId: ctx.projectId } : {}),
    id: { $in: ids },
    deletedAt: null,
  } as never);
  if (tasks.length !== ids.length) {
    throw new AppNotFoundError("One or more tasks were not found.");
  }
  return tasks;
}

async function assertParentDoesNotCycle(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
  parentId: string | null,
): Promise<void> {
  let cursor = parentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === taskId || seen.has(cursor)) {
      throw new AppConflictError("Task parent cycle rejected.");
    }
    seen.add(cursor);
    const parent = await findVisibleTask(em, ctx, cursor);
    cursor = parent.parent?.id ?? null;
  }
}

function assertDependencyGraphDoesNotCycle(edges: Map<string, Set<string>>): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string): void {
    if (visiting.has(id)) {
      throw new AppConflictError("Task dependency cycle rejected.");
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
    const blocks = new Set(task.dependencies.blocks);
    blocks.delete(input.taskId);
    edges.set(task.id, blocks);
  }
  edges.set(input.taskId, new Set(input.dependencies.blocks));
  for (const blockerId of input.dependencies.blocked_by) {
    const blocks = edges.get(blockerId) ?? new Set<string>();
    blocks.add(input.taskId);
    edges.set(blockerId, blocks);
  }
  return edges;
}

function proposedTaskDependencyEdges(input: {
  taskId: string;
  tasks: Task[];
  dependencies: TaskDependencies;
}): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>();
  for (const task of input.tasks) {
    edges.set(task.id, new Set(task.dependencies.blocks));
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

function emitTaskEvent(
  em: EntityManager,
  ctx: AppContext,
  input: {
    verb: "parent_changed" | "dependency_updated" | "bulk_updated" | "bulk_deleted";
    taskId: string;
    payload: Record<string, unknown>;
  },
): void {
  const event = em.create(Event, {
    org: em.getReference(Org, ctx.orgId),
    verb: input.verb,
    subjectKind: "task",
    subjectId: input.taskId,
    payload: input.payload,
    createdAt: new Date(),
  });
  em.persist(event);
}
