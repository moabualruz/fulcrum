import type { EntityManager } from "typeorm";

import type {
  ProjectTimelineSprint,
  ProjectTimelineTask,
  TaskRelationshipDto,
} from "@work-management/application/projects/queries.ts";
import type { AppContext } from "@work-management/application/tasks/types.ts";

export type {
  ProjectTimelineSprint,
  ProjectTimelineTask,
  TaskRelationshipDto,
};

export async function loadProjectCalendar(
  em: EntityManager,
  ctx: AppContext,
): Promise<{ projectId: string; project: { id: string }; tasks: ProjectTimelineTask[]; activeSprint: ProjectTimelineSprint | null }> {
  const queries = await import("@work-management/application/projects/queries.ts");
  return queries.loadProjectCalendar(em, ctx);
}

export async function loadProjectGantt(
  em: EntityManager,
  ctx: AppContext,
): Promise<{ projectId: string; project: { id: string }; tasks: ProjectTimelineTask[]; relationships: TaskRelationshipDto[] }> {
  const queries = await import("@work-management/application/projects/queries.ts");
  return queries.loadProjectGantt(em, ctx);
}

export async function rescheduleProjectTask(
  em: EntityManager,
  ctx: AppContext,
  input: { taskId: string; startDate?: string | null; dueDate?: string | null },
): Promise<{ ok: true }> {
  const commands = await import("@work-management/application/projects/commands.ts");
  return commands.rescheduleProjectTask(em, ctx, input);
}
