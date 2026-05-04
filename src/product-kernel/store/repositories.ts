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
import { eventDispatcher } from "../event-dispatcher.ts";

/**
 * Database handle — accepts either MikroORM EntityManager (preferred)
 * or legacy ProductDb interface for backward compatibility.
 */
export type DbHandle = EntityManager | ProductDb;

/** Type guard: is this an EntityManager? */
function isEntityManager(db: DbHandle): db is EntityManager {
  return "persist" in db && typeof (db as EntityManager).persist === "function";
}

function isProductDb(db: DbHandle): db is ProductDb {
  return "query" in db && typeof (db as ProductDb).query === "function";
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

export interface RepoRow {
  id: string;
  org_id: string;
  project_id: string | null;
  slug: string;
  name: string | null;
  kind: string;
  remote_url: string | null;
  local_path: string | null;
  current_branch: string | null;
  sync_status: string | null;
  created_at: string;
  updated_at: string;
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

function rawToSprintRow(r: Record<string, unknown>): SprintRow {
  return {
    id: r.id as string,
    org_id: r.org_id as string,
    project_id: r.project_id as string,
    name: r.name as string,
    goal: (r.goal as string) ?? null,
    status: r.status as string,
    capacity_points: (r.capacity_points as number) ?? null,
    start_date: r.start_date ? toIso(r.start_date as Date | string) : null,
    end_date: r.end_date ? toIso(r.end_date as Date | string) : null,
    closed_at: r.closed_at ? toIso(r.closed_at as Date | string) : null,
    metrics_snapshot: (r.metrics_snapshot as MetricsSnapshot) ?? null,
    retro_doc_id: (r.retro_doc_id as string) ?? null,
    created_at: toIso(r.created_at as Date | string),
    updated_at: toIso(r.updated_at as Date | string),
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

function rawToEventRow(r: Record<string, unknown>): EventRow {
  return {
    id: r.id as string,
    org_id: r.org_id as string,
    project_id: (r.project_id as string) ?? null,
    actor: (r.actor as string) ?? "system",
    subject_kind: r.subject_kind as string,
    subject_id: r.subject_id as string,
    verb: r.verb as string,
    payload: (r.payload as Record<string, unknown>) ?? {},
    created_at: toIso(r.created_at as Date | string),
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

function rawToCustomFieldRow(r: Record<string, unknown>): CustomFieldRow {
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

function rawToSavedViewRow(r: Record<string, unknown>): SavedViewRow {
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

function rawToRepoRow(r: Record<string, unknown>): RepoRow {
  return {
    id: r.id as string,
    org_id: r.org_id as string,
    project_id: (r.project_id as string) ?? null,
    slug: r.slug as string,
    name: (r.name as string) ?? null,
    kind: (r.kind as string) ?? "local",
    remote_url: (r.remote_url as string) ?? null,
    local_path: (r.local_path as string) ?? null,
    current_branch: (r.current_branch as string) ?? null,
    sync_status: (r.sync_status as string) ?? "idle",
    created_at: toIso(r.created_at as Date | string),
    updated_at: toIso(r.updated_at as Date | string),
  };
}

// ── Org CRUD ────────────────────────────────────────────────────────

export async function createLocalOrg(
  db: DbHandle,
  input: { slug: string; name: string },
): Promise<OrgRow> {
  if (isProductDb(db)) {
    const id = newUlid();
    const rows = await db.query<Record<string, unknown>>(
      `INSERT INTO orgs (id, slug, name, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now())
       RETURNING *`,
      [id, input.slug, input.name],
    );
    const row = rows[0]!;
    return {
      id: row.id as string,
      slug: row.slug as string,
      name: row.name as string,
      created_at: toIso(row.created_at as Date | string),
      updated_at: toIso(row.updated_at as Date | string),
    };
  }
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
  if (isProductDb(db)) {
    const id = newUlid();
    const rows = await db.query<Record<string, unknown>>(
      `INSERT INTO projects (id, org_id, slug, name, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, now(), now())
       RETURNING *`,
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
    const r = rows[0]!;
    return {
      id: r.id as string,
      org_id: r.org_id as string,
      slug: r.slug as string,
      name: r.name as string,
      description: (r.description as string) ?? null,
      created_at: toIso(r.created_at as Date | string),
      updated_at: toIso(r.updated_at as Date | string),
    };
  }
  const em = assertEm(db);
  const id = newUlid();
  const now = new Date();
  await em.execute(
    `INSERT INTO projects (id, org_id, slug, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.orgId, input.slug, input.name, input.description ?? null, now, now],
  );
  await eventDispatcher.dispatch(em, {
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
  if (isProductDb(db)) {
    const id = newUlid();
    const rows = await db.query<Record<string, unknown>>(
      `INSERT INTO tasks (id, org_id, project_id, parent_id, title, description, status, priority, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
       RETURNING *`,
      [
        id,
        input.orgId,
        input.projectId ?? null,
        input.parentId ?? null,
        input.title,
        input.description ?? null,
        input.status ?? "pending",
        input.priority ?? 0,
      ],
    );
    await eventDispatcher.dispatch(db, {
      orgId: input.orgId,
      projectId: input.projectId ?? null,
      actor: "system",
      subjectKind: "task",
      subjectId: id,
      verb: "created",
      payload: { title: input.title, status: input.status ?? "pending" },
    });
    return rawToTaskRow(rows[0]!);
  }
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

  await eventDispatcher.dispatch(em, {
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
  if (isProductDb(db)) {
    const id = newUlid();
    const rows = await db.query<Record<string, unknown>>(
      `INSERT INTO events (id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
       RETURNING *`,
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
    return rawToEventRow(rows[0]!);
  }
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
  if (isProductDb(db)) {
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM events WHERE project_id = $1 ORDER BY created_at ASC, id ASC`,
      [projectId],
    );
    return rows.map(rawToEventRow);
  }
  const em = assertEm(db);
  const repo = em.getRepository(Event);
  const events = await repo.find(
    { projectId } as never,
    { orderBy: { createdAt: "ASC", id: "ASC" } },
  );
  return events.map(eventToRow);
}

export async function listEventsFiltered(
  db: DbHandle,
  filters: {
    orgId: string;
    projectId?: string | null;
    subjectKind?: string | null;
    verb?: string | null;
    actorId?: string | null;
    limit?: number;
  },
): Promise<EventRow[]> {
  const conditions = ["org_id = ?"];
  const params: (string | number)[] = [filters.orgId];
  const push = (condition: string, value: string | number) => {
    params.push(value);
    conditions.push(condition);
  };
  if (filters.projectId) push("project_id = ?", filters.projectId);
  if (filters.subjectKind) push("subject_kind = ?", filters.subjectKind);
  if (filters.verb) push("verb = ?", filters.verb);
  if (filters.actorId) push("actor = ?", filters.actorId);
  const limit = filters.limit ?? 20;
  params.push(limit);

  if (isProductDb(db)) {
    let i = 0;
    const where = conditions.map((condition) => condition.replace("?", `$${++i}`)).join(" AND ");
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM events WHERE ${where} ORDER BY created_at DESC, id ASC LIMIT $${++i}`,
      params,
    );
    return rows.map(rawToEventRow);
  }

  const em = assertEm(db);
  const rows = await em.execute<Record<string, unknown>[]>(
    `SELECT * FROM events WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC, id ASC LIMIT ?`,
    params,
    "all",
  );
  return rows.map(rawToEventRow);
}

export async function listReposForProject(
  db: DbHandle,
  projectId: string,
  orgId: string,
): Promise<RepoRow[]> {
  const sql = `SELECT id, org_id, project_id, slug, name, kind, remote_url, local_path, current_branch,
                     sync_status, created_at, updated_at
                FROM repos
               WHERE project_id = ? AND org_id = ?
               ORDER BY last_touched_at DESC, id ASC`;
  if (isProductDb(db)) {
    const rows = await db.query<Record<string, unknown>>(sql.replace("?", "$1").replace("?", "$2"), [projectId, orgId]);
    return rows.map(rawToRepoRow);
  }
  const em = assertEm(db);
  const rows = await em.execute<Record<string, unknown>[]>(sql, [projectId, orgId], "all");
  return rows.map(rawToRepoRow);
}

export async function linkRepoToProject(db: DbHandle, repoId: string, projectId: string): Promise<{ ok: true }> {
  if (isProductDb(db)) {
    await db.query(`UPDATE repos SET project_id = $1, updated_at = now() WHERE id = $2`, [projectId, repoId]);
    return { ok: true };
  }
  const em = assertEm(db);
  await em.execute(`UPDATE repos SET project_id = ?, updated_at = now() WHERE id = ?`, [projectId, repoId]);
  return { ok: true };
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
  if (isProductDb(db)) {
    const id = newUlid();
    const status = input.status ?? "planning";
    const rows = await db.query<Record<string, unknown>>(
      `INSERT INTO sprints (id, org_id, project_id, name, goal, status, capacity_points, start_date, end_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
       RETURNING *`,
      [
        id,
        input.orgId,
        input.projectId,
        input.name,
        input.goal ?? null,
        status,
        input.capacityPoints ?? 0,
        input.startDate ?? new Date().toISOString().slice(0, 10),
        input.endDate ?? new Date().toISOString().slice(0, 10),
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
    return rawToSprintRow(rows[0]!);
  }
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

  await eventDispatcher.dispatch(em, {
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
  if (isProductDb(db)) {
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
    sets.push("updated_at = now()");
    params.push(input.id);
    const rows = await db.query<Record<string, unknown>>(
      `UPDATE sprints SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    if (rows.length === 0) throw new Error(`sprint not found: ${input.id}`);
    return rawToSprintRow(rows[0]!);
  }
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
  if (isProductDb(db)) {
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM sprints WHERE project_id = $1 ORDER BY created_at DESC, id ASC`,
      [projectId],
    );
    return rows.map(rawToSprintRow);
  }
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
  if (isProductDb(db)) {
    const sprints = await db.query<Record<string, unknown>>(`SELECT * FROM sprints WHERE id = $1`, [input.sprintId]);
    const sprint = sprints[0];
    if (!sprint) throw new Error(`sprint not found: ${input.sprintId}`);
    const tasks = await db.query<Record<string, unknown>>(`SELECT * FROM tasks WHERE id = $1`, [input.taskId]);
    const task = tasks[0];
    if (!task) throw new Error(`task not found: ${input.taskId}`);
    if (task.org_id !== sprint.org_id || task.project_id !== sprint.project_id) {
      throw new Error(`task ${input.taskId} is outside sprint scope ${input.sprintId}`);
    }
    await db.query(
      `UPDATE tasks SET sprint_id = $1, updated_at = now()
       WHERE id = $2 AND org_id = $3 AND project_id = $4`,
      [input.sprintId, input.taskId, sprint.org_id as string, sprint.project_id as string],
    );
    await eventDispatcher.dispatch(db, {
      orgId: sprint.org_id as string,
      projectId: sprint.project_id as string,
      actor: "system",
      subjectKind: "task",
      subjectId: input.taskId,
      verb: "sprint.added",
      payload: { sprint_id: input.sprintId },
    });
    return { ok: true };
  }
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

  await eventDispatcher.dispatch(em, {
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
  if (isProductDb(db)) {
    const sprints = await db.query<Record<string, unknown>>(`SELECT * FROM sprints WHERE id = $1`, [input.sprintId]);
    const sprint = sprints[0];
    if (!sprint) throw new Error(`sprint not found: ${input.sprintId}`);
    const rows = await db.query<Record<string, unknown>>(
      `UPDATE tasks SET sprint_id = NULL, updated_at = now()
       WHERE id = $1 AND org_id = $2 AND project_id = $3 AND sprint_id = $4
       RETURNING *`,
      [input.taskId, sprint.org_id as string, sprint.project_id as string, input.sprintId],
    );
    if (rows.length === 0) throw new Error(`task not found in sprint: ${input.taskId}`);
    await eventDispatcher.dispatch(db, {
      orgId: sprint.org_id as string,
      projectId: sprint.project_id as string,
      actor: "system",
      subjectKind: "task",
      subjectId: input.taskId,
      verb: "sprint.removed",
      payload: { sprint_id: input.sprintId },
    });
    return { ok: true };
  }
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

  await eventDispatcher.dispatch(em, {
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
  if (isProductDb(db)) {
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM tasks
       WHERE project_id = $1
         AND sprint_id IS NULL
         AND status NOT IN ('completed', 'cancelled')
       ORDER BY priority DESC, updated_at DESC, id ASC`,
      [projectId],
    );
    return rows.map(rawToTaskRow);
  }
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
  if (isProductDb(db)) {
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM tasks WHERE sprint_id = $1 ORDER BY priority DESC, updated_at DESC, id ASC`,
      [sprintId],
    );
    return rows.map(rawToTaskRow);
  }
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
  if (isProductDb(db)) {
    const rows = await db.query<{ used: number | string | null }>(
      `SELECT COALESCE(SUM(estimate_points), 0) AS used FROM tasks WHERE sprint_id = $1`,
      [sprintId],
    );
    return Number(rows[0]?.used ?? 0);
  }
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
  if (isProductDb(db)) {
    const sprints = await db.query<Record<string, unknown>>(`SELECT * FROM sprints WHERE id = $1`, [sprintId]);
    const sprint = sprints[0];
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
      [sprintId],
    );
    const metricRow = metricRows[0];
    const completedPoints = Number(metricRow?.completed_points ?? 0);
    const metrics: MetricsSnapshot = {
      capacity_points: (sprint.capacity_points as number | null) ?? 0,
      completed_points: completedPoints,
      total_tasks: Number(metricRow?.total_tasks ?? 0),
      completed_tasks: Number(metricRow?.completed_tasks ?? 0),
      velocity: completedPoints,
    };
    const updated = await db.query<Record<string, unknown>>(
      `UPDATE sprints
       SET status = 'completed', closed_at = now(), metrics_snapshot = $1::jsonb, updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(metrics), sprintId],
    );
    const event = await eventDispatcher.dispatch(db, {
      orgId: sprint.org_id as string,
      projectId: sprint.project_id as string,
      actor: "system",
      subjectKind: "sprint",
      subjectId: sprintId,
      verb: "closed",
      payload: {
        name: sprint.name as string,
        goal: (sprint.goal as string) ?? null,
        start_date: sprint.start_date ? toIso(sprint.start_date as Date | string) : null,
        end_date: sprint.end_date ? toIso(sprint.end_date as Date | string) : null,
        metrics_snapshot: metrics,
      },
    });
    return { sprint: rawToSprintRow(updated[0]!), metrics, event };
  }
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
  const event = await eventDispatcher.dispatch(em, {
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
  if (isProductDb(db)) {
    const rows = await db.query<{ event_id: string }>(
      `SELECT event_id FROM event_handler_log WHERE event_id = $1 AND handler = $2`,
      [eventId, handler],
    );
    return rows.length > 0;
  }
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
  if (isProductDb(db)) {
    await db.query(
      `INSERT INTO event_handler_log (event_id, handler)
       VALUES ($1, $2)
       ON CONFLICT (event_id, handler) DO NOTHING`,
      [eventId, handler],
    );
    return;
  }
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
  if (isProductDb(db)) {
    const rows = await db.query<Record<string, unknown>>(
      `UPDATE sprints SET retro_doc_id = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [docId, sprintId],
    );
    if (rows.length === 0) throw new Error(`sprint not found: ${sprintId}`);
    return rawToSprintRow(rows[0]!);
  }
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
  if (isProductDb(db)) {
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
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM tasks ${where} ORDER BY id ASC LIMIT $${params.length}`,
      params,
    );
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const cursor = hasMore ? (data[data.length - 1]! as Record<string, unknown>).id as string : null;
    return { data: data.map(rawToTaskRow), cursor };
  }
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
  if (isProductDb(db)) {
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
    const rows = await db.query<Record<string, unknown>>(
      `UPDATE tasks SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    if (rows.length === 0) throw new Error(`task not found: ${input.id}`);
    const task = rawToTaskRow(rows[0]!);
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

  await eventDispatcher.dispatch(em, {
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
  if (isProductDb(db)) {
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM custom_fields WHERE project_id = $1 ORDER BY position ASC, id ASC`,
      [projectId],
    );
    return rows.map(rawToCustomFieldRow);
  }
  const em = assertEm(db);
  const rows = await em.execute<Record<string, unknown>[]>(
    `SELECT * FROM custom_fields WHERE project_id = ? ORDER BY position ASC, id ASC`,
    [projectId],
    "all",
  );
  return rows.map(rawToCustomFieldRow);
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
  if (isProductDb(db)) {
    const id = newUlid();
    await db.query(
      `INSERT INTO custom_fields (id, org_id, project_id, name, field_type, options, position)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [id, input.orgId, input.projectId, input.name, input.fieldType, JSON.stringify(input.options ?? []), input.position ?? 0],
    );
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM custom_fields WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) throw new Error(`custom_field insert lost: ${id}`);
    return rawToCustomFieldRow(rows[0]!);
  }
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
  return rawToCustomFieldRow(rows[0]!);
}

// ── Saved views CRUD ────────────────────────────────────────────────

export async function listSavedViews(
  db: DbHandle,
  projectId: string,
): Promise<SavedViewRow[]> {
  if (isProductDb(db)) {
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM saved_views WHERE project_id = $1 ORDER BY name ASC, id ASC`,
      [projectId],
    );
    return rows.map(rawToSavedViewRow);
  }
  const em = assertEm(db);
  const rows = await em.execute<Record<string, unknown>[]>(
    `SELECT * FROM saved_views WHERE project_id = ? ORDER BY name ASC, id ASC`,
    [projectId],
    "all",
  );
  return rows.map(rawToSavedViewRow);
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
  if (isProductDb(db)) {
    const id = newUlid();
    await db.query(
      `INSERT INTO saved_views (id, org_id, project_id, name, filters, sort_by, columns, is_default)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8)`,
      [id, input.orgId, input.projectId, input.name, JSON.stringify(input.filters ?? {}), input.sortBy ?? null, JSON.stringify(input.columns ?? []), input.isDefault ?? false],
    );
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM saved_views WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) throw new Error(`saved_view insert lost: ${id}`);
    return rawToSavedViewRow(rows[0]!);
  }
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
  return rawToSavedViewRow(rows[0]!);
}

// ── API Key helpers ─────────────────────────────────────────────────

export async function findApiKeyByHash(
  db: DbHandle,
  keyHash: string,
): Promise<ApiKeyRow | undefined> {
  if (isProductDb(db)) {
    const rows = await db.query<Record<string, unknown>>(
      `UPDATE api_keys SET last_used_at = now() WHERE key_hash = $1 RETURNING *`,
      [keyHash],
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
