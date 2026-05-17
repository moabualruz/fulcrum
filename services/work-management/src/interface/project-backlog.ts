import type { EntityManager } from "typeorm";

import type { BacklogTaskRow, SprintListRow } from "@work-management/application/work-cycle-queries.ts";
import type { AppContext } from "@work-management/domain/work-cycle.ts";

export type { BacklogTaskRow, SprintListRow };

export async function loadProjectBacklog(
  em: EntityManager,
  ctx: AppContext,
): Promise<{ project: { id: string; name: string }; sprints: SprintListRow[]; backlogTasks: BacklogTaskRow[] }> {
  const queries = await import("@work-management/application/work-cycle-queries.ts");
  return queries.loadProjectBacklog(em, ctx);
}

export async function addTaskToSprint(
  em: EntityManager,
  ctx: AppContext,
  sprintId: string,
  taskId: string,
): Promise<{ moved: true }> {
  const commands = await import("@work-management/application/work-cycle-commands.ts");
  return commands.addTaskToSprint(em, ctx, sprintId, taskId);
}

export async function removeTaskFromSprint(
  em: EntityManager,
  ctx: AppContext,
  sprintId: string,
  taskId: string,
): Promise<{ moved: true }> {
  const commands = await import("@work-management/application/work-cycle-commands.ts");
  return commands.removeTaskFromSprint(em, ctx, sprintId, taskId);
}
