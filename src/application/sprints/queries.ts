import type { EntityManager } from "@mikro-orm/postgresql";

import { SprintService } from "../../services/SprintService.ts";
import type { AppContext, ListSprintsInput, SprintDto } from "./types.ts";

export async function listSprints(em: EntityManager, ctx: AppContext, input?: ListSprintsInput): Promise<SprintDto[]> {
  return new SprintService(em).list(ctx.orgId, input);
}

export async function getSprint(em: EntityManager, ctx: AppContext, id: string): Promise<SprintDto | null> {
  return new SprintService(em).get(ctx.orgId, id);
}

export async function getCapacityPreview(
  em: EntityManager,
  ctx: AppContext,
  sprintId: string,
): Promise<{ assigned: number; capacity: number | null; percentage: number | null }> {
  return new SprintService(em).getCapacityPreview(ctx.orgId, sprintId);
}
