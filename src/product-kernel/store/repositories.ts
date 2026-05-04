import type { ProductDb } from "../db/types.ts";
import { newUlid } from "../ids.ts";
import { eventDispatcher } from "../event-dispatcher.ts";

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
  assignee_id: string | null;
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
  await eventDispatcher.dispatch(db, {
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
  await eventDispatcher.dispatch(db, {
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
  metrics_snapshot: MetricsSnapshot | null;
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
      input.capacityPoints ?? 0,
      input.startDate ?? null,
      input.endDate ?? null,
    ],
  );
  await eventDispatcher.dispatch(db, {
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

export async function updateSprint(
  db: ProductDb,
  input: {
    id: string;
    name?: string;
    goal?: string | null;
    status?: string;
    capacityPoints?: number | null;
    startDate?: string | null;
    endDate?: string | null;
  },
): Promise<SprintRow> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const push = (col: string, val: string | number | null) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (input.name !== undefined) push("name", input.name);
  if (input.goal !== undefined) push("goal", input.goal);
  if (input.status !== undefined) push("status", input.status);
  if (input.capacityPoints !== undefined) push("capacity_points", input.capacityPoints);
  if (input.startDate !== undefined) push("start_date", input.startDate);
  if (input.endDate !== undefined) push("end_date", input.endDate);
  if (sets.length === 0) throw new Error("updateSprint: no fields to update");
  sets.push("updated_at = now()");
  params.push(input.id);
  const rows = await db.query<SprintRow>(
    `UPDATE sprints SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  if (rows.length === 0) throw new Error(`sprint not found: ${input.id}`);
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
  const sprintRows = await db.query<SprintRow>(`SELECT * FROM sprints WHERE id = $1`, [
    input.sprintId,
  ]);
  const sprint = sprintRows[0];
  if (!sprint) throw new Error(`sprint not found: ${input.sprintId}`);

  const taskRows = await db.query<TaskRow>(`SELECT * FROM tasks WHERE id = $1`, [
    input.taskId,
  ]);
  const task = taskRows[0];
  if (!task) throw new Error(`task not found: ${input.taskId}`);
  if (task.org_id !== sprint.org_id || task.project_id !== sprint.project_id) {
    throw new Error(`task ${input.taskId} is outside sprint scope ${input.sprintId}`);
  }

  await db.query(
    `UPDATE tasks SET sprint_id = $1, updated_at = now()
      WHERE id = $2 AND org_id = $3 AND project_id = $4`,
    [sprint.id, task.id, sprint.org_id, sprint.project_id],
  );
  await eventDispatcher.dispatch(db, {
    orgId: sprint.org_id,
    projectId: sprint.project_id,
    actor: "system",
    subjectKind: "task",
    subjectId: task.id,
    verb: "sprint.added",
    payload: { sprint_id: sprint.id },
  });
  return { ok: true };
}

export async function removeTaskFromSprint(
  db: ProductDb,
  input: { sprintId: string; taskId: string },
): Promise<{ ok: true }> {
  const sprintRows = await db.query<SprintRow>(`SELECT * FROM sprints WHERE id = $1`, [
    input.sprintId,
  ]);
  const sprint = sprintRows[0];
  if (!sprint) throw new Error(`sprint not found: ${input.sprintId}`);

  const rows = await db.query<TaskRow>(
    `UPDATE tasks SET sprint_id = NULL, updated_at = now()
      WHERE id = $1 AND org_id = $2 AND project_id = $3 AND sprint_id = $4
      RETURNING *`,
    [input.taskId, sprint.org_id, sprint.project_id, sprint.id],
  );
  const task = rows[0];
  if (!task) throw new Error(`task not found in sprint: ${input.taskId}`);
  await eventDispatcher.dispatch(db, {
    orgId: sprint.org_id,
    projectId: sprint.project_id,
    actor: "system",
    subjectKind: "task",
    subjectId: task.id,
    verb: "sprint.removed",
    payload: { sprint_id: sprint.id },
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

export async function sprintCapacityUsed(db: ProductDb, sprintId: string): Promise<number> {
  const rows = await db.query<{ used: number | string | null }>(
    `SELECT COALESCE(SUM(estimate_points), 0) AS used
      FROM tasks
      WHERE sprint_id = $1`,
    [sprintId],
  );
  return Number(rows[0]?.used ?? 0);
}

export async function closeSprint(
  db: ProductDb,
  sprintId: string,
): Promise<{ sprint: SprintRow; metrics: MetricsSnapshot; event: EventRow }> {
  const sprintRows = await db.query<SprintRow>(`SELECT * FROM sprints WHERE id = $1`, [
    sprintId,
  ]);
  const sprint = sprintRows[0];
  if (!sprint) throw new Error(`sprint not found: ${sprintId}`);
  if (sprint.status === "completed") throw new Error(`sprint already closed: ${sprintId}`);

  const metricRows = await db.query<{
    completed_points: number | string | null;
    total_tasks: number | string;
    completed_tasks: number | string;
  }>(
    `SELECT
        COALESCE(SUM(CASE WHEN status = 'completed' THEN estimate_points ELSE 0 END), 0) AS completed_points,
        COUNT(*) AS total_tasks,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_tasks
      FROM tasks
      WHERE sprint_id = $1`,
    [sprint.id],
  );
  const metricRow = metricRows[0];
  const completedPoints = Number(metricRow?.completed_points ?? 0);
  const metrics: MetricsSnapshot = {
    capacity_points: sprint.capacity_points,
    completed_points: completedPoints,
    total_tasks: Number(metricRow?.total_tasks ?? 0),
    completed_tasks: Number(metricRow?.completed_tasks ?? 0),
    velocity: completedPoints,
  };

  const closedRows = await db.query<SprintRow>(
    `UPDATE sprints
      SET status = 'completed', closed_at = now(), metrics_snapshot = $1::jsonb, updated_at = now()
      WHERE id = $2 AND status <> 'completed'
      RETURNING *`,
    [JSON.stringify(metrics), sprint.id],
  );
  const closed = closedRows[0];
  if (!closed) throw new Error(`sprint already closed: ${sprintId}`);

  const event = await eventDispatcher.dispatch(db, {
    orgId: closed.org_id,
    projectId: closed.project_id,
    actor: "system",
    subjectKind: "sprint",
    subjectId: closed.id,
    verb: "closed",
    payload: {
      name: closed.name,
      goal: closed.goal,
      start_date: closed.start_date,
      end_date: closed.end_date,
      metrics_snapshot: metrics,
    },
  });
  return { sprint: closed, metrics, event };
}

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
    `INSERT INTO event_handler_log (event_id, handler)
      VALUES ($1, $2)
      ON CONFLICT (event_id, handler) DO NOTHING`,
    [eventId, handler],
  );
}

export async function setSprintRetroDocId(
  db: ProductDb,
  sprintId: string,
  docId: string,
): Promise<SprintRow> {
  const rows = await db.query<SprintRow>(
    `UPDATE sprints SET retro_doc_id = $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [docId, sprintId],
  );
  const sprint = rows[0];
  if (!sprint) throw new Error(`sprint not found: ${sprintId}`);
  return sprint;
}

export async function listTasks(
  db: ProductDb,
  filters: {
    projectId?: string;
    status?: string;
    sprintId?: string;
    assigneeId?: string;
    cursor?: string;
    limit?: number;
  },
): Promise<{ data: TaskRow[]; cursor: string | null }> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  const push = (cond: string, val: string | number) => {
    params.push(val);
    conditions.push(cond.replace("?", `$${params.length}`));
  };
  if (filters.projectId) push("project_id = ?", filters.projectId);
  if (filters.status) push("status = ?", filters.status);
  if (filters.sprintId) push("sprint_id = ?", filters.sprintId);
  if (filters.assigneeId) push("assignee_id = ?", filters.assigneeId);
  if (filters.cursor) push("id > ?", filters.cursor);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 50;
  params.push(limit + 1);
  const rows = await db.query<TaskRow>(
    `SELECT * FROM tasks ${where} ORDER BY id ASC LIMIT $${params.length}`,
    params,
  );
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const cursor = hasMore ? data[data.length - 1]!.id : null;
  return { data, cursor };
}

// ── Task mutations ──────────────────────────────────────────────────

export async function updateTask(
  db: ProductDb,
  input: {
    id: string;
    title?: string;
    description?: string | null;
    status?: string;
    priority?: number;
    sprintId?: string | null;
    assigneeId?: string | null;
  },
): Promise<TaskRow> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const push = (col: string, val: string | number | null) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (input.title !== undefined) push("title", input.title);
  if (input.description !== undefined) push("description", input.description);
  if (input.status !== undefined) push("status", input.status);
  if (input.priority !== undefined) push("priority", input.priority);
  if (input.sprintId !== undefined) push("sprint_id", input.sprintId);
  if (input.assigneeId !== undefined) push("assignee_id", input.assigneeId);
  if (sets.length === 0) throw new Error("updateTask: no fields to update");
  sets.push("updated_at = now()");
  params.push(input.id);
  const rows = await db.query<TaskRow>(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  if (rows.length === 0) throw new Error(`task not found: ${input.id}`);
  const task = rows[0] as TaskRow;
  await eventDispatcher.dispatch(db, {
    orgId: task.org_id,
    projectId: task.project_id,
    actor: "system",
    subjectKind: "task",
    subjectId: task.id,
    verb: "updated",
    payload: { ...input, id: undefined },
  });
  return task;
}

export async function moveTaskToSprint(
  db: ProductDb,
  taskId: string,
  sprintId: string | null,
): Promise<TaskRow> {
  return updateTask(db, { id: taskId, sprintId });
}

// ── Custom fields CRUD ──────────────────────────────────────────────

export interface CustomFieldRow {
  id: string;
  org_id: string;
  project_id: string;
  name: string;
  field_type: string;
  options: unknown;
  position: number;
  created_at: string;
  updated_at: string;
}

export async function listCustomFields(
  db: ProductDb,
  projectId: string,
): Promise<CustomFieldRow[]> {
  return db.query<CustomFieldRow>(
    `SELECT * FROM custom_fields WHERE project_id = $1 ORDER BY position ASC, id ASC`,
    [projectId],
  );
}

export async function createCustomField(
  db: ProductDb,
  input: {
    orgId: string;
    projectId: string;
    name: string;
    fieldType: string;
    options?: unknown[];
    position?: number;
  },
): Promise<CustomFieldRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO custom_fields (id, org_id, project_id, name, field_type, options, position)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      id,
      input.orgId,
      input.projectId,
      input.name,
      input.fieldType,
      JSON.stringify(input.options ?? []),
      input.position ?? 0,
    ],
  );
  const rows = await db.query<CustomFieldRow>(`SELECT * FROM custom_fields WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`custom_field insert lost: ${id}`);
  return rows[0] as CustomFieldRow;
}

// ── Saved views CRUD ────────────────────────────────────────────────

export interface SavedViewRow {
  id: string;
  org_id: string;
  project_id: string;
  name: string;
  filters: unknown;
  sort_by: string | null;
  columns: unknown;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export async function listSavedViews(
  db: ProductDb,
  projectId: string,
): Promise<SavedViewRow[]> {
  return db.query<SavedViewRow>(
    `SELECT * FROM saved_views WHERE project_id = $1 ORDER BY name ASC, id ASC`,
    [projectId],
  );
}

export async function createSavedView(
  db: ProductDb,
  input: {
    orgId: string;
    projectId: string;
    name: string;
    filters?: Record<string, unknown>;
    sortBy?: string | null;
    columns?: string[];
    isDefault?: boolean;
  },
): Promise<SavedViewRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO saved_views (id, org_id, project_id, name, filters, sort_by, columns, is_default)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8)`,
    [
      id,
      input.orgId,
      input.projectId,
      input.name,
      JSON.stringify(input.filters ?? {}),
      input.sortBy ?? null,
      JSON.stringify(input.columns ?? []),
      input.isDefault ?? false,
    ],
  );
  const rows = await db.query<SavedViewRow>(`SELECT * FROM saved_views WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`saved_view insert lost: ${id}`);
  return rows[0] as SavedViewRow;
}

// ── API Key helpers ──────────────────────────────────────────────────

export interface ApiKeyRow {
  id: string;
  org_id: string;
  user_id: string;
  key_hash: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export async function findApiKeyByHash(
  db: ProductDb,
  keyHash: string,
): Promise<ApiKeyRow | undefined> {
  const rows = await db.query<ApiKeyRow>(
    `UPDATE api_keys SET last_used_at = now() WHERE key_hash = $1 RETURNING *`,
    [keyHash],
  );
  return rows[0];
}
