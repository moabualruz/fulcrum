import type { EntityManager } from "typeorm";

import type { AppContext } from "@work-management/application/tasks/types.ts";
import type { BoardTaskRow } from "@work-management/application/projects/queries.ts";
import type { SprintListRow } from "@work-management/application/work-cycle-queries.ts";

export type { BoardTaskRow, SprintListRow };

export async function loadProjectSprints(
  em: EntityManager,
  ctx: AppContext,
): Promise<{ sprints: SprintListRow[]; velocity: Array<Record<string, unknown>> }> {
  const queries = await import("@work-management/application/work-cycle-queries.ts");
  return queries.loadProjectSprints(em, ctx);
}

export async function loadProjectSprintDetail(
  em: EntityManager,
  ctx: AppContext,
  sprintId: string,
): Promise<{
  project: { id: string; name: string };
  sprint: { id: string; name: string; goal: string | null; start_date: string; end_date: string; status: string };
  tasks: BoardTaskRow[];
}> {
  const queries = await import("@work-management/application/work-cycle-queries.ts");
  return queries.loadProjectSprintDetail(em, ctx, sprintId);
}

export async function createProjectSprint(
  em: EntityManager,
  ctx: AppContext,
  input: { name: string; goal?: string | null; capacity?: number | null },
): Promise<{ id: string }> {
  const commands = await import("@work-management/application/work-cycle-commands.ts");
  return commands.createProjectSprint(em, ctx, input);
}

export async function startProjectSprint(
  em: EntityManager,
  ctx: AppContext,
  sprintId: string,
): Promise<{ ok: true }> {
  const commands = await import("@work-management/application/work-cycle-commands.ts");
  return commands.startProjectSprint(em, ctx, sprintId);
}

export async function completeProjectSprint(
  em: EntityManager,
  ctx: AppContext,
  sprintId: string,
): Promise<{ id: string; metrics: { velocity: number; completed_tasks: number } }> {
  const commands = await import("@work-management/application/work-cycle-commands.ts");
  return commands.completeProjectSprint(em, ctx, sprintId);
}

export async function updateSprintGoal(
  em: EntityManager,
  ctx: AppContext,
  sprintId: string,
  goal: string,
): Promise<{ ok: true }> {
  const commands = await import("@work-management/application/work-cycle-commands.ts");
  return commands.updateSprintGoal(em, ctx, sprintId, goal);
}

export async function createProjectTask(
  em: EntityManager,
  ctx: AppContext,
  input: { title: string; status?: string | null; sprintId?: string | null },
): Promise<{ id: string }> {
  const commands = await import("@work-management/application/projects/commands.ts");
  return commands.createProjectTask(em, ctx, input);
}

export async function updateProjectTask(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
  patch: { title?: string; status?: string | null; priority?: number | null; description?: string | null },
): Promise<{ ok: true }> {
  const commands = await import("@work-management/application/projects/commands.ts");
  return commands.updateProjectTask(em, ctx, taskId, patch);
}
