/**
 * HTTP Status API Extension — gated by FULCRUM_FEATURES=symphony-http-api.
 *
 * Per SPEC.md §13.7: GET /api/v1/state, GET /api/v1/:identifier, POST /api/v1/refresh.
 * Observability/control only — must not become required for orchestrator correctness.
 */

import type { ProductDb } from "../db/types.ts";

// --- Response shapes per SPEC.md §13.7.2 ---

export interface RunningSession {
  issue_id: string;
  issue_identifier: string;
  state: string;
  session_id: string | null;
  started_at: string;
  last_event_at: string | null;
}

export interface RetryingSession {
  issue_id: string;
  issue_identifier: string;
  attempt: number;
  due_at: string | null;
  error: string | null;
}

export interface StateResponse {
  generated_at: string;
  counts: { running: number; retrying: number };
  running: RunningSession[];
  retrying: RetryingSession[];
}

export interface IssueDetailResponse {
  issue_identifier: string;
  issue_id: string;
  status: string;
  workspace: { path: string | null };
  attempts: { restart_count: number; current_retry_attempt: number };
  recent_events: Array<{ at: string; event: string; message: string }>;
  last_error: string | null;
}

export interface RefreshResponse {
  queued: boolean;
  message: string;
}

export interface ErrorResponse {
  error: { code: string; message: string };
}

// --- Query helpers ---

interface AgentRunRow {
  id: string;
  task_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
}

interface TaskRunRow {
  run_id: string;
  task_id: string;
  task_title: string;
  run_status: string;
  run_started_at: string;
  run_ended_at: string | null;
  attempt_count: number;
}

/** GET /api/v1/state — summary of current system state. */
export async function getSystemState(db: ProductDb): Promise<StateResponse> {
  const runningRows = await db.query<TaskRunRow>(
    `SELECT ar.id AS run_id, ar.task_id, t.title AS task_title,
            ar.status AS run_status, ar.started_at AS run_started_at,
            ar.ended_at AS run_ended_at, 0 AS attempt_count
     FROM agent_runs ar
     JOIN tasks t ON t.id = ar.task_id
     WHERE ar.status = 'running'
     ORDER BY ar.started_at ASC`,
  );

  const retryRows = await db.query<TaskRunRow>(
    `SELECT ar.id AS run_id, ar.task_id, t.title AS task_title,
            ar.status AS run_status, ar.started_at AS run_started_at,
            ar.ended_at AS run_ended_at, 0 AS attempt_count
     FROM agent_runs ar
     JOIN tasks t ON t.id = ar.task_id
     WHERE ar.status = 'queued'
     ORDER BY ar.started_at ASC`,
  );

  return {
    generated_at: new Date().toISOString(),
    counts: {
      running: runningRows.length,
      retrying: retryRows.length,
    },
    running: runningRows.map((r) => ({
      issue_id: r.task_id,
      issue_identifier: r.task_title,
      state: r.run_status,
      session_id: r.run_id,
      started_at: r.run_started_at,
      last_event_at: r.run_ended_at,
    })),
    retrying: retryRows.map((r) => ({
      issue_id: r.task_id,
      issue_identifier: r.task_title,
      attempt: r.attempt_count,
      due_at: null,
      error: null,
    })),
  };
}

/** GET /api/v1/:identifier — issue-specific runtime details. */
export async function getIssueDetail(
  db: ProductDb,
  identifier: string,
): Promise<IssueDetailResponse | null> {
  // Look up by task title (identifier) or task id
  const taskRows = await db.query<{ id: string; title: string; status: string }>(
    `SELECT id, title, status FROM tasks WHERE id = $1 OR title = $1 LIMIT 1`,
    [identifier],
  );

  if (taskRows.length === 0) return null;

  const task = taskRows[0]!;

  const runRows = await db.query<AgentRunRow>(
    `SELECT id, task_id, status, started_at, ended_at
     FROM agent_runs WHERE task_id = $1
     ORDER BY started_at DESC`,
    [task.id],
  );

  const eventRows = await db.query<{ created_at: string; verb: string; payload: Record<string, unknown> }>(
    `SELECT created_at, verb, payload FROM events
     WHERE subject_kind = 'agent_run' AND subject_id = ANY(
       SELECT id FROM agent_runs WHERE task_id = $1
     )
     ORDER BY created_at DESC LIMIT 10`,
    [task.id],
  );

  const latestRun = runRows[0];

  return {
    issue_identifier: task.title,
    issue_id: task.id,
    status: latestRun?.status ?? task.status,
    workspace: { path: null },
    attempts: {
      restart_count: Math.max(0, runRows.length - 1),
      current_retry_attempt: runRows.length,
    },
    recent_events: eventRows.map((e) => ({
      at: e.created_at,
      event: e.verb,
      message: String(e.payload?.message ?? ""),
    })),
    last_error: null,
  };
}

/**
 * Route handler map. Caller integrates with its HTTP server.
 * Returns { status, body } for each route.
 */
export interface HttpApiRoutes {
  getState(): Promise<{ status: number; body: StateResponse }>;
  getIssue(identifier: string): Promise<{ status: number; body: IssueDetailResponse | ErrorResponse }>;
  postRefresh(): Promise<{ status: number; body: RefreshResponse }>;
}

/** Build route handlers bound to a db instance. */
export function createHttpApiRoutes(
  db: ProductDb,
  onRefresh?: () => void,
): HttpApiRoutes {
  return {
    async getState() {
      const state = await getSystemState(db);
      return { status: 200, body: state };
    },
    async getIssue(identifier: string) {
      const detail = await getIssueDetail(db, identifier);
      if (!detail) {
        return {
          status: 404,
          body: { error: { code: "issue_not_found", message: `Issue '${identifier}' not found` } },
        };
      }
      return { status: 200, body: detail };
    },
    async postRefresh() {
      onRefresh?.();
      return {
        status: 200,
        body: { queued: true, message: "Refresh cycle queued" },
      };
    },
  };
}
