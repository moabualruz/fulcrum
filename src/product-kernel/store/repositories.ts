import type { ProductDb } from "../db/types.ts";
import { newUlid } from "../ids.ts";

export interface OrgRow {
  id: string;
  slug: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectRow {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  org_id: string;
  project_id: string | null;
  parent_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  sprint_id: string | null;
  estimate_points: number | null;
  created_at: string;
  updated_at: string;
}

export interface EventRow {
  id: string;
  org_id: string;
  project_id: string | null;
  actor: string;
  subject_kind: string;
  subject_id: string;
  verb: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AppendEventInput {
  orgId: string;
  projectId?: string | null;
  actor: string;
  subjectKind: string;
  subjectId: string;
  verb: string;
  payload?: Record<string, unknown>;
}

export async function createLocalOrg(
  db: ProductDb,
  input: { slug: string; name: string },
): Promise<OrgRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO orgs (id, slug, name) VALUES ($1, $2, $3)`,
    [id, input.slug, input.name],
  );
  const rows = await db.query<OrgRow>(`SELECT * FROM orgs WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`org insert lost: ${id}`);
  return rows[0] as OrgRow;
}

export async function createProject(
  db: ProductDb,
  input: { orgId: string; slug: string; name: string; description?: string | null },
): Promise<ProjectRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO projects (id, org_id, slug, name, description) VALUES ($1, $2, $3, $4, $5)`,
    [id, input.orgId, input.slug, input.name, input.description ?? null],
  );
  await appendEvent(db, {
    orgId: input.orgId,
    projectId: id,
    actor: "system",
    subjectKind: "project",
    subjectId: id,
    verb: "created",
  });
  const rows = await db.query<ProjectRow>(`SELECT * FROM projects WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`project insert lost: ${id}`);
  return rows[0] as ProjectRow;
}

export async function createTask(
  db: ProductDb,
  input: {
    orgId: string;
    projectId?: string | null;
    parentId?: string | null;
    title: string;
    description?: string | null;
    status?: string;
    priority?: number;
  },
): Promise<TaskRow> {
  const id = newUlid();
  const status = input.status ?? "pending";
  const priority = input.priority ?? 0;
  await db.query(
    `INSERT INTO tasks (id, org_id, project_id, parent_id, title, description, status, priority)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      input.orgId,
      input.projectId ?? null,
      input.parentId ?? null,
      input.title,
      input.description ?? null,
      status,
      priority,
    ],
  );
  await appendEvent(db, {
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    actor: "system",
    subjectKind: "task",
    subjectId: id,
    verb: "created",
    payload: { title: input.title, status },
  });
  const rows = await db.query<TaskRow>(`SELECT * FROM tasks WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`task insert lost: ${id}`);
  return rows[0] as TaskRow;
}

