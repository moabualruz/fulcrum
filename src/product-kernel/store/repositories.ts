/**
 * Product-kernel repository layer — MikroORM implementation.
 *
 * Migrated from raw SQL (db.query()) to MikroORM EntityManager + repository
 * pattern (ARCH-02). Functions accept DbHandle (EntityManager | ProductDb).
 *
 * Data contracts (Row interfaces, input types, return types) are preserved
 * for backward compatibility — callers receive plain row objects.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import type { ProductDb } from "../db/types.ts";
import { newUlid } from "../ids.ts";
import { Org } from "../../db/entities/auth/Org.ts";
import { Sprint, type MetricsSnapshot } from "../../db/entities/tasks/Sprint.ts";
import { Event } from "../../db/entities/core/Event.ts";

/**
 * Database handle — accepts either MikroORM EntityManager (preferred)
 * or legacy ProductDb interface for backward compatibility.
 */
export type DbHandle = EntityManager | ProductDb;

/** Type guard: is this an EntityManager? */
function isEntityManager(db: DbHandle): db is EntityManager {
  return "persist" in db && typeof (db as EntityManager).persist === "function";
}

/** Assert handle is EntityManager or throw helpful error. */
function assertEm(db: DbHandle): EntityManager {
  if (isEntityManager(db)) return db;
  throw new Error(
    "repositories.ts: MikroORM EntityManager required. " +
    "Pass em (from MikroORM) instead of raw ProductDb. " +
    "See ARCH-02 migration guide.",
  );
}

// ── Row interfaces (unchanged data contracts) ───────────────────────

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

export { type MetricsSnapshot };

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

