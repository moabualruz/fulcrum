/**
 * Sprint-closed event handler: auto-creates a retro doc (doc_type='postmortem')
 * when a sprint is closed. Idempotent via event_handler_log dedup.
 *
 * If docs.create (Pillar 7) is not available, creates the document directly
 * in the documents table. If Pillar 7 ships a tRPC router, the handler
 * can be updated to call it instead.
 */
import type { SqlExecutor } from "../../db/sql.ts";
import { newUlid } from "../../shared/ids.ts";

const HANDLER_NAME = "sprint-closed-retro-doc";

export interface SprintClosedPayload {
  name: string;
  goal: string | null;
  start_date: string | null;
  end_date: string | null;
  metrics_snapshot: MetricsSnapshot;
}

export interface MetricsSnapshot {
  total_tasks: number;
  completed_tasks: number;
  completed_points: number;
  capacity_points: number | null;
  velocity: number;
}

export interface SprintClosedEventRow {
  id: string;
  org_id: string;
  project_id: string | null;
  subject_id: string;
  payload: Record<string, unknown>;
}

export interface DocsCreateFn {
  (input: {
    orgId: string;
    projectId: string;
    kind: string;
    title: string;
    body: string;
    frontmatter?: Record<string, unknown>;
  }): Promise<{ id: string }>;
}

/**
 * Build retro doc content stub as TipTap-compatible JSON paragraph nodes.
 */
export function buildRetroContent(
  payload: SprintClosedPayload,
): Record<string, unknown> {
  const m = payload.metrics_snapshot;
  const paragraphs = [
    `Sprint: ${payload.name}`,
    `Goal: ${payload.goal ?? "(none)"}`,
    `Dates: ${payload.start_date ?? "?"} – ${payload.end_date ?? "?"}`,
    "",
    "Metrics Summary",
    `Capacity: ${m.capacity_points ?? "unset"} points`,
    `Completed: ${m.completed_points} points (${m.completed_tasks}/${m.total_tasks} tasks)`,
    `Velocity: ${m.velocity}`,
  ];

  return {
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: text ? [{ type: "text", text }] : [],
    })),
  };
}

export interface HandleSprintClosedResult {
  retro_doc_id: string | null;
  skipped: boolean;
  warning?: string;
}

/**
 * Handle a sprint.closed event. Creates a retro doc if not already handled.
 *
 * @param db - Database connection
 * @param event - The sprint.closed event row
 * @param docsCreate - Optional docs.create function (Pillar 7). If null,
 *   creates document directly in the documents table.
 */
export async function handleSprintClosed(
  db: SqlExecutor,
  event: SprintClosedEventRow,
  docsCreate?: DocsCreateFn | null,
): Promise<HandleSprintClosedResult> {
  // Idempotency check
  const alreadyHandled = await checkEventHandled(db, event.id, HANDLER_NAME);
  if (alreadyHandled) {
    return { retro_doc_id: null, skipped: true };
  }

  const payload = event.payload as unknown as SprintClosedPayload;
  if (!payload?.metrics_snapshot) {
    return {
      retro_doc_id: null,
      skipped: true,
      warning: "sprint.closed event missing metrics_snapshot",
    };
  }

  const title = `Retro: ${payload.name}`;
  const contentJson = buildRetroContent(payload);
  const body = JSON.stringify(contentJson);
  const orgId = event.org_id;
  const projectId = event.project_id;

  if (!projectId) {
    return {
      retro_doc_id: null,
      skipped: true,
      warning: "sprint.closed event missing project_id",
    };
  }

  let docId: string;

  if (docsCreate) {
    // Pillar 7 available — use its API
    try {
      const result = await docsCreate({
        orgId,
        projectId,
        kind: "postmortem",
        title,
        body,
        frontmatter: { sprint_id: event.subject_id },
      });
      docId = result.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Pillar 7 not actually available (e.g. procedure missing)
      console.warn(`[sprint-closed] docs.create failed, falling back to direct insert: ${msg}`);
      docId = await insertDocDirectly(db, { orgId, projectId, title, body, sprintId: event.subject_id });
    }
  } else {
    // Pillar 7 not shipped — insert directly
    docId = await insertDocDirectly(db, { orgId, projectId, title, body, sprintId: event.subject_id });
  }

  // Mark handled + link retro doc to sprint
  await markEventHandled(db, event.id, HANDLER_NAME);
  await setSprintRetroDocId(db, event.subject_id, docId);

  return { retro_doc_id: docId, skipped: false };
}

async function insertDocDirectly(
  db: SqlExecutor,
  input: { orgId: string; projectId: string; title: string; body: string; sprintId: string },
): Promise<string> {
  const id = newUlid();
  await db.query(
    `INSERT INTO documents (id, org_id, project_id, kind, title, body, frontmatter)
     VALUES ($1, $2, $3, 'postmortem', $4, $5, $6::jsonb)`,
    [
      id,
      input.orgId,
      input.projectId,
      input.title,
      input.body,
      JSON.stringify({ sprint_id: input.sprintId }),
    ],
  );
  return id;
}

async function checkEventHandled(
  db: SqlExecutor,
  eventId: string,
  handler: string,
): Promise<boolean> {
  const rows = await db.query<{ event_id: string }>(
    `SELECT event_id FROM event_handler_log WHERE event_id = $1 AND handler = $2`,
    [eventId, handler],
  );
  return rows.length > 0;
}

async function markEventHandled(
  db: SqlExecutor,
  eventId: string,
  handler: string,
): Promise<void> {
  await db.query(
    `INSERT INTO event_handler_log (event_id, handler)
     VALUES ($1, $2)
     ON CONFLICT (event_id, handler) DO NOTHING`,
    [eventId, handler],
  );
}

async function setSprintRetroDocId(
  db: SqlExecutor,
  sprintId: string,
  docId: string,
): Promise<void> {
  const rows = await db.query<{ id: string }>(
    `UPDATE sprints SET retro_doc_id = $1, updated_at = now() WHERE id = $2 RETURNING id`,
    [docId, sprintId],
  );
  if (rows.length === 0) throw new Error(`sprint not found: ${sprintId}`);
}
