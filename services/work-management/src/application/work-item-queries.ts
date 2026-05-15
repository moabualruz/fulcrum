import type { EntityManager } from "typeorm";

import { Task } from "@work-management/infrastructure/database/entities/tasks/Task.ts";
import { TaskRepository } from "@work-management/infrastructure/database/repositories/tasks/TaskRepository.ts";
import { tipTapDocToText, type TipTapJson } from "@platform-core/infrastructure/application-database/tasks-rich-text.ts";
import { AppForbiddenError, AppNotFoundError } from "@platform-core/domain/errors.ts";
import type { AppContext, ListTasksInput, TaskDto } from "@work-management/domain/work-item.ts";

export async function listTasks(
  em: EntityManager,
  ctx: AppContext,
  input: ListTasksInput = {},
): Promise<TaskDto[]> {
  const { IsNull } = await import("typeorm");
  const tasks = await em.find(Task, {
    where: {
      org: { id: ctx.orgId },
      ...(input.includeDeleted ? {} : { deletedAt: IsNull() }),
    },
    order: { createdAt: "DESC", id: "ASC" },
  });
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
  const children = await em.find(Task, {
    where: {
      org: { id: ctx.orgId },
      parent: { id: parent.id },
      ...(ctx.projectId ? { projectId: ctx.projectId } : {}),
      deletedAt: null,
    } as never,
    relations: ["parent"],
    order: { createdAt: "ASC", id: "ASC" },
  });
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
  const task = await em.findOne(Task, { where: {
    id: taskId,
    ...(options.includeDeleted ? {} : { deletedAt: null }),
  } as never });
  if (!task) throw new AppNotFoundError(`Task not found: ${taskId}`);
  if (((task.org as any)?.id ?? (task as any).org_id) !== ctx.orgId) {
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
    orgId: (task.org as any)?.id ?? (task as any).org_id ?? "",
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
    taskType: task.taskType ?? "task",
    cycleId: stringCustomField(task.customFields, "cycleId"),
    moduleId: stringCustomField(task.customFields, "moduleId"),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    deletedAt: task.deletedAt,
  };
}

function stringCustomField(fields: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = fields?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
