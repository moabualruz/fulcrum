import type { EntityManager } from "typeorm";

import type {
  CreateTaskInput,
  TaskStatus,
  UpdateTaskInput,
} from "@work-management/application/work-item-service-actions.ts";

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

type SqlExecutorLike = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T[]>;
};

type TaskActionHandle = EntityManager | { em?: EntityManager } | SqlExecutorLike;

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

export async function moveTaskStatusAction(
  db: TaskActionHandle,
  input: { id: string; from: TaskStatus; to: TaskStatus },
): Promise<{ ok: true }> {
  const service = await import("@work-management/application/work-item-service-actions.ts");
  return service.moveTaskStatusAction(db, input);
}
