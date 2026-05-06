/**
 * Orchestration actions — migrated from raw LegacyDatabaseHandle to MikroORM EntityManager.
 * ARCH-01/ARCH-02: All DB access via MikroORM EM connection.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import { ormSqlConnection } from "./orm-helpers.ts";
export { SYMPHONY_COLORS, type SymphonyState } from "$lib/orchestration";

// --- Types ---

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

// --- Dashboard loader ---

export async function loadOrchestrationDashboard(
  em: EntityManager,
  orgId: string,
  projectId?: string,
): Promise<OrchestrationDashboardData> {
  const conn = ormSqlConnection(em);

  const configRows = await conn.execute<OrchestrationConfigRow[]>(
    `SELECT * FROM orchestration_config WHERE org_id = $1`,
    [orgId],
  );
  const config = configRows[0];
  const maxConcurrency = config?.max_concurrency ?? 4;

  const activeRows = await conn.execute<{ c: string | number }[]>(
    `SELECT count(*)::text AS c FROM agent_runs
       WHERE org_id = $1 AND status = 'running'`,
    [orgId],
  );
  const concurrencyUsed = Number(activeRows[0]?.c ?? 0);

  const lastTickRows = await conn.execute<{ ended_at: string | Date | null }[]>(
    `SELECT ended_at FROM agent_runs
       WHERE org_id = $1 AND ended_at IS NOT NULL
       ORDER BY ended_at DESC LIMIT 1`,
    [orgId],
  );
  const lastTickAt = lastTickRows[0]?.ended_at
    ? (lastTickRows[0].ended_at instanceof Date
        ? lastTickRows[0].ended_at.toISOString()
        : lastTickRows[0].ended_at)
    : null;

  const dispatchParams: unknown[] = projectId
    ? [orgId, projectId]
    : [orgId];
  const dispatchWhere = projectId
    ? `WHERE org_id = $1 AND project_id = $2`
    : `WHERE org_id = $1`;
  const dispatches = await conn.execute<DispatchRow[]>(
    `SELECT id, agent, status, symphony_state, orchestration_state,
            NULL::text AS claimed_by,
            started_at, ended_at, project_id
       FROM agent_runs ${dispatchWhere}
       ORDER BY started_at DESC LIMIT 50`,
    dispatchParams,
  );

  const retryQueue = await conn.execute<RetryQueueRow[]>(
    `SELECT id, agent, last_error_kind, retry_count, started_at
       FROM agent_runs
       WHERE org_id = $1 AND status = 'failed'
       ORDER BY started_at DESC LIMIT 10`,
    [orgId],
  );

  return {
    status: {
      lastTickAt,
      workerConnected: concurrencyUsed > 0,
      concurrencyUsed,
      concurrencyMax: maxConcurrency,
      lastSyncDate: lastTickAt,
    },
    dispatches: dispatches.map((d) => ({
      ...d,
      started_at: d.started_at instanceof Date ? d.started_at.toISOString() : d.started_at,
      ended_at: d.ended_at instanceof Date ? d.ended_at.toISOString() : (d.ended_at ?? null),
    })),
    retryQueue: retryQueue.map((r) => ({
      ...r,
      started_at: r.started_at instanceof Date ? r.started_at.toISOString() : r.started_at,
    })),
  };
}

// --- Project-scoped runs ---

export interface ProjectRunRow {
  id: string;
  agent: string;
  model: string | null;
  status: string;
  symphony_state: string | null;
  started_at: string;
  ended_at: string | null;
  last_error_kind: string | null;
  retry_count: number;
  workspace_path: string | null;
}

export async function loadProjectRuns(
  em: EntityManager,
  orgId: string,
  projectId: string,
): Promise<ProjectRunRow[]> {
  const conn = ormSqlConnection(em);
  const rows = await conn.execute<ProjectRunRow[]>(
    `SELECT id, agent, model, status, symphony_state, started_at, ended_at,
            last_error_kind, retry_count, workspace_path
       FROM agent_runs
       WHERE org_id = $1 AND project_id = $2
       ORDER BY started_at DESC`,
    [orgId, projectId],
  );
  return rows.map((r) => ({
    ...r,
    started_at: r.started_at instanceof Date ? (r.started_at as unknown as Date).toISOString() : r.started_at,
    ended_at: r.ended_at instanceof Date ? (r.ended_at as unknown as Date).toISOString() : (r.ended_at ?? null),
  }));
}

// --- Orchestration config ---

export async function loadOrchestrationConfig(
  em: EntityManager,
  orgId: string,
): Promise<OrchestrationConfigRow | null> {
  const conn = ormSqlConnection(em);
  const rows = await conn.execute<OrchestrationConfigRow[]>(
    `SELECT * FROM orchestration_config WHERE org_id = $1`,
    [orgId],
  );
  return rows[0] ?? null;
}

export async function upsertOrchestrationConfig(
  em: EntityManager,
  orgId: string,
  config: {
    pollIntervalS: number;
    maxConcurrency: number;
    stallTimeoutS: number;
    workspaceRoot: string | null;
  },
): Promise<OrchestrationConfigRow> {
  const conn = ormSqlConnection(em);
  const rows = await conn.execute<OrchestrationConfigRow[]>(
    `INSERT INTO orchestration_config (id, org_id, poll_interval_s, max_concurrency, stall_timeout_s, workspace_root, updated_at)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, now())
     ON CONFLICT (org_id) DO UPDATE SET
       poll_interval_s = EXCLUDED.poll_interval_s,
       max_concurrency = EXCLUDED.max_concurrency,
       stall_timeout_s = EXCLUDED.stall_timeout_s,
       workspace_root = EXCLUDED.workspace_root,
       updated_at = now()
     RETURNING *`,
    [orgId, config.pollIntervalS, config.maxConcurrency, config.stallTimeoutS, config.workspaceRoot],
  );
  return rows[0]!;
}

// --- Workflow defs ---

export async function loadWorkflowDef(
  em: EntityManager,
  orgId: string,
  id: string,
): Promise<WorkflowDefRow | null> {
  const conn = ormSqlConnection(em);
  const rows = await conn.execute<WorkflowDefRow[]>(
    `SELECT * FROM workflow_defs WHERE id = $1 AND org_id = $2`,
    [id, orgId],
  );
  return rows[0] ?? null;
}

export async function listWorkflowDefs(
  em: EntityManager,
  orgId: string,
): Promise<WorkflowDefRow[]> {
  const conn = ormSqlConnection(em);
  return conn.execute<WorkflowDefRow[]>(
    `SELECT * FROM workflow_defs WHERE org_id = $1 ORDER BY updated_at DESC`,
    [orgId],
  );
}

export async function upsertWorkflowDef(
  em: EntityManager,
  orgId: string,
  def: {
    id?: string;
    projectId?: string | null;
    name: string;
    description?: string | null;
    yamlConfig: string;
    promptTemplate: string;
  },
): Promise<WorkflowDefRow> {
  const id = def.id ?? randomUUID();
  const conn = ormSqlConnection(em);
  const rows = await conn.execute<WorkflowDefRow[]>(
    `INSERT INTO workflow_defs (id, org_id, project_id, name, description, yaml_config, prompt_template, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       yaml_config = EXCLUDED.yaml_config,
       prompt_template = EXCLUDED.prompt_template,
       updated_at = now()
     RETURNING *`,
    [id, orgId, def.projectId ?? null, def.name, def.description ?? null, def.yamlConfig, def.promptTemplate],
  );
  return rows[0]!;
}
