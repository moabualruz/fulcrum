import type { EntityManager } from "@mikro-orm/postgresql";

import { Org } from "../../db/entities/auth/Org.ts";
import { AgentRun } from "../../db/entities/orchestration/AgentRun.ts";
import { Task } from "../../db/entities/tasks/Task.ts";
import { cancelRunAction } from "../../services/runs.ts";
import { newUlid } from "../../shared/ids.ts";
import { AppValidationError } from "../errors.ts";
import { appendEventOrm, enqueueJobOrm, ormSqlConnection } from "../orm-helpers.ts";
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
  const conn = ormSqlConnection(em);
  const rows = await conn.execute<Array<{
    id: string;
    org_id: string;
    task_id: string | null;
    agent_name: string | null;
    agent_version: string | null;
    thread_id: string | null;
  }>>(
    `SELECT id, org_id, task_id, agent_name, agent_version, thread_id
       FROM agent_runs WHERE id = $1 AND org_id = $2`,
    [id, ctx.orgId],
  );
  const source = rows[0];
  if (!source) throw new AppValidationError(`Run not found: ${id}`);
  const newId = newUlid();
  await conn.execute(
    `INSERT INTO agent_runs (id, org_id, task_id, agent_name, agent_version, thread_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'queued')`,
    [newId, source.org_id, source.task_id, source.agent_name, source.agent_version, source.thread_id],
  );
  await enqueueJobOrm(em, {
    orgId: source.org_id,
    projectId: ctx.projectId ?? null,
    queue: "agent-runs",
    kind: "agent_run",
    payload: { run_id: newId },
  });
  await appendEventOrm(em, {
    orgId: source.org_id,
    projectId: ctx.projectId ?? null,
    actor: "system",
    subjectKind: "agent_run",
    subjectId: id,
    verb: "retried",
    payload: { parent: id, retry: newId },
  });
  return { id: newId };
}

export async function dispatchTaskRun(
  em: EntityManager,
  ctx: AppContext,
  input: { taskId: string; agent: string; model?: string | null; prompt?: string | null },
): Promise<{ id: string; task_id: string; agent: string; status: string }> {
  if (!input.taskId?.trim()) throw new AppValidationError("Run taskId is required.");
  if (!input.agent?.trim()) throw new AppValidationError("Run agent is required.");
  return await em.transactional(async (txEm) => {
    const run = txEm.create(AgentRun, {
      org: txEm.getReference(Org, ctx.orgId),
      task: txEm.getReference(Task, input.taskId),
      agentName: input.agent,
      agentVersion: input.model ?? null,
      threadId: input.prompt ?? null,
      status: "queued",
    });
    txEm.persist(run);
    await txEm.flush();
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
