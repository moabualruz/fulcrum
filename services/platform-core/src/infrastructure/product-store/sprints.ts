/**
 * Sprint lifecycle + gated LLM narration on close.
 *
 * When `FULCRUM_FEATURES=report-llm-narration` is ON, sprint close calls
 * the inference sidecar to generate a 3-paragraph narrative from sprint
 * metrics + completed task titles, appending it to the retro doc.
 */

import type { ProductDb } from "./db/types.ts";
import type { InferenceSidecar } from "./inference.ts";
import { newUlid } from "./ids.ts";
import { eventDispatcher } from "./event-dispatcher.ts";

// ── Types ──────────────────────────────────────────────────────────

export interface SprintRow {
  id: string;
  org_id: string;
  project_id: string | null;
  name: string;
  goal: string | null;
  status: string;
  started_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SprintCloseResult {
  retro_doc_id: string;
  narrative_appended: boolean;
}

// ── Create sprint ──────────────────────────────────────────────────

export async function createSprint(
  db: ProductDb,
  input: {
    orgId: string;
    projectId: string | null;
    name: string;
    goal?: string | null;
  },
): Promise<SprintRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO sprints (id, org_id, project_id, name, goal, status)
     VALUES ($1, $2, $3, $4, $5, 'planning')`,
    [id, input.orgId, input.projectId, input.name, input.goal ?? null],
  );
  const rows = await db.query<SprintRow>(
    `SELECT * FROM sprints WHERE id = $1`,
    [id],
  );
  return rows[0] as SprintRow;
}

// ── Start sprint ───────────────────────────────────────────────────

export async function startSprint(
  db: ProductDb,
  sprintId: string,
): Promise<SprintRow> {
  const rows = await db.query<SprintRow>(
    `UPDATE sprints SET status = 'active', started_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'planning' RETURNING *`,
    [sprintId],
  );
  if (rows.length === 0) throw new Error(`Cannot start sprint ${sprintId}`);
  return rows[0] as SprintRow;
}

// ── Close sprint ───────────────────────────────────────────────────

export async function closeSprint(
  db: ProductDb,
  sprintId: string,
  opts: {
    narrateEnabled: boolean;
    sidecar?: InferenceSidecar;
    narrateBackend?: string | null;
  },
): Promise<SprintCloseResult> {
  // Close the sprint
  const sprintRows = await db.query<SprintRow>(
    `UPDATE sprints SET status = 'closed', closed_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'active' RETURNING *`,
    [sprintId],
  );
  const sprint = sprintRows[0];
  if (!sprint) throw new Error(`Cannot close sprint ${sprintId}: not active`);

  // Gather completed tasks in this sprint
  const tasks = await db.query<{ title: string; status: string }>(
    `SELECT title, status FROM tasks WHERE sprint_id = $1`,
    [sprintId],
  );
  const completed = tasks.filter((t) => t.status === "completed");
  const total = tasks.length;

  // Build retro doc body
  const metricsSection = [
    `## Sprint: ${sprint.name}`,
    "",
    `- Total tasks: ${total}`,
    `- Completed: ${completed.length}`,
    `- Completion rate: ${total > 0 ? Math.round((completed.length / total) * 100) : 0}%`,
    "",
    "### Completed tasks",
    ...completed.map((t) => `- ${t.title}`),
  ].join("\n");

  let narrative = "";
  let narrativeAppended = false;

  if (opts.narrateEnabled && opts.sidecar) {
    const prompt = buildNarrationPrompt(sprint, completed, total);
    try {
      narrative = await opts.sidecar.narrate(prompt);
      narrativeAppended = true;
    } catch (err) {
      // Degrade gracefully — log warning, skip narrative
      console.warn(
        `[sprints] LLM narration failed for sprint ${sprintId}:`,
        err,
      );
    }
  }

  const body = narrativeAppended
    ? `${metricsSection}\n\n## LLM Summary\n\n${narrative}`
    : metricsSection;

  // Create retro doc
  const retroDocId = newUlid();
  await db.query(
    `INSERT INTO documents (id, org_id, project_id, kind, title, body)
     VALUES ($1, $2, $3, 'retro', $4, $5)`,
    [
      retroDocId,
      sprint.org_id,
      sprint.project_id,
      `Retro: ${sprint.name}`,
      body,
    ],
  );

  await eventDispatcher.dispatch(db, {
    orgId: sprint.org_id,
    projectId: sprint.project_id ?? undefined,
    actor: "system",
    subjectKind: "sprint",
    subjectId: sprintId,
    verb: "closed",
    payload: {
      retro_doc_id: retroDocId,
      narrative_appended: narrativeAppended,
      completed_count: completed.length,
      total_count: total,
    },
  });

  return { retro_doc_id: retroDocId, narrative_appended: narrativeAppended };
}

function buildNarrationPrompt(
  sprint: SprintRow,
  completed: { title: string }[],
  total: number,
): string {
  const completionRate =
    total > 0 ? Math.round((completed.length / total) * 100) : 0;
  return [
    `Write a 3-paragraph retrospective narrative for sprint "${sprint.name}".`,
    "",
    `Sprint goal: ${sprint.goal ?? "not specified"}`,
    `Total tasks: ${total}`,
    `Completed: ${completed.length} (${completionRate}%)`,
    "",
    "Completed task titles:",
    ...completed.map((t) => `- ${t.title}`),
    "",
    "Write exactly 3 paragraphs. First paragraph: what was accomplished.",
    "Second paragraph: team velocity and completion rate analysis.",
    "Third paragraph: forward-looking observations.",
  ].join("\n");
}
