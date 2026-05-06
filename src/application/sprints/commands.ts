import type { EntityManager } from "@mikro-orm/postgresql";

import { Org } from "../../db/entities/auth/Org.ts";
import { Sprint, SprintStatus } from "../../db/entities/tasks/Sprint.ts";
import { AppValidationError } from "../errors.ts";
import { serializeSprint } from "./queries.ts";
import type { AppContext, CreateSprintInput, SprintDto } from "./types.ts";

export async function createSprint(em: EntityManager, ctx: AppContext, input: CreateSprintInput): Promise<SprintDto> {
  if (!input.name?.trim()) throw new AppValidationError("Sprint name is required.");
  if (!input.projectId) throw new AppValidationError("Sprint projectId is required.");
  if (input.startDate >= input.endDate) throw new AppValidationError("Sprint startDate must be before endDate.");
  return await em.transactional(async (txEm) => {
    const sprint = txEm.create(Sprint, {
      org: txEm.getReference(Org, ctx.orgId),
      projectId: input.projectId,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      status: SprintStatus.planned,
    });
    txEm.persist(sprint);
    await txEm.flush();
    return serializeSprint(sprint);
  });
}
