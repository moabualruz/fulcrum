/**
 * Agent-run service — pure DB operations for dispatching/cancelling/retrying runs.
 * Canonical home; web layer re-exports from here.
 * Dependency direction: services -> product-kernel (never web).
 */
import type { ProductDb } from "../product-kernel/db/types.ts";
import { appendEvent } from "../product-kernel/store/repositories.ts";
import { enqueueJob } from "../product-kernel/jobs.ts";
import { newUlid } from "../product-kernel/ids.ts";

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
  db: ProductDb,
  input: DispatchRunInput,
): Promise<{ id: string; task_id: string; agent: string; status: RunStatus }> {
  const id = newUlid();
  await db.query(
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

  await enqueueJob(db, {
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    queue: "agent-runs",
    kind: "agent_run",
    payload: { run_id: id },
  });

  await appendEvent(db, {
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
  db: ProductDb,
  id: string,
  orgId: string,
): Promise<{ ok: boolean }> {
  const rows = await db.query<RunScopeRow>(
    `UPDATE agent_runs
        SET status = 'cancelled', ended_at = now()
      WHERE id = $1 AND org_id = $2 AND status IN ('queued', 'running')
      RETURNING org_id, project_id`,
    [id, orgId],
  );
  const row = rows[0];
  if (row) {
    await appendEvent(db, {
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
  db: ProductDb,
  id: string,
  orgId: string,
): Promise<{ id: string }> {
  const sourceRows = await db.query<RunSourceRow>(
    `SELECT id, org_id, project_id, agent, model, prompt
       FROM agent_runs WHERE id = $1 AND org_id = $2`,
    [id, orgId],
  );
  const source = sourceRows[0];
  if (!source) throw new Error(`retryRunAction: run not found: ${id}`);

  const newId = newUlid();
  await db.query(
    `INSERT INTO agent_runs
       (id, org_id, project_id, agent, model, prompt, status, parent_run_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7)`,
    [newId, source.org_id, source.project_id, source.agent, source.model, source.prompt, id],
  );

  await enqueueJob(db, {
    orgId: source.org_id,
    projectId: source.project_id,
    queue: "agent-runs",
    kind: "agent_run",
    payload: { run_id: newId },
  });

  await appendEvent(db, {
    orgId: source.org_id,
    projectId: source.project_id,
    actor: "system",
    subjectKind: "agent_run",
    subjectId: id,
    verb: "retried",
    payload: { parent: id, retry: newId },
  });

  return { id: newId };
}
