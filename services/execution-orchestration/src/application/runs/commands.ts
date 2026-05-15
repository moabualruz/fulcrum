import type { EntityManager } from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { AgentRun } from "@execution-orchestration/infrastructure/database/entities/orchestration/AgentRun.ts";
import { Task } from "@work-management/infrastructure/database/entities/tasks/Task.ts";
import { cancelRunAction, retryRunAction } from "@execution-orchestration/application/agent-run-service-actions.ts";
import { AppValidationError } from "@platform-core/domain/errors.ts";
import { appendEventOrm, enqueueJobOrm } from "@platform-core/application/orm-helpers.ts";
import { serializeRun } from "@execution-orchestration/application/runs/queries.ts";
import type { AppContext, DispatchRunInput, RunDto } from "@execution-orchestration/application/runs/types.ts";

export async function dispatchRun(em: EntityManager, ctx: AppContext, input: DispatchRunInput): Promise<RunDto> {
  if (!input.agentName?.trim()) throw new AppValidationError("Run agentName is required.");
  return await em.transaction(async (txEm: import("typeorm").EntityManager) => {
    const run = txEm.create(AgentRun, {
      org: { id: ctx.orgId } as Org,
      agentName: input.agentName,
      status: "queued",
      threadId: input.prompt ?? null,
    } as never);
    await txEm.save(run);
    return serializeRun(run);
  });
}

export async function cancelRun(em: EntityManager, ctx: AppContext, id: string): Promise<{ ok: boolean }> {
  return cancelRunAction(em, id, ctx.orgId);
}

export async function retryRun(em: EntityManager, ctx: AppContext, id: string): Promise<{ id: string }> {
  try {
    return await retryRunAction(em, id, ctx.orgId);
  } catch (error) {
    if (error instanceof Error && /run not found/i.test(error.message)) {
      throw new AppValidationError(`Run not found: ${id}`);
    }
    throw error;
  }
}

export async function dispatchTaskRun(
  em: EntityManager,
  ctx: AppContext,
  input: { taskId: string; agent: string; model?: string | null; prompt?: string | null },
): Promise<{ id: string; task_id: string; agent: string; status: string }> {
  if (!input.taskId?.trim()) throw new AppValidationError("Run taskId is required.");
  if (!input.agent?.trim()) throw new AppValidationError("Run agent is required.");
  return await em.transaction(async (txEm: import("typeorm").EntityManager) => {
    const run = txEm.create(AgentRun, {
      org: { id: ctx.orgId } as Org,
      task: { id: input.taskId } as Task,
      agentName: input.agent,
      agentVersion: input.model ?? null,
      threadId: input.prompt ?? null,
      status: "queued",
    } as never);
    await txEm.save(run);
    await enqueueJobOrm(txEm, {
      orgId: ctx.orgId,
      projectId: ctx.projectId ?? null,
      queue: "agent-runs",
      kind: "agent_run",
      payload: { run_id: run.id },
    });
    await appendEventOrm(txEm, {
      orgId: ctx.orgId,
      projectId: ctx.projectId ?? null,
      actor: "system",
      subjectKind: "agent_run",
      subjectId: run.id,
      verb: "dispatched",
      payload: { task_id: input.taskId, agent: input.agent },
    });
    return { id: run.id, task_id: input.taskId, agent: input.agent, status: "queued" };
  });
}
