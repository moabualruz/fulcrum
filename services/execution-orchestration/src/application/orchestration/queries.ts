import type { EntityManager } from "typeorm";

import { ormSqlConnection } from "@platform-core/application/orm-helpers.ts";
import type { OrchestrationApplicationContext } from "@execution-orchestration/application/orchestration/types.ts";

export function orchestrationApplicationScope(ctx: OrchestrationApplicationContext): OrchestrationApplicationContext {
  return ctx;
}

export interface OrchestrationStatus {
  lastTickAt: string | null;
  workerConnected: boolean;
  concurrencyUsed: number;
  concurrencyMax: number;
  lastSyncDate: string | null;
}

export interface DispatchRow {
  id: string;
  agent: string;
  status: string;
  symphony_state: string | null;
  orchestration_state: string | null;
  claimed_by: string | null;
  started_at: string;
  ended_at: string | null;
  project_id: string | null;
}

export interface RetryQueueRow {
  id: string;
  agent: string;
  last_error_kind: string | null;
  retry_count: number;
  started_at: string;
}

export interface OrchestrationDashboardData {
  status: OrchestrationStatus;
  dispatches: DispatchRow[];
  retryQueue: RetryQueueRow[];
}

export interface WorkflowDefRow {
  id: string;
  org_id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  yaml_config: string;
  prompt_template: string;
  created_at: string;
  updated_at: string;
}

export interface OrchestrationConfigRow {
  id: string;
  org_id: string;
  poll_interval_s: number;
  max_concurrency: number;
  stall_timeout_s: number;
  workspace_root: string | null;
  updated_at: string;
}

export interface ProjectOption {
  id: string;
  name: string;
}

export async function loadOrchestrationDashboard(
  em: EntityManager,
  ctx: OrchestrationApplicationContext,
  projectId?: string,
): Promise<OrchestrationDashboardData> {
  const conn = ormSqlConnection(em);
  const configRows = await optionalRows<OrchestrationConfigRow>(() =>
    conn.execute<OrchestrationConfigRow[]>(
      `SELECT * FROM orchestration_config WHERE org_id = $1`,
      [ctx.orgId],
    ),
  );
  const maxConcurrency = configRows[0]?.max_concurrency ?? 4;
  const activeRows = await conn.execute<{ c: string | number }[]>(
    `SELECT count(*)::text AS c FROM agent_runs
       WHERE org_id = $1 AND status = 'running'`,
    [ctx.orgId],
  );
  const concurrencyUsed = Number(activeRows[0]?.c ?? 0);
  const lastTickRows = await optionalRows<{ started_at: string | Date | null }>(() =>
    conn.execute<{ started_at: string | Date | null }[]>(
      `SELECT started_at FROM agent_runs
       WHERE org_id = $1
       ORDER BY started_at DESC LIMIT 1`,
      [ctx.orgId],
    ),
  );
  const lastTickAt = lastTickRows[0]?.started_at ? isoStamp(lastTickRows[0].started_at) : null;
  const dispatchParams: unknown[] = projectId ? [ctx.orgId, projectId] : [ctx.orgId];
  const dispatchWhere = projectId ? `WHERE ar.org_id = $1 AND t.project_id = $2` : `WHERE ar.org_id = $1`;
  const dispatches = await optionalRows<DispatchRow>(() =>
    conn.execute<DispatchRow[]>(
      `SELECT ar.id,
            ar.agent_name AS agent,
            ar.status,
            NULL::text AS symphony_state,
            ar.orchestration_state,
            ar.claimed_by,
            ar.started_at,
            NULL::timestamptz AS ended_at,
            t.project_id
       FROM agent_runs ar
       LEFT JOIN tasks t ON t.id = ar.task_id
       ${dispatchWhere}
       ORDER BY ar.started_at DESC LIMIT 50`,
      dispatchParams,
    ),
  );
  const retryQueue = await optionalRows<RetryQueueRow>(() =>
    conn.execute<RetryQueueRow[]>(
      `SELECT id, agent_name AS agent, last_error_kind, attempt_count AS retry_count, started_at
       FROM agent_runs
       WHERE org_id = $1 AND status = 'failed'
       ORDER BY started_at DESC LIMIT 10`,
      [ctx.orgId],
    ),
  );
  return {
    status: {
      lastTickAt,
      workerConnected: concurrencyUsed > 0,
      concurrencyUsed,
      concurrencyMax: maxConcurrency,
      lastSyncDate: lastTickAt,
    },
    dispatches: dispatches.map((dispatch) => ({
      ...dispatch,
      started_at: isoStamp(dispatch.started_at),
      ended_at: dispatch.ended_at ? isoStamp(dispatch.ended_at) : null,
    })),
    retryQueue: retryQueue.map((retry) => ({
      ...retry,
      started_at: isoStamp(retry.started_at),
    })),
  };
}

export async function listOrchestrationProjectOptions(
  em: EntityManager,
  ctx: OrchestrationApplicationContext,
): Promise<ProjectOption[]> {
  return ormSqlConnection(em).execute<ProjectOption[]>(
    `SELECT id, name FROM projects WHERE org_id = $1 ORDER BY name ASC`,
    [ctx.orgId],
  );
}

export async function loadOrchestrationConfig(
  em: EntityManager,
  ctx: OrchestrationApplicationContext,
): Promise<OrchestrationConfigRow | null> {
  const conn = ormSqlConnection(em);
  const rows = await optionalRows<OrchestrationConfigRow>(() =>
    conn.execute<OrchestrationConfigRow[]>(
      `SELECT * FROM orchestration_config WHERE org_id = $1`,
      [ctx.orgId],
    ),
  );
  return rows[0] ?? null;
}

export async function listWorkflowDefs(
  em: EntityManager,
  ctx: OrchestrationApplicationContext,
): Promise<WorkflowDefRow[]> {
  const conn = ormSqlConnection(em);
  return optionalRows<WorkflowDefRow>(() =>
    conn.execute<WorkflowDefRow[]>(
      `SELECT * FROM workflow_defs WHERE org_id = $1 ORDER BY updated_at DESC`,
      [ctx.orgId],
    ),
  );
}

export async function loadWorkflowDef(
  em: EntityManager,
  ctx: OrchestrationApplicationContext,
  id: string,
): Promise<WorkflowDefRow | null> {
  const rows = await ormSqlConnection(em).execute<WorkflowDefRow[]>(
    `SELECT * FROM workflow_defs WHERE id = $1 AND org_id = $2`,
    [id, ctx.orgId],
  );
  return rows[0] ?? null;
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

async function optionalRows<T>(query: () => Promise<T[]>): Promise<T[]> {
  try {
    return await query();
  } catch (err) {
    if (isMissingRelation(err)) return [];
    throw err;
  }
}

function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  const message = (err as Error)?.message ?? "";
  return code === "42P01" || message.includes("does not exist");
}
