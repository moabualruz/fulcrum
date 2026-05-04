import type { ProductDb, SqlValue } from "../../../../product-kernel/db/types.ts";

// --- Types ---

export type SymphonyState =
  | "pending"
  | "dispatched"
  | "running"
  | "stalled"
  | "succeeded"
  | "failed"
  | "cancelled";

export const SYMPHONY_COLORS: Record<SymphonyState, string> = {
  pending: "bg-muted text-muted-foreground",
  dispatched: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  running: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  stalled: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  succeeded: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  cancelled: "bg-muted text-muted-foreground line-through",
};

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
  db: ProductDb,
  orgId: string,
  projectId?: string,
): Promise<OrchestrationDashboardData> {
  // Config for concurrency gauge
  const configRows = await db.query<OrchestrationConfigRow>(
    `SELECT * FROM orchestration_config WHERE org_id = $1`,
    [orgId],
  );
  const config = configRows[0];
  const maxConcurrency = config?.max_concurrency ?? 4;

  // Active runs count for concurrency gauge
  const activeRows = await db.query<{ c: string | number }>(
    `SELECT count(*)::text AS c FROM agent_runs
       WHERE org_id = $1 AND status = 'running'`,
    [orgId],
  );
  const concurrencyUsed = Number(activeRows[0]?.c ?? 0);

  // Last tick — most recent ended run
  const lastTickRows = await db.query<{ ended_at: string | Date | null }>(
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

  // Recent dispatches (optionally filtered by project)
  const dispatchParams: unknown[] = projectId
    ? [orgId, projectId]
    : [orgId];
  const dispatchWhere = projectId
    ? `WHERE org_id = $1 AND project_id = $2`
    : `WHERE org_id = $1`;
  const dispatches = await db.query<DispatchRow>(
    `SELECT id, agent, status, symphony_state, orchestration_state,
            NULL::text AS claimed_by,
            started_at, ended_at, project_id
       FROM agent_runs ${dispatchWhere}
       ORDER BY started_at DESC LIMIT 50`,
    dispatchParams,
  );

  // Retry queue: failed runs eligible for retry
  const retryQueue = await db.query<RetryQueueRow>(
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
  db: ProductDb,
  orgId: string,
  projectId: string,
): Promise<ProjectRunRow[]> {
  const rows = await db.query<ProjectRunRow>(
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
  db: ProductDb,
  orgId: string,
): Promise<OrchestrationConfigRow | null> {
  const rows = await db.query<OrchestrationConfigRow>(
    `SELECT * FROM orchestration_config WHERE org_id = $1`,
    [orgId],
  );
  return rows[0] ?? null;
}

export async function upsertOrchestrationConfig(
  db: ProductDb,
  orgId: string,
  config: {
    pollIntervalS: number;
    maxConcurrency: number;
    stallTimeoutS: number;
    workspaceRoot: string | null;
  },
): Promise<OrchestrationConfigRow> {
  const rows = await db.query<OrchestrationConfigRow>(
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
  db: ProductDb,
  orgId: string,
  id: string,
): Promise<WorkflowDefRow | null> {
  const rows = await db.query<WorkflowDefRow>(
    `SELECT * FROM workflow_defs WHERE id = $1 AND org_id = $2`,
    [id, orgId],
  );
  return rows[0] ?? null;
}

export async function listWorkflowDefs(
  db: ProductDb,
  orgId: string,
): Promise<WorkflowDefRow[]> {
  return db.query<WorkflowDefRow>(
    `SELECT * FROM workflow_defs WHERE org_id = $1 ORDER BY updated_at DESC`,
    [orgId],
  );
}

export async function upsertWorkflowDef(
  db: ProductDb,
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
  const id = def.id ?? (await import("../../../../product-kernel/ids.ts")).newUlid();
  const rows = await db.query<WorkflowDefRow>(
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
