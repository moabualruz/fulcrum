import type { EntityManager } from "@mikro-orm/postgresql";

import { Sprint } from "../../db/entities/tasks/Sprint.ts";
import { AppForbiddenError, AppNotFoundError } from "../errors.ts";
import type { AppContext, SprintDto } from "./types.ts";

export async function listSprints(em: EntityManager, ctx: AppContext): Promise<SprintDto[]> {
  const sprints = await em.find(Sprint, { org: ctx.orgId } as never, { orderBy: { startDate: "ASC", id: "ASC" } });
  return sprints.map(serializeSprint);
}

export async function getSprint(em: EntityManager, ctx: AppContext, id: string): Promise<SprintDto> {
  const sprint = await em.findOne(Sprint, { id } as never);
  if (!sprint) throw new AppNotFoundError(`Sprint not found: ${id}`);
  if (sprint.org.id !== ctx.orgId) throw new AppForbiddenError(`Sprint does not belong to org: ${ctx.orgId}`);
  return serializeSprint(sprint);
}

export function serializeSprint(sprint: Sprint): SprintDto {
  return {
    id: sprint.id,
    orgId: sprint.org.id,
    projectId: sprint.projectId,
    name: sprint.name,
    status: sprint.status,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
  };
}
