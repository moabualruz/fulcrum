import type { EntityManager } from "typeorm";

import type { AppContext } from "@work-management/domain/work-item.ts";
import type { BoardTaskRow } from "@work-management/application/projects/queries.ts";
import type {
  ManualTaskWorkbenchInput,
  ManualTaskWorkbenchOutput,
  ManualTaskWorkbenchViewMode,
} from "@work-management/application/manual-task-workbench.ts";

export type TaskStateGroup = "backlog" | "unstarted" | "started" | "completed" | "cancelled";

export const TASK_STATE_GROUP_ORDER: readonly TaskStateGroup[] = [
  "backlog",
  "unstarted",
  "started",
  "completed",
  "cancelled",
] as const;

export type {
  BoardTaskRow,
  ManualTaskWorkbenchInput,
  ManualTaskWorkbenchOutput,
  ManualTaskWorkbenchViewMode,
};

export async function listProjectBoardWorkItems(
  em: EntityManager,
  ctx: AppContext,
): Promise<BoardTaskRow[]> {
  const service = await import("@work-management/application/projects/queries.ts");
  return service.listProjectBoardTasks(em, ctx);
}

export async function buildProjectTaskWorkbench(
  em: EntityManager,
  ctx: AppContext,
  input: ManualTaskWorkbenchInput,
): Promise<ManualTaskWorkbenchOutput> {
  const service = await import("@work-management/application/manual-task-workbench.ts");
  return service.buildManualTaskWorkbench(em, ctx, input);
}

export async function createProjectBoardWorkItem(
  em: EntityManager,
  ctx: AppContext,
  input: { title: string; status?: string | null; sprintId?: string | null },
): Promise<{ id: string }> {
  const service = await import("@work-management/application/projects/commands.ts");
  return service.createProjectTask(em, ctx, input);
}

export async function updateProjectBoardWorkItem(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
  patch: { title?: string; status?: string | null; priority?: number | null; description?: string | null },
): Promise<{ ok: true }> {
  const service = await import("@work-management/application/projects/commands.ts");
  return service.updateProjectTask(em, ctx, taskId, patch);
}

export async function deleteProjectBoardWorkItem(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
): Promise<{ ok: true }> {
  const service = await import("@work-management/application/projects/commands.ts");
  return service.deleteProjectTask(em, ctx, taskId);
}
