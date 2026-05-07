import type { EntityManager } from "@mikro-orm/postgresql";

import { Task } from "../../db/entities/tasks/Task.ts";
import { TaskRepository } from "../../db/repositories/tasks/TaskRepository.ts";
import { tipTapDocToText, type TipTapJson } from "../../db/tasks-rich-text.ts";
import { AppForbiddenError, AppNotFoundError } from "../errors.ts";
import type { AppContext, ListTasksInput, TaskDto } from "./types.ts";

export async function listTasks(
  em: EntityManager,
  ctx: AppContext,
  input: ListTasksInput = {},
): Promise<TaskDto[]> {
  const repo = em.getRepository(Task) as TaskRepository;
  const tasks = await repo.list({ orgId: ctx.orgId, includeDeleted: input.includeDeleted });
  const scopedTasks = ctx.projectId
    ? tasks.filter((task) => task.projectId === ctx.projectId)
    : tasks;
  return scopedTasks.map(serializeTask);
}

export async function getTask(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
): Promise<TaskDto> {
  return serializeTask(await findVisibleTask(em, ctx, taskId));
}

export async function listChildren(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
): Promise<TaskDto[]> {
  const parent = await findVisibleTask(em, ctx, taskId);
  const repo = em.getRepository(Task) as TaskRepository;
  const children = await repo.find(
    {
      org: ctx.orgId,
      parent: parent.id,
      ...(ctx.projectId ? { projectId: ctx.projectId } : {}),
      deletedAt: null,
    } as never,
    { orderBy: { createdAt: "ASC", id: "ASC" } },
  );
  return children.map(serializeTask);
}

export interface TaskOption {
  id: string;
  project_id: string | null;
  title: string;
}

export async function listOpenTaskOptions(em: EntityManager, ctx: AppContext): Promise<TaskOption[]> {
  const tasks = await listTasks(em, ctx, {});
  return tasks
    .filter((task) => ["pending", "in_progress", "blocked"].includes(task.status ?? ""))
    .map((task) => ({ id: task.id, project_id: task.projectId, title: task.title }));
}

export interface BoardTaskRow {
  id: string;
  title: string;
  status: string;
  priority: number;
  project_id: string | null;
  updated_at: string;
}

export async function listBoardTaskRows(em: EntityManager, ctx: AppContext): Promise<BoardTaskRow[]> {
  const tasks = await listTasks(em, ctx, {});
  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status ?? "pending",
    priority: task.priority ?? 0,
    project_id: task.projectId,
    updated_at: task.updatedAt.toISOString(),
  }));
}

export async function findVisibleTask(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Task> {
  const task = await em.findOne(Task, {
    id: taskId,
    ...(options.includeDeleted ? {} : { deletedAt: null }),
  } as never);
  if (!task) throw new AppNotFoundError(`Task not found: ${taskId}`);
  if (task.org.id !== ctx.orgId) {
    throw new AppForbiddenError(`Task does not belong to org: ${ctx.orgId}`);
  }
  if (ctx.projectId && task.projectId !== ctx.projectId) {
    throw new AppNotFoundError(`Task not found: ${taskId}`);
  }
  return task;
}

export function serializeTask(task: Task): TaskDto {
  return {
    id: task.id,
    orgId: task.org.id,
    projectId: task.projectId ?? null,
    title: task.title,
    description: task.description,
    descriptionText: tipTapDocToText(task.tiptapContent as TipTapJson),
    tiptapContent: task.tiptapContent as TipTapJson,
    status: task.status,
    priority: task.priority,
    points: task.points ?? null,
    assigneeId: task.assigneeId ?? null,
    labels: task.labels ?? [],
    parentId: task.parent?.id ?? null,
    dependencies: task.dependencies ?? { blocks: [], blocked_by: [] },
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    deletedAt: task.deletedAt,
  };
}
