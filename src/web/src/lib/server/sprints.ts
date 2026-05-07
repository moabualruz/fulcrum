import type { SqlExecutor } from "../../../../db/sql.ts";
import {
  createSprint,
  listSprints,
  updateSprint,
  closeSprint,
  addTaskToSprint,
  removeTaskFromSprint,
  listBacklogTasks,
  listSprintTasks,
  sprintCapacityUsed,
  type SprintRow,
  type TaskRow,
  type MetricsSnapshot,
} from "../../../../application/legacy/web-runtime.ts";

export type SprintStatus = "planning" | "active" | "completed" | "cancelled";

export const SPRINT_STATUSES: readonly SprintStatus[] = [
  "planning", "active", "completed", "cancelled",
] as const;

export interface CreateSprintInput {
  orgId: string;
  projectId: string;
  name: string;
  goal?: string | null;
  capacityPoints?: number | null;
  startDate?: string | null;
  endDate?: string | null;
}

export async function createSprintAction(
  db: SqlExecutor,
  input: CreateSprintInput,
): Promise<{ id: string }> {
  const sprint = await createSprint(db, input);
  return { id: sprint.id };
}

export async function listSprintsAction(
  db: SqlExecutor,
  projectId: string,
): Promise<SprintRow[]> {
  return listSprints(db, projectId);
}

export async function addTaskToSprintAction(
  db: SqlExecutor,
  input: { sprintId: string; taskId: string },
): Promise<{ ok: true }> {
  return addTaskToSprint(db, input);
}

export async function removeTaskFromSprintAction(
  db: SqlExecutor,
  input: { sprintId: string; taskId: string },
): Promise<{ ok: true }> {
  return removeTaskFromSprint(db, input);
}

export async function listBacklogTasksAction(
  db: SqlExecutor,
  projectId: string,
): Promise<TaskRow[]> {
  return listBacklogTasks(db, projectId);
}

export async function listSprintTasksAction(
  db: SqlExecutor,
  sprintId: string,
): Promise<TaskRow[]> {
  return listSprintTasks(db, sprintId);
}

export async function startSprintAction(
  db: SqlExecutor,
  sprintId: string,
): Promise<{ id: string }> {
  const sprint = await updateSprint(db, { id: sprintId, status: "active" });
  return { id: sprint.id };
}

export async function completeSprintAction(
  db: SqlExecutor,
  sprintId: string,
): Promise<{ id: string; metrics: MetricsSnapshot }> {
  const { sprint, metrics } = await closeSprint(db, sprintId);
  return { id: sprint.id, metrics };
}

export interface CapacityInfo {
  used: number;
  capacity: number | null;
  percent: number | null;
  overCapacity: boolean;
}

export async function getSprintCapacity(
  db: SqlExecutor,
  sprintId: string,
  capacityPoints: number | null,
): Promise<CapacityInfo> {
  const used = await sprintCapacityUsed(db, sprintId);
  const percent = capacityPoints != null && capacityPoints > 0
    ? Math.round((used / capacityPoints) * 100)
    : null;
  return {
    used,
    capacity: capacityPoints,
    percent,
    overCapacity: capacityPoints != null && used > capacityPoints,
  };
}
