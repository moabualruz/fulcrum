import type { EntityManager } from "@mikro-orm/postgresql";

import { Org } from "../../db/entities/auth/Org.ts";
import { AgentRun } from "../../db/entities/orchestration/AgentRun.ts";
import { cancelRunAction, retryRunAction } from "../../services/runs.ts";
import { AppValidationError } from "../errors.ts";
import { serializeRun } from "./queries.ts";
import type { AppContext, DispatchRunInput, RunDto } from "./types.ts";

export async function dispatchRun(em: EntityManager, ctx: AppContext, input: DispatchRunInput): Promise<RunDto> {
  if (!input.agentName?.trim()) throw new AppValidationError("Run agentName is required.");
  return await em.transactional(async (txEm) => {
    const run = txEm.create(AgentRun, {
      org: txEm.getReference(Org, ctx.orgId),
      agentName: input.agentName,
      status: "queued",
      threadId: input.prompt ?? null,
    });
    txEm.persist(run);
    await txEm.flush();
    return serializeRun(run);
  });
}

export async function cancelRun(em: EntityManager, ctx: AppContext, id: string): Promise<{ ok: boolean }> {
  return cancelRunAction(em, id, ctx.orgId);
}

export async function retryRun(em: EntityManager, ctx: AppContext, id: string): Promise<{ id: string }> {
  return retryRunAction(em, id, ctx.orgId);
}
