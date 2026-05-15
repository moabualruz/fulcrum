import type { EntityManager } from "typeorm";

import type { AppContext } from "@work-management/domain/work-item.ts";
import type {
  EdgeRow,
  EventRow,
  ScopedWorkItems,
  TaskDetail,
  TaskDetailPayload,
  TaskRelationshipHub,
  SubtaskRow,
  WorkModeId,
  WorkModeSummary,
  WorkView,
  WorkItemLink,
} from "@work-management/application/tasks/task-detail.ts";
import type { TaskStatus } from "@work-management/application/work-item-service-actions.ts";

export type {
  EdgeRow,
  EventRow,
  ScopedWorkItems,
  TaskDetail,
  TaskDetailPayload,
  TaskRelationshipHub,
  SubtaskRow,
  WorkModeId,
  WorkModeSummary,
  WorkView,
  WorkItemLink,
};

export async function getTaskDetail(
  em: EntityManager,
  taskId: string,
  orgId: string,
): Promise<TaskDetailPayload | null> {
  const service = await import("@work-management/application/tasks/task-detail.ts");
  return service.getTaskDetail(em, taskId, orgId);
}

export async function getTaskRelationshipHub(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
): Promise<TaskRelationshipHub> {
  const service = await import("@work-management/application/tasks/task-detail.ts");
  return service.getTaskRelationshipHub(em, ctx, taskId);
}

export async function listScopedWorkItems(
  em: EntityManager,
  ctx: AppContext,
  input: { view?: WorkView } = {},
): Promise<ScopedWorkItems> {
  const service = await import("@work-management/application/tasks/task-detail.ts");
  return service.listScopedWorkItems(em, ctx, input);
}

export async function bulkUpdateStatus(
  em: EntityManager,
  ids: string[],
  status: TaskStatus,
  orgId: string,
): Promise<{ updated: number }> {
  const service = await import("@work-management/application/tasks/task-detail.ts");
  return service.bulkUpdateStatus(em, ids, status, orgId);
}

export async function bulkDeleteTasks(
  em: EntityManager,
  ids: string[],
  orgId: string,
): Promise<{ deleted: number }> {
  const service = await import("@work-management/application/tasks/task-detail.ts");
  return service.bulkDeleteTasks(em, ids, orgId);
}
