import type { EntityManager } from "@mikro-orm/postgresql";

import { AgentRun } from "../../db/entities/orchestration/AgentRun.ts";
import { AppForbiddenError, AppNotFoundError } from "../errors.ts";
import type { AppContext, RunDto } from "./types.ts";

export async function listRuns(em: EntityManager, ctx: AppContext): Promise<RunDto[]> {
  const runs = await em.find(AgentRun, { org: ctx.orgId } as never, { orderBy: { createdAt: "DESC", id: "ASC" } });
  return runs.map(serializeRun);
}

export async function getRun(em: EntityManager, ctx: AppContext, id: string): Promise<RunDto> {
  const run = await em.findOne(AgentRun, { id } as never);
  if (!run) throw new AppNotFoundError(`Run not found: ${id}`);
  if (run.org.id !== ctx.orgId) throw new AppForbiddenError(`Run does not belong to org: ${ctx.orgId}`);
  return serializeRun(run);
}

export function serializeRun(run: AgentRun): RunDto {
  return {
    id: run.id,
    orgId: run.org.id,
    agentName: run.agentName ?? null,
    status: run.status ?? null,
    prompt: run.threadId ?? null,
    createdAt: run.createdAt,
  };
}
