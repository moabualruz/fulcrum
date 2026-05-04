/**
 * Runs (agent dispatch) — migrated from raw ProductDb to MikroORM EntityManager.
 * ARCH-01/ARCH-02: All DB access via MikroORM EM connection.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import { eventDispatcher } from "../../../../product-kernel/event-dispatcher.ts";
import { enqueueJobOrm } from "./orm-helpers.ts";

export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface DispatchRunInput {
  orgId: string;
  projectId?: string | null;
  taskId: string;
  agent: string;
  model?: string | null;
  prompt?: string | null;
}

interface RunScopeRow {
  org_id: string;
  project_id: string | null;
}

interface RunSourceRow {
  id: string;
  org_id: string;
  project_id: string | null;
  agent: string;
  model: string | null;
  prompt: string | null;
}

export async function dispatchRunAction(
  em: EntityManager,
  input: DispatchRunInput,
): Promise<{ id: string; task_id: string; agent: string; status: RunStatus }> {
  const id = randomUUID();
  const conn = em.getConnection();
  await conn.execute(
    `INSERT INTO agent_runs
       (id, org_id, project_id, task_id, agent, model, prompt, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued')`,
    [
      id,
      input.orgId,
      input.projectId ?? null,
      input.taskId,
      input.agent,
      input.model ?? null,
      input.prompt ?? null,
    ],
  );

  await enqueueJobOrm(em, {
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    queue: "agent-runs",
    kind: "agent_run",
    payload: { run_id: id },
  });

  await eventDispatcher.dispatch(em, {
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    actor: "system",
    subjectKind: "agent_run",
    subjectId: id,
    verb: "dispatched",
    payload: { task_id: input.taskId, agent: input.agent },
  });

  return { id, task_id: input.taskId, agent: input.agent, status: "queued" };
}

export async function cancelRunAction(
  em: EntityManager,
  id: string,
  orgId: string,
): Promise<{ ok: boolean }> {
  const conn = em.getConnection();
  const rows = await conn.execute<RunScopeRow[]>(
    `UPDATE agent_runs
        SET status = 'cancelled', ended_at = now()
      WHERE id = $1 AND org_id = $2 AND status IN ('queued', 'running')
      RETURNING org_id, project_id`,
    [id, orgId],
  );
  const row = rows[0];
  if (row) {
    await eventDispatcher.dispatch(em, {
      orgId: row.org_id,
      projectId: row.project_id,
      actor: "system",
      subjectKind: "agent_run",
      subjectId: id,
      verb: "cancelled",
    });
  }
  return { ok: true };
}

export async function retryRunAction(
  em: EntityManager,
  id: string,
  orgId: string,
): Promise<{ id: string }> {
  const conn = em.getConnection();
  const sourceRows = await conn.execute<RunSourceRow[]>(
    `SELECT id, org_id, project_id, agent, model, prompt
       FROM agent_runs WHERE id = $1 AND org_id = $2`,
    [id, orgId],
  );
  const source = sourceRows[0];
  if (!source) throw new Error(`retryRunAction: run not found: ${id}`);

  const newId = randomUUID();
  await conn.execute(
    `INSERT INTO agent_runs
       (id, org_id, project_id, agent, model, prompt, status, parent_run_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7)`,
    [
      newId,
      source.org_id,
      source.project_id,
      source.agent,
      source.model,
      source.prompt,
      id,
    ],
  );

  await enqueueJobOrm(em, {
    orgId: source.org_id,
    projectId: source.project_id,
    queue: "agent-runs",
    kind: "agent_run",
    payload: { run_id: newId },
  });

  await eventDispatcher.dispatch(em, {
    orgId: source.org_id,
    projectId: source.project_id,
    actor: "system",
    subjectKind: "agent_run",
    subjectId: newId,
    verb: "retried",
    payload: { original_run_id: id },
  });

  return { id: newId };
}