export interface ApiKeyRow {
  id: string;
  org_id: string;
  user_id: string;
  key_hash: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

// ── Helpers ─────────────────────────────────────────────────────────

function toIso(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString();
  return d instanceof Date ? d.toISOString() : d;
}

function orgToRow(org: Org): OrgRow {
  return {
    id: org.id,
    slug: org.slug,
    name: org.name,
    created_at: toIso(org.createdAt),
    updated_at: toIso(org.updatedAt),
  };
}

function sprintToRow(sprint: Sprint): SprintRow {
  return {
    id: sprint.id,
    org_id: typeof sprint.org === "string" ? sprint.org : sprint.org?.id ?? "",
    project_id: sprint.projectId,
    name: sprint.name,
    goal: sprint.goal,
    status: sprint.status,
    capacity_points: sprint.capacityPoints,
    start_date: sprint.startDate ? toIso(sprint.startDate) : null,
    end_date: sprint.endDate ? toIso(sprint.endDate) : null,
    closed_at: sprint.closedAt ? toIso(sprint.closedAt) : null,
    metrics_snapshot: sprint.metricsSnapshot,
    retro_doc_id: sprint.retroDocId,
    created_at: toIso(sprint.createdAt),
    updated_at: toIso(sprint.updatedAt),
  };
}

function eventToRow(event: Event): EventRow {
  return {
    id: event.id,
    org_id: typeof event.org === "string" ? event.org : event.org?.id ?? "",
    project_id: event.projectId ?? null,
    actor: event.actor ?? "system",
    subject_kind: event.subjectKind,
    subject_id: event.subjectId ?? "",
    verb: event.verb,
    payload: event.payload ?? {},
    created_at: toIso(event.createdAt),
  };
}

/** Map a raw query row to TaskRow. */
function rawToTaskRow(r: Record<string, unknown>): TaskRow {
  return {
    id: r.id as string,
    org_id: r.org_id as string,
    project_id: (r.project_id as string) ?? null,
    parent_id: (r.parent_id as string) ?? null,
    title: r.title as string,
    description: (r.description as string) ?? null,
    status: (r.status as string) ?? "pending",
    priority: Number(r.priority ?? 0),
    sprint_id: (r.sprint_id as string) ?? null,
    assignee_id: (r.assignee_id as string) ?? null,
    created_at: toIso(r.created_at as Date | string),
    updated_at: toIso(r.updated_at as Date | string),
  };
}

// ── Org CRUD ────────────────────────────────────────────────────────

export async function createLocalOrg(
  db: DbHandle,
  input: { slug: string; name: string },
): Promise<OrgRow> {
  const em = assertEm(db);
  const id = newUlid();
  const repo = em.getRepository(Org);
  const org = repo.create({
    id,
    slug: input.slug,
    name: input.name,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  em.persist(org);
  await em.flush();
  return orgToRow(org);
}

// ── Project CRUD ────────────────────────────────────────────────────

export async function createProject(
  db: DbHandle,
  input: { orgId: string; slug: string; name: string; description?: string | null },
): Promise<ProjectRow> {
  const em = assertEm(db);
  const id = newUlid();
  const now = new Date();
  await em.execute(
    `INSERT INTO projects (id, org_id, slug, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.orgId, input.slug, input.name, input.description ?? null, now, now],
  );
  await appendEvent(em, {
    orgId: input.orgId,
    projectId: id,
    actor: "system",
    subjectKind: "project",
    subjectId: id,
    verb: "created",
  });
  const rows = await em.execute<{ id: string; org_id: string; slug: string; name: string; description: string | null; created_at: Date; updated_at: Date }[]>(
    `SELECT * FROM projects WHERE id = ?`,
    [id],
    "all",
  );
  if (rows.length === 0) throw new Error(`project insert lost: ${id}`);
  const r = rows[0]!;
  return {
    id: r.id,
    org_id: r.org_id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    created_at: toIso(r.created_at),
    updated_at: toIso(r.updated_at),
  };
}

// ── Task CRUD ───────────────────────────────────────────────────────

export async function createTask(
  db: DbHandle,
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
  const em = assertEm(db);
  const id = newUlid();
  const status = input.status ?? "pending";
  const priority = input.priority ?? 0;
  const now = new Date();

  await em.execute(
    `INSERT INTO tasks (id, org_id, project_id, parent_id, title, description, status, priority, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.orgId, input.projectId ?? null, input.parentId ?? null, input.title, input.description ?? null, status, priority, now, now],
  );

  await appendEvent(em, {
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    actor: "system",
    subjectKind: "task",
    subjectId: id,
    verb: "created",
    payload: { title: input.title, status },
  });

  const rows = await em.execute<Record<string, unknown>[]>(
    `SELECT * FROM tasks WHERE id = ?`, [id], "all",
  );
  if (rows.length === 0) throw new Error(`task insert lost: ${id}`);
  return rawToTaskRow(rows[0]!);
}

// ── Event CRUD ──────────────────────────────────────────────────────

export async function appendEvent(
  db: DbHandle,
  input: AppendEventInput,
): Promise<EventRow> {
  const em = assertEm(db);
  const id = newUlid();
  const repo = em.getRepository(Event);
  const event = repo.create({
    id,
    org: em.getReference(Org, input.orgId),
    projectId: input.projectId ?? undefined,
    actor: input.actor,
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    verb: input.verb,
    payload: input.payload ?? {},
    createdAt: new Date(),
  });
  em.persist(event);
  await em.flush();
  return eventToRow(event);
}

export async function listEventsForProject(
  db: DbHandle,
  projectId: string,
): Promise<EventRow[]> {
  const em = assertEm(db);
  const repo = em.getRepository(Event);
  const events = await repo.find(
    { projectId } as never,
    { orderBy: { createdAt: "ASC", id: "ASC" } },
  );
  return events.map(eventToRow);
}

// ── Sprint CRUD ─────────────────────────────────────────────────────

export async function createSprint(
  db: DbHandle,
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
  const em = assertEm(db);
  const id = newUlid();
  const status = input.status ?? "planning";
  const now = new Date();

  const repo = em.getRepository(Sprint);
  const sprint = repo.create({
    id,
    org: em.getReference(Org, input.orgId),
    projectId: input.projectId,
    name: input.name,
    goal: input.goal ?? null,
    status: status as "planned" | "active" | "completed",
    capacityPoints: input.capacityPoints ?? 0,
    startDate: input.startDate ? new Date(input.startDate) : now,
    endDate: input.endDate ? new Date(input.endDate) : now,
    createdAt: now,
    updatedAt: now,
  });
  em.persist(sprint);
  await em.flush();

  await appendEvent(em, {
    orgId: input.orgId,
    projectId: input.projectId,
    actor: "system",
    subjectKind: "sprint",
    subjectId: id,
    verb: "created",
    payload: { name: input.name, status },
  });

  return sprintToRow(sprint);
}

export async function updateSprint(
  db: DbHandle,
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
  const em = assertEm(db);
  const repo = em.getRepository(Sprint);
  const sprint = await repo.findOne({ id: input.id });
  if (!sprint) throw new Error(`sprint not found: ${input.id}`);

  if (input.name !== undefined) sprint.name = input.name;
  if (input.goal !== undefined) sprint.goal = input.goal;
  if (input.status !== undefined) sprint.status = input.status as "planned" | "active" | "completed";
  if (input.capacityPoints !== undefined) sprint.capacityPoints = input.capacityPoints;
  if (input.startDate !== undefined) sprint.startDate = input.startDate ? new Date(input.startDate) : sprint.startDate;
  if (input.endDate !== undefined) sprint.endDate = input.endDate ? new Date(input.endDate) : sprint.endDate;
  sprint.updatedAt = new Date();

  await em.flush();
  return sprintToRow(sprint);
}

export async function listSprints(
  db: DbHandle,
  projectId: string,
): Promise<SprintRow[]> {
  const em = assertEm(db);
  const repo = em.getRepository(Sprint);
  const sprints = await repo.find(
    { projectId },
    { orderBy: { createdAt: "DESC", id: "ASC" } },
  );
  return sprints.map(sprintToRow);
}

export async function addTaskToSprint(
  db: DbHandle,
  input: { sprintId: string; taskId: string },
): Promise<{ ok: true }> {
  const em = assertEm(db);
  const sprintRepo = em.getRepository(Sprint);
  const sprint = await sprintRepo.findOne({ id: input.sprintId });
  if (!sprint) throw new Error(`sprint not found: ${input.sprintId}`);

  const orgId = typeof sprint.org === "string" ? sprint.org : sprint.org?.id ?? "";

  const taskRows = await em.execute<Record<string, unknown>[]>(
    `SELECT * FROM tasks WHERE id = ?`, [input.taskId], "all",
  );
  const task = taskRows[0];
  if (!task) throw new Error(`task not found: ${input.taskId}`);
  if (task.org_id !== orgId || task.project_id !== sprint.projectId) {
    throw new Error(`task ${input.taskId} is outside sprint scope ${input.sprintId}`);
  }

  await em.execute(
    `UPDATE tasks SET sprint_id = ?, updated_at = now()
      WHERE id = ? AND org_id = ? AND project_id = ?`,
    [sprint.id, input.taskId, orgId, sprint.projectId],
  );

  await appendEvent(em, {
    orgId,
    projectId: sprint.projectId,
    actor: "system",
    subjectKind: "task",
    subjectId: input.taskId,
    verb: "sprint.added",
    payload: { sprint_id: sprint.id },
  });
  return { ok: true };
}

export async function removeTaskFromSprint(
  db: DbHandle,
  input: { sprintId: string; taskId: string },
): Promise<{ ok: true }> {
  const em = assertEm(db);
  const sprintRepo = em.getRepository(Sprint);
  const sprint = await sprintRepo.findOne({ id: input.sprintId });
  if (!sprint) throw new Error(`sprint not found: ${input.sprintId}`);

  const orgId = typeof sprint.org === "string" ? sprint.org : sprint.org?.id ?? "";

  const rows = await em.execute<Record<string, unknown>[]>(
    `UPDATE tasks SET sprint_id = NULL, updated_at = now()
      WHERE id = ? AND org_id = ? AND project_id = ? AND sprint_id = ?
      RETURNING *`,
    [input.taskId, orgId, sprint.projectId, sprint.id],
    "all",
  );
  if (rows.length === 0) throw new Error(`task not found in sprint: ${input.taskId}`);

  await appendEvent(em, {
    orgId,
    projectId: sprint.projectId,
    actor: "system",
    subjectKind: "task",
    subjectId: input.taskId,
    verb: "sprint.removed",
    payload: { sprint_id: sprint.id },
  });
  return { ok: true };
}

export async function listBacklogTasks(
  db: DbHandle,
  projectId: string,
): Promise<TaskRow[]> {
  const em = assertEm(db);
  const rows = await em.execute<Record<string, unknown>[]>(
    `SELECT * FROM tasks
      WHERE project_id = ?
        AND sprint_id IS NULL
        AND status NOT IN ('completed', 'cancelled')
      ORDER BY priority DESC, updated_at DESC, id ASC`,
    [projectId],
    "all",
  );
  return rows.map(rawToTaskRow);
}

export async function listSprintTasks(
  db: DbHandle,
  sprintId: string,
): Promise<TaskRow[]> {
  const em = assertEm(db);
  const rows = await em.execute<Record<string, unknown>[]>(
    `SELECT * FROM tasks
      WHERE sprint_id = ?
      ORDER BY priority DESC, updated_at DESC, id ASC`,
    [sprintId],
    "all",
  );
  return rows.map(rawToTaskRow);
}

export async function sprintCapacityUsed(db: DbHandle, sprintId: string): Promise<number> {
  const em = assertEm(db);
  const rows = await em.execute<{ used: number | string | null }[]>(
    `SELECT COALESCE(SUM(points), 0) AS used FROM tasks WHERE sprint_id = ?`,
    [sprintId],
    "all",
  );
  return Number(rows[0]?.used ?? 0);
}

export async function closeSprint(
  db: DbHandle,
  sprintId: string,
): Promise<{ sprint: SprintRow; metrics: MetricsSnapshot; event: EventRow }> {
  const em = assertEm(db);
  const repo = em.getRepository(Sprint);
  const sprint = await repo.findOne({ id: sprintId });
  if (!sprint) throw new Error(`sprint not found: ${sprintId}`);
  if (sprint.status === "completed") throw new Error(`sprint already closed: ${sprintId}`);

  const metricRows = await em.execute<{
    completed_points: number | string | null;
    total_tasks: number | string;
    completed_tasks: number | string;
  }[]>(
    `SELECT
        COALESCE(SUM(CASE WHEN status = 'completed' THEN points ELSE 0 END), 0) AS completed_points,
        COUNT(*) AS total_tasks,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_tasks
      FROM tasks
      WHERE sprint_id = ?`,
    [sprint.id],
    "all",
  );
  const metricRow = metricRows[0];
  const completedPoints = Number(metricRow?.completed_points ?? 0);
  const metrics: MetricsSnapshot = {
    capacity_points: sprint.capacityPoints,
    completed_points: completedPoints,
    total_tasks: Number(metricRow?.total_tasks ?? 0),
    completed_tasks: Number(metricRow?.completed_tasks ?? 0),
    velocity: completedPoints,
  };

  sprint.status = "completed";
  sprint.closedAt = new Date();
  sprint.metricsSnapshot = metrics;
  sprint.updatedAt = new Date();
  await em.flush();

  const orgId = typeof sprint.org === "string" ? sprint.org : sprint.org?.id ?? "";
  const event = await appendEvent(em, {
    orgId,
    projectId: sprint.projectId,
    actor: "system",
    subjectKind: "sprint",
    subjectId: sprint.id,
    verb: "closed",
    payload: {
      name: sprint.name,
      goal: sprint.goal,
      start_date: sprint.startDate ? toIso(sprint.startDate) : null,
      end_date: sprint.endDate ? toIso(sprint.endDate) : null,
      metrics_snapshot: metrics,
    },
  });

  return { sprint: sprintToRow(sprint), metrics, event };
}

export async function checkEventHandled(
  db: DbHandle,
  eventId: string,
  handler: string,
): Promise<boolean> {
  const em = assertEm(db);
  const rows = await em.execute<{ event_id: string }[]>(
    `SELECT event_id FROM event_handler_log WHERE event_id = ? AND handler = ?`,
    [eventId, handler],
    "all",
  );
  return rows.length > 0;
}

export async function markEventHandled(
  db: DbHandle,
  eventId: string,
  handler: string,
): Promise<void> {
  const em = assertEm(db);
  await em.execute(
    `INSERT INTO event_handler_log (event_id, handler)
      VALUES (?, ?)
      ON CONFLICT (event_id, handler) DO NOTHING`,
    [eventId, handler],
  );
}

export async function setSprintRetroDocId(
  db: DbHandle,
  sprintId: string,
  docId: string,
): Promise<SprintRow> {
  const em = assertEm(db);
  const repo = em.getRepository(Sprint);
  const sprint = await repo.findOne({ id: sprintId });
  if (!sprint) throw new Error(`sprint not found: ${sprintId}`);
  sprint.retroDocId = docId;
  sprint.updatedAt = new Date();
  await em.flush();
  return sprintToRow(sprint);
}

export async function listTasks(
  db: DbHandle,
  filters: {
    projectId?: string;
    status?: string;
    sprintId?: string;
    assigneeId?: string;
    cursor?: string;
    limit?: number;
  },
): Promise<{ data: TaskRow[]; cursor: string | null }> {
  const em = assertEm(db);
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
  const rows = await em.execute<Record<string, unknown>[]>(
    `SELECT * FROM tasks ${where} ORDER BY id ASC LIMIT $${params.length}`,
    params,
    "all",
  );
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const cursor = hasMore ? (data[data.length - 1]! as Record<string, unknown>).id as string : null;
  return { data: data.map(rawToTaskRow), cursor };
}

// ── Task mutations ──────────────────────────────────────────────────

export async function updateTask(
  db: DbHandle,
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
  const em = assertEm(db);
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
  const rows = await em.execute<Record<string, unknown>[]>(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params,
    "all",
  );
  if (rows.length === 0) throw new Error(`task not found: ${input.id}`);
  const task = rawToTaskRow(rows[0]!);

  await appendEvent(em, {
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
  db: DbHandle,
  taskId: string,
  sprintId: string | null,
): Promise<TaskRow> {
  return updateTask(db, { id: taskId, sprintId });
}

// ── Custom fields CRUD ──────────────────────────────────────────────

export async function listCustomFields(
  db: DbHandle,
  projectId: string,
): Promise<CustomFieldRow[]> {
  const em = assertEm(db);
  const rows = await em.execute<Record<string, unknown>[]>(
    `SELECT * FROM custom_fields WHERE project_id = ? ORDER BY position ASC, id ASC`,
    [projectId],
    "all",
  );
  return rows.map((r) => ({
    id: r.id as string,
    org_id: r.org_id as string,
    project_id: r.project_id as string,
    name: r.name as string,
    field_type: r.field_type as string,
    options: r.options,
    position: r.position as number,
    created_at: toIso(r.created_at as Date | string),
    updated_at: toIso(r.updated_at as Date | string),
  }));
}

export async function createCustomField(
  db: DbHandle,
  input: {
    orgId: string;
    projectId: string;
    name: string;
    fieldType: string;
    options?: unknown[];
    position?: number;
  },
): Promise<CustomFieldRow> {
  const em = assertEm(db);
  const id = newUlid();
  await em.execute(
    `INSERT INTO custom_fields (id, org_id, project_id, name, field_type, options, position)
     VALUES (?, ?, ?, ?, ?, ?::jsonb, ?)`,
    [id, input.orgId, input.projectId, input.name, input.fieldType, JSON.stringify(input.options ?? []), input.position ?? 0],
  );
  const rows = await em.execute<Record<string, unknown>[]>(
    `SELECT * FROM custom_fields WHERE id = ?`, [id], "all",
  );
  if (rows.length === 0) throw new Error(`custom_field insert lost: ${id}`);
  const r = rows[0]!;
  return {
    id: r.id as string,
    org_id: r.org_id as string,
    project_id: r.project_id as string,
    name: r.name as string,
    field_type: r.field_type as string,
    options: r.options,
    position: r.position as number,
    created_at: toIso(r.created_at as Date | string),
    updated_at: toIso(r.updated_at as Date | string),
  };
}

// ── Saved views CRUD ────────────────────────────────────────────────

export async function listSavedViews(
  db: DbHandle,
  projectId: string,
): Promise<SavedViewRow[]> {
  const em = assertEm(db);
  const rows = await em.execute<Record<string, unknown>[]>(
    `SELECT * FROM saved_views WHERE project_id = ? ORDER BY name ASC, id ASC`,
    [projectId],
    "all",
  );
  return rows.map((r) => ({
    id: r.id as string,
    org_id: r.org_id as string,
    project_id: r.project_id as string,
    name: r.name as string,
    filters: r.filters,
    sort_by: (r.sort_by as string) ?? null,
    columns: r.columns,
    is_default: r.is_default as boolean,
    created_at: toIso(r.created_at as Date | string),
    updated_at: toIso(r.updated_at as Date | string),
  }));
}

export async function createSavedView(
  db: DbHandle,
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
  const em = assertEm(db);
  const id = newUlid();
  await em.execute(
    `INSERT INTO saved_views (id, org_id, project_id, name, filters, sort_by, columns, is_default)
     VALUES (?, ?, ?, ?, ?::jsonb, ?, ?::jsonb, ?)`,
    [id, input.orgId, input.projectId, input.name, JSON.stringify(input.filters ?? {}), input.sortBy ?? null, JSON.stringify(input.columns ?? []), input.isDefault ?? false],
  );
  const rows = await em.execute<Record<string, unknown>[]>(
    `SELECT * FROM saved_views WHERE id = ?`, [id], "all",
  );
  if (rows.length === 0) throw new Error(`saved_view insert lost: ${id}`);
  const r = rows[0]!;
  return {
    id: r.id as string,
    org_id: r.org_id as string,
    project_id: r.project_id as string,
    name: r.name as string,
    filters: r.filters,
    sort_by: (r.sort_by as string) ?? null,
    columns: r.columns,
    is_default: r.is_default as boolean,
    created_at: toIso(r.created_at as Date | string),
    updated_at: toIso(r.updated_at as Date | string),
  };
}

// ── API Key helpers ─────────────────────────────────────────────────

export async function findApiKeyByHash(
  db: DbHandle,
  keyHash: string,
): Promise<ApiKeyRow | undefined> {
  const em = assertEm(db);
  const rows = await em.execute<Record<string, unknown>[]>(
    `UPDATE api_keys SET last_used_at = now() WHERE key_hash = ? RETURNING *`,
    [keyHash],
    "all",
  );
  if (rows.length === 0) return undefined;
  const r = rows[0]!;
  return {
    id: r.id as string,
    org_id: r.org_id as string,
    user_id: r.user_id as string,
    key_hash: r.key_hash as string,
    name: r.name as string,
    created_at: toIso(r.created_at as Date | string),
    last_used_at: r.last_used_at ? toIso(r.last_used_at as Date | string) : null,
  };
}
