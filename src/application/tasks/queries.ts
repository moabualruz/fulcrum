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
  return tasks.map(serializeTask);
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
    { org: ctx.orgId, parent: parent.id, deletedAt: null } as never,
    { orderBy: { createdAt: "ASC", id: "ASC" } },
  );
  return children.map(serializeTask);
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
    dependencies: task.dependencies,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    deletedAt: task.deletedAt,
  };
}
