import type { EntityManager } from "typeorm";
import type { SqlExecutor } from "@platform-core/infrastructure/application-database/sql.ts";

import type {
  CreateTaskInput,
  TaskStatus,
  UpdateTaskInput,
} from "@work-management/application/work-item-service-actions.ts";
import type { AppContext, BulkTaskPatch, TaskDto } from "@work-management/domain/work-item.ts";

export type {
  CreateTaskInput,
  TaskStatus,
  UpdateTaskInput,
};

export const TASK_STATUSES: readonly TaskStatus[] = [
  "pending",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
] as const;

type TaskActionHandle = EntityManager | { em?: EntityManager } | SqlExecutor;

export async function createTaskAction(
  db: TaskActionHandle,
  input: CreateTaskInput,
): Promise<{ id: string }> {
  const service = await import("@work-management/application/work-item-service-actions.ts");
  return service.createTaskAction(db, input);
}

export async function updateTaskAction(
  db: TaskActionHandle,
  input: UpdateTaskInput,
): Promise<{ ok: true }> {
  const service = await import("@work-management/application/work-item-service-actions.ts");
  return service.updateTaskAction(db, input);
}

export async function deleteTaskAction(db: TaskActionHandle, id: string): Promise<{ ok: true }> {
  const service = await import("@work-management/application/work-item-service-actions.ts");
  return service.deleteTaskAction(db, id);
}

export async function updateWorkItem(
  em: EntityManager,
  ctx: AppContext,
  id: string,
  input: {
    expectedStatus?: TaskStatus;
    title?: string;
    status?: TaskStatus;
    priority?: number;
    description?: string | null;
  },
): Promise<TaskDto> {
  const service = await import("@work-management/application/tasks/commands.ts");
  return service.updateTask(em, ctx, id, input);
}

export async function deleteWorkItem(
  em: EntityManager,
  ctx: AppContext,
  id: string,
): Promise<TaskDto> {
  const service = await import("@work-management/application/tasks/commands.ts");
  return service.deleteTask(em, ctx, id);
}

export async function createWorkItem(
  em: EntityManager,
  ctx: AppContext,
  input: {
    title: string;
    status?: TaskStatus;
    projectId?: string | null;
  },
): Promise<TaskDto> {
  const service = await import("@work-management/application/tasks/commands.ts");
  return service.createTask(em, ctx, input);
}

export async function bulkUpdateWorkItems(
  em: EntityManager,
  ctx: AppContext,
  ids: string[],
  patch: BulkTaskPatch,
): Promise<{ updated: number }> {
  const service = await import("@work-management/application/tasks/commands.ts");
  return service.bulkUpdate(em, ctx, ids, patch);
}

export async function bulkDeleteWorkItems(
  em: EntityManager,
  ctx: AppContext,
  ids: string[],
): Promise<{ deleted: number }> {
  const service = await import("@work-management/application/tasks/commands.ts");
  return service.bulkDelete(em, ctx, ids);
}

export async function moveTaskStatusAction(
  db: TaskActionHandle,
  input: { id: string; from: TaskStatus; to: TaskStatus },
): Promise<{ ok: true }> {
  const service = await import("@work-management/application/work-item-service-actions.ts");
  return service.moveTaskStatusAction(db, input);
}
