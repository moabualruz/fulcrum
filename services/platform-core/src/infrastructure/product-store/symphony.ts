import type { ProductDb } from "./db/types.ts";
import { newUlid } from "./ids.ts";
import { eventDispatcher } from "./event-dispatcher.ts";

// ---------------------------------------------------------------------------
// Symphony state type
// ---------------------------------------------------------------------------
export type SymphonyState =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "retry_queued";

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------
export interface SymphonyRunRow {
  id: string;
  org_id: string;
  project_id: string | null;
  workflow_def_id: string | null;
  identifier: string;
  symphony_state: SymphonyState;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  next_retry_at: string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowDefRow {
  id: string;
  org_id: string;
  project_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  prompt_template: string | null;
  hooks: Record<string, unknown>;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Hooks registry — in-process callbacks keyed by hook name
// ---------------------------------------------------------------------------
export type HookFn = (run: SymphonyRunRow) => void | Promise<void>;

const hookRegistry = new Map<string, HookFn[]>();

export function registerHook(name: string, fn: HookFn): () => void {
  const list = hookRegistry.get(name) ?? [];
  list.push(fn);
  hookRegistry.set(name, list);
  return () => {
    const idx = list.indexOf(fn);
    if (idx >= 0) list.splice(idx, 1);
  };
}

export function clearHooks(): void {
  hookRegistry.clear();
}

async function fireHook(name: string, run: SymphonyRunRow): Promise<void> {
  for (const fn of hookRegistry.get(name) ?? []) {
    await fn(run);
  }
}

// ---------------------------------------------------------------------------
// Symphony runs CRUD
// ---------------------------------------------------------------------------
export interface CreateRunInput {
  orgId: string;
  projectId?: string | null;
  workflowDefId?: string | null;
  identifier: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
}

export async function createRun(db: ProductDb, input: CreateRunInput): Promise<SymphonyRunRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO symphony_runs
       (id, org_id, project_id, workflow_def_id, identifier, symphony_state, payload, max_attempts)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6::jsonb, $7)`,
    [
      id,
      input.orgId,
      input.projectId ?? null,
      input.workflowDefId ?? null,
      input.identifier,
      JSON.stringify(input.payload ?? {}),
      input.maxAttempts ?? 3,
    ],
  );
  return (await getRun(db, id)) as SymphonyRunRow;
}

export async function getRun(db: ProductDb, id: string): Promise<SymphonyRunRow | null> {
  const rows = await db.query<SymphonyRunRow>(
    `SELECT * FROM symphony_runs WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listRuns(
  db: ProductDb,
  orgId: string,
  opts?: { limit?: number; offset?: number },
): Promise<SymphonyRunRow[]> {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  return db.query<SymphonyRunRow>(
    `SELECT * FROM symphony_runs WHERE org_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [orgId, limit, offset],
  );
}

export async function cancelRun(db: ProductDb, id: string): Promise<SymphonyRunRow | null> {
  const rows = await db.query<SymphonyRunRow>(
    `UPDATE symphony_runs
        SET symphony_state = 'cancelled', updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [id],
  );
  const run = rows[0] ?? null;
  if (run) {
    await eventDispatcher.dispatch(db, {
      orgId: run.org_id,
      projectId: run.project_id,
      actor: "system",
      subjectKind: "symphony_run",
      subjectId: run.id,
      verb: "cancelled",
    });
    await fireHook("on_cancel", run);
  }
  return run;
}

export async function retryRun(db: ProductDb, id: string): Promise<SymphonyRunRow | null> {
  const rows = await db.query<SymphonyRunRow>(
    `UPDATE symphony_runs
        SET symphony_state = 'retry_queued',
            next_retry_at = now(),
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [id],
  );
  const run = rows[0] ?? null;
  if (run) {
    await eventDispatcher.dispatch(db, {
      orgId: run.org_id,
      projectId: run.project_id,
      actor: "system",
      subjectKind: "symphony_run",
      subjectId: run.id,
      verb: "retry_queued",
    });
  }
  return run;
}

// ---------------------------------------------------------------------------
// Workflow definitions CRUD
// ---------------------------------------------------------------------------
export interface UpsertWorkflowDefInput {
  orgId: string;
  projectId?: string | null;
  slug: string;
  name: string;
  description?: string | null;
  promptTemplate?: string | null;
  hooks?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export async function upsertWorkflowDef(
  db: ProductDb,
  input: UpsertWorkflowDefInput,
): Promise<WorkflowDefRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO workflow_defs
       (id, org_id, project_id, slug, name, description, prompt_template, hooks, config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
     ON CONFLICT (org_id, slug)
     DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       prompt_template = EXCLUDED.prompt_template,
       hooks = EXCLUDED.hooks,
       config = EXCLUDED.config,
       project_id = EXCLUDED.project_id,
       updated_at = now()`,
    [
      id,
      input.orgId,
      input.projectId ?? null,
      input.slug,
      input.name,
      input.description ?? null,
      input.promptTemplate ?? null,
      JSON.stringify(input.hooks ?? {}),
      JSON.stringify(input.config ?? {}),
    ],
  );
  const rows = await db.query<WorkflowDefRow>(
    `SELECT * FROM workflow_defs WHERE org_id = $1 AND slug = $2`,
    [input.orgId, input.slug],
  );
  if (rows.length === 0) throw new Error(`workflow_def upsert lost: ${input.slug}`);
  return rows[0] as WorkflowDefRow;
}

export async function listWorkflowDefs(
  db: ProductDb,
  orgId: string,
): Promise<WorkflowDefRow[]> {
  return db.query<WorkflowDefRow>(
    `SELECT * FROM workflow_defs WHERE org_id = $1 ORDER BY name ASC`,
    [orgId],
  );
}

export async function getWorkflowDef(
  db: ProductDb,
  id: string,
): Promise<WorkflowDefRow | null> {
  const rows = await db.query<WorkflowDefRow>(
    `SELECT * FROM workflow_defs WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Prompt preview — renders a workflow_def's prompt_template with variables
// ---------------------------------------------------------------------------
export function renderPromptPreview(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`);
}

// ---------------------------------------------------------------------------
// Orchestrator status — lightweight aggregation
// ---------------------------------------------------------------------------
export interface OrchestratorStatus {
  pending: number;
  running: number;
  retry_queued: number;
  succeeded: number;
  failed: number;
  cancelled: number;
}

export async function getOrchestratorStatus(
  db: ProductDb,
  orgId: string,
): Promise<OrchestratorStatus> {
  const rows = await db.query<{ symphony_state: string; count: string }>(
    `SELECT symphony_state, count(*)::text as count
     FROM symphony_runs WHERE org_id = $1
     GROUP BY symphony_state`,
    [orgId],
  );
  const status: OrchestratorStatus = {
    pending: 0,
    running: 0,
    retry_queued: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const row of rows) {
    const key = row.symphony_state as keyof OrchestratorStatus;
    if (key in status) status[key] = parseInt(row.count, 10);
  }
  return status;
}

// ---------------------------------------------------------------------------
// Drift report — runs that might be stuck
// ---------------------------------------------------------------------------
export interface DriftEntry {
  id: string;
  identifier: string;
  symphony_state: SymphonyState;
  updated_at: string;
}

export async function getSymphonyDriftReport(
  db: ProductDb,
  orgId: string,
  staleMinutes = 30,
): Promise<DriftEntry[]> {
  return db.query<DriftEntry>(
    `SELECT id, identifier, symphony_state, updated_at::text as updated_at
     FROM symphony_runs
     WHERE org_id = $1
       AND symphony_state IN ('running', 'retry_queued')
       AND updated_at < now() - make_interval(mins := $2)
     ORDER BY updated_at ASC`,
    [orgId, staleMinutes],
  );
}