export async function appendEvent(
  db: ProductDb,
  input: AppendEventInput,
): Promise<EventRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO events (id, org_id, project_id, actor, subject_kind, subject_id, verb, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      id,
      input.orgId,
      input.projectId ?? null,
      input.actor,
      input.subjectKind,
      input.subjectId,
      input.verb,
      JSON.stringify(input.payload ?? {}),
    ],
  );
  const rows = await db.query<EventRow>(`SELECT * FROM events WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`event insert lost: ${id}`);
  return rows[0] as EventRow;
}

export async function listEventsForProject(
  db: ProductDb,
  projectId: string,
): Promise<EventRow[]> {
  return db.query<EventRow>(
    `SELECT * FROM events WHERE project_id = $1 ORDER BY created_at ASC, id ASC`,
    [projectId],
  );
}

// ── Sprint CRUD ──────────────────────────────────────────────────────

export interface SprintRow {
  id: string;
  org_id: string;
  project_id: string;
  name: string;
  goal: string | null;
  status: string;
  capacity_points: number | null;
  start_date: string | null;
  end_date: string | null;
  closed_at: string | null;
  metrics_snapshot: Record<string, unknown> | null;
  retro_doc_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetricsSnapshot {
  capacity_points: number | null;
  completed_points: number;
  total_tasks: number;
  completed_tasks: number;
  velocity: number;
}

export async function createSprint(
  db: ProductDb,
  input: {
    orgId: string;
    projectId: string;
    name: string;
    goal?: string | null;
    status?: string;
    capacityPoints?: number | null;
    startDate?: string | null;
    endDate?: string | null;
  },
): Promise<SprintRow> {
  const id = newUlid();
  const status = input.status ?? "planning";
  await db.query(
    `INSERT INTO sprints (id, org_id, project_id, name, goal, status, capacity_points, start_date, end_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      input.orgId,
      input.projectId,
      input.name,
      input.goal ?? null,
      status,
      input.capacityPoints ?? null,
      input.startDate ?? null,
      input.endDate ?? null,
    ],
  );
  await appendEvent(db, {
    orgId: input.orgId,
    projectId: input.projectId,
    actor: "system",
    subjectKind: "sprint",
    subjectId: id,
    verb: "created",
    payload: { name: input.name, status },
  });
  const rows = await db.query<SprintRow>(`SELECT * FROM sprints WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`sprint insert lost: ${id}`);
  return rows[0] as SprintRow;
}

export async function listSprints(
  db: ProductDb,
  projectId: string,
): Promise<SprintRow[]> {
  return db.query<SprintRow>(
    `SELECT * FROM sprints WHERE project_id = $1 ORDER BY created_at DESC, id ASC`,
    [projectId],
  );
}

export async function addTaskToSprint(
  db: ProductDb,
  input: { sprintId: string; taskId: string },
): Promise<{ ok: true }> {
  // Verify sprint exists and get org/project for event
  const sprintRows = await db.query<SprintRow>(
    `SELECT * FROM sprints WHERE id = $1`,
    [input.sprintId],
  );
  const sprint = sprintRows[0];
  if (!sprint) throw new Error(`sprint not found: ${input.sprintId}`);

  const rows = await db.query<TaskRow>(
    `UPDATE tasks SET sprint_id = $1, updated_at = now()
       WHERE id = $2 RETURNING *`,
    [input.sprintId, input.taskId],
  );
  if (rows.length === 0) throw new Error(`task not found: ${input.taskId}`);
  await appendEvent(db, {
    orgId: sprint.org_id,
    projectId: sprint.project_id,
    actor: "system",
    subjectKind: "task",
    subjectId: input.taskId,
    verb: "added_to_sprint",
    payload: { sprintId: input.sprintId },
  });
  return { ok: true };
}

export async function removeTaskFromSprint(
  db: ProductDb,
  input: { sprintId: string; taskId: string },
): Promise<{ ok: true }> {
  const sprintRows = await db.query<SprintRow>(
    `SELECT * FROM sprints WHERE id = $1`,
    [input.sprintId],
  );
  const sprint = sprintRows[0];
  if (!sprint) throw new Error(`sprint not found: ${input.sprintId}`);

  const rows = await db.query<TaskRow>(
    `UPDATE tasks SET sprint_id = NULL, updated_at = now()
       WHERE id = $1 AND sprint_id = $2 RETURNING *`,
    [input.taskId, input.sprintId],
  );
  if (rows.length === 0) throw new Error(`task not in sprint: ${input.taskId}`);
  await appendEvent(db, {
    orgId: sprint.org_id,
    projectId: sprint.project_id,
    actor: "system",
    subjectKind: "task",
    subjectId: input.taskId,
    verb: "removed_from_sprint",
    payload: { sprintId: input.sprintId },
  });
  return { ok: true };
}

export async function listBacklogTasks(
  db: ProductDb,
  projectId: string,
): Promise<TaskRow[]> {
  return db.query<TaskRow>(
    `SELECT * FROM tasks
       WHERE project_id = $1
         AND sprint_id IS NULL
         AND status NOT IN ('completed', 'cancelled')
       ORDER BY priority DESC, updated_at DESC, id ASC`,
    [projectId],
  );
}

export async function listSprintTasks(
  db: ProductDb,
  sprintId: string,
): Promise<TaskRow[]> {
  return db.query<TaskRow>(
    `SELECT * FROM tasks
       WHERE sprint_id = $1
       ORDER BY priority DESC, updated_at DESC, id ASC`,
    [sprintId],
  );
}

export async function sprintCapacityUsed(
  db: ProductDb,
  sprintId: string,
): Promise<number> {
  const rows = await db.query<{ total: string | null }>(
    `SELECT COALESCE(SUM(estimate_points), 0) AS total FROM tasks WHERE sprint_id = $1`,
    [sprintId],
  );
  return Number(rows[0]?.total ?? 0);
}

// ── Sprint close ────────────────────────────────────────────────────

export interface CloseSprintResult {
  sprint: SprintRow;
  event: EventRow;
  metrics: MetricsSnapshot;
}

export async function closeSprint(
  db: ProductDb,
  sprintId: string,
): Promise<CloseSprintResult> {
  const sprintRows = await db.query<SprintRow>(
    `SELECT * FROM sprints WHERE id = $1`,
    [sprintId],
  );
  const sprint = sprintRows[0];
  if (!sprint) throw new Error(`sprint not found: ${sprintId}`);
  if (sprint.status === "completed") throw new Error(`sprint already closed: ${sprintId}`);

  // Compute metrics snapshot
  const tasks = await listSprintTasks(db, sprintId);
  const completedTasks = tasks.filter((t) => t.status === "completed");
  const completedPoints = completedTasks.reduce(
    (sum, t) => sum + (t.estimate_points ?? 0),
    0,
  );
  const metrics: MetricsSnapshot = {
    capacity_points: sprint.capacity_points,
    completed_points: completedPoints,
    total_tasks: tasks.length,
    completed_tasks: completedTasks.length,
    velocity: completedPoints,
  };

  await db.query(
    `UPDATE sprints SET status = 'completed', closed_at = now(),
       metrics_snapshot = $2::jsonb, updated_at = now()
     WHERE id = $1`,
    [sprintId, JSON.stringify(metrics)],
  );

  const event = await appendEvent(db, {
    orgId: sprint.org_id,
    projectId: sprint.project_id,
    actor: "system",
    subjectKind: "sprint",
    subjectId: sprintId,
    verb: "closed",
    payload: {
      name: sprint.name,
      goal: sprint.goal,
      start_date: sprint.start_date,
      end_date: sprint.end_date,
      metrics_snapshot: metrics,
    },
  });

  const updatedRows = await db.query<SprintRow>(
    `SELECT * FROM sprints WHERE id = $1`,
    [sprintId],
  );

  return { sprint: updatedRows[0] as SprintRow, event, metrics };
}

// ── Event handler dedup ─────────────────────────────────────────────

export async function checkEventHandled(
  db: ProductDb,
  eventId: string,
  handler: string,
): Promise<boolean> {
  const rows = await db.query<{ event_id: string }>(
    `SELECT event_id FROM event_handler_log WHERE event_id = $1 AND handler = $2`,
    [eventId, handler],
  );
  return rows.length > 0;
}

export async function markEventHandled(
  db: ProductDb,
  eventId: string,
  handler: string,
): Promise<void> {
  await db.query(
    `INSERT INTO event_handler_log (event_id, handler) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [eventId, handler],
  );
}

// ── Sprint retro doc link ───────────────────────────────────────────

export async function setSprintRetroDocId(
  db: ProductDb,
  sprintId: string,
  docId: string,
): Promise<void> {
  await db.query(
    `UPDATE sprints SET retro_doc_id = $2, updated_at = now() WHERE id = $1`,
    [sprintId, docId],
  );
}
