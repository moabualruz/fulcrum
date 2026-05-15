/**
 * Product-kernel repository layer — MikroORM implementation.
 *
 * Migrated from raw SQL (db.query()) to MikroORM EntityManager + repository
 * pattern (ARCH-02). Functions accept DbHandle (EntityManager | ProductDb).
 *
 * Data contracts (Row interfaces, input types, return types) are preserved
 * for backward compatibility — callers receive plain row objects.
 */

import type { EntityManager } from "typeorm";
import { randomUUID } from "node:crypto";
import type { ProductDb } from "../db/types.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Sprint, type MetricsSnapshot } from "@work-management/infrastructure/database/entities/tasks/Sprint.ts";
import { Event } from "@platform-core/infrastructure/application-database/entities/core/Event.ts";
import { eventDispatcher } from "../event-dispatcher.ts";

/**
 * Database handle — accepts either MikroORM EntityManager (preferred)
 * or legacy ProductDb interface for backward compatibility.
 */
export type DbHandle = EntityManager | ProductDb;

/** Type guard: is this an EntityManager? */
function isEntityManager(db: DbHandle): db is EntityManager {
  return "save" in db && typeof (db as EntityManager).save === "function";
}

function isProductDb(db: DbHandle): db is ProductDb {
  return !("em" in db) && "query" in db && typeof (db as ProductDb).query === "function";
}

/** Assert handle is EntityManager or throw helpful error. */
function assertEm(db: DbHandle): EntityManager {
  if (isEntityManager(db)) return db;
  if ("em" in db && isEntityManager((db as { em: DbHandle }).em)) {
    return (db as { em: EntityManager }).em;
  }
  throw new Error(
    "repositories.ts: MikroORM EntityManager required. " +
    "Pass em (from MikroORM) instead of raw ProductDb. " +
    "See ARCH-02 migration guide.",
  );
}

const TASK_POINT_COLUMN_ORDER = ["points", "story_points", "estimate_points"] as const;
type TaskPointColumn = (typeof TASK_POINT_COLUMN_ORDER)[number];

function taskPointExpression(columns: readonly string[]): string {
  const ordered = TASK_POINT_COLUMN_ORDER.filter((column) => columns.includes(column));
  if (ordered.length === 0) return "0";
  if (ordered.length === 1) return ordered[0]!;
  return `COALESCE(${ordered.join(", ")}, 0)`;
}

async function taskPointExpressionForProductDb(db: ProductDb): Promise<string> {
  const rows = await db.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_name = 'tasks'
        AND column_name IN ('points', 'story_points', 'estimate_points')`,
  );
  return taskPointExpression(rows.map((row) => row.column_name));
}

async function taskPointExpressionForEm(em: EntityManager): Promise<string> {
  const rows = await em.query<{ column_name: string }[]>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_name = 'tasks'
        AND column_name IN ('points', 'story_points', 'estimate_points')`,
  );
  return taskPointExpression((rows as unknown as { column_name: string }[]).map((row) => row.column_name));
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
    field_type: (r.field_type ?? r.type) as string,
    options: r.options ?? r.config_json,
    position: r.position as number,
    created_at: toIso(r.created_at as Date | string | undefined),
    updated_at: toIso(r.updated_at as Date | string | undefined),
  };
}

function rawToSavedViewRow(r: Record<string, unknown>): SavedViewRow {
  const orderBy = r.order_by;
  const sortBy = r.sort_by !== undefined
    ? (r.sort_by as string)
    : Array.isArray(orderBy) && typeof orderBy[0] === "object" && orderBy[0] !== null && "field" in orderBy[0]
      ? String((orderBy[0] as { field: unknown }).field)
      : Array.isArray(orderBy) && orderBy.length === 0 ? null
      : orderBy !== undefined ? JSON.stringify(orderBy) : null;
  return {
    id: r.id as string,
    org_id: r.org_id as string,
    project_id: r.project_id as string,
    name: r.name as string,
    filters: r.filters ?? r.query_json,
    sort_by: sortBy,
    columns: r.columns ?? [],
    is_default: (r.is_default as boolean) ?? r.default_for === "project",
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
    const id = randomUUID();
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
  const id = randomUUID();
  const repo = em.getRepository(Org);
  const org = repo.create({
    id,
    slug: input.slug,
    name: input.name,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await em.save(org);
  return orgToRow(org);
}

// ── Project CRUD ────────────────────────────────────────────────────

export async function createProject(
  db: DbHandle,
  input: { orgId: string; slug: string; name: string; description?: string | null },
): Promise<ProjectRow> {
  if (isProductDb(db)) {
    const id = randomUUID();
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
  const id = randomUUID();
  const now = new Date();
  await em.query(
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
  const rows = await em.query<{ id: string; org_id: string; slug: string; name: string; description: string | null; created_at: Date; updated_at: Date }[]>(`SELECT * FROM projects WHERE id = ?`, [id]);
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
    const id = randomUUID();
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
  const id = randomUUID();
  const status = input.status ?? "pending";
  const priority = input.priority ?? 0;
  const now = new Date();

  await em.query(
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

  const rows = await em.query(`SELECT * FROM tasks WHERE id = ?`, [id]);
  if (rows.length === 0) throw new Error(`task insert lost: ${id}`);
  return rawToTaskRow(rows[0]!);
}

// ── Event CRUD ──────────────────────────────────────────────────────

export async function appendEvent(
  db: DbHandle,
  input: AppendEventInput,
): Promise<EventRow> {
  if (isProductDb(db)) {
    const id = randomUUID();
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
  const id = randomUUID();
  const repo = em.getRepository(Event);
  const event = repo.create({
    id,
    org: { id: input.orgId } as Org,
    projectId: input.projectId ?? undefined,
    actor: input.actor,
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    verb: input.verb,
    payload: input.payload ?? {},
    createdAt: new Date(),
  });
  await em.save(event);
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
  const events = await repo.find({ where: { projectId } as never, order: { createdAt: "ASC", id: "ASC" } });
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
  const rows = await em.query(
    `SELECT * FROM events WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC, id ASC LIMIT ?`,
    params,
  ) as Record<string, unknown>[];
  return rows.map(rawToEventRow);
}

export async function listReposForProject(
  db: DbHandle,
  projectId: string,
  orgId: string,
): Promise<RepoRow[]> {
  if (isProductDb(db)) {
    const sql = `SELECT id, org_id, project_id, slug, name, kind, remote_url, local_path, current_branch,
                       sync_status, created_at, updated_at
                  FROM repos
                 WHERE project_id = ? AND org_id = ?
                 ORDER BY last_touched_at DESC, id ASC`;
    const rows = await db.query<Record<string, unknown>>(sql.replace("?", "$1").replace("?", "$2"), [projectId, orgId]);
    return rows.map(rawToRepoRow);
  }
  const em = assertEm(db);
  const rows = await em.query(`SELECT id, org_id, project_id, slug, name, kind, remote_url, local_path, current_branch,
            sync_status,
            COALESCE(last_touched_at, now()) AS created_at,
            COALESCE(last_touched_at, now()) AS updated_at
       FROM repos
      WHERE project_id = ? AND org_id = ?
      ORDER BY last_touched_at DESC, id ASC`, [projectId, orgId]);
  return rows.map(rawToRepoRow);
}

export async function linkRepoToProject(db: DbHandle, repoId: string, projectId: string): Promise<{ ok: true }> {
  if (isProductDb(db)) {
    await db.query(`UPDATE repos SET project_id = $1, updated_at = now() WHERE id = $2`, [projectId, repoId]);
    return { ok: true };
  }
  const em = assertEm(db);
  await em.query(`UPDATE repos SET project_id = ? WHERE id = ?`, [projectId, repoId]);
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
    const id = randomUUID();
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
  const id = randomUUID();
  const status = input.status ?? "planning";
  const now = new Date();

  const repo = em.getRepository(Sprint);
  const sprint = repo.create({
    id,
    org: { id: input.orgId } as Org,
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
  await em.save(sprint);

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
  const sprint = await repo.findOne({ where: { id: input.id } });
  if (!sprint) throw new Error(`sprint not found: ${input.id}`);

  if (input.name !== undefined) sprint.name = input.name;
  if (input.goal !== undefined) sprint.goal = input.goal;
  if (input.status !== undefined) sprint.status = input.status as "planned" | "active" | "completed";
  if (input.capacityPoints !== undefined) sprint.capacityPoints = input.capacityPoints;
  if (input.startDate !== undefined) sprint.startDate = input.startDate ? new Date(input.startDate) : sprint.startDate;
  if (input.endDate !== undefined) sprint.endDate = input.endDate ? new Date(input.endDate) : sprint.endDate;
  sprint.updatedAt = new Date();
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
  const sprints = await repo.find({ where: { projectId }, order: { createdAt: "DESC", id: "ASC" } });
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
  const sprint = await sprintRepo.findOne({ where: { id: input.sprintId } });
  if (!sprint) throw new Error(`sprint not found: ${input.sprintId}`);

  const orgId = typeof sprint.org === "string" ? sprint.org : sprint.org?.id ?? "";

  const taskRows = await em.query(`SELECT * FROM tasks WHERE id = ?`, [input.taskId]);
  const task = taskRows[0];
  if (!task) throw new Error(`task not found: ${input.taskId}`);
  if (task.org_id !== orgId || task.project_id !== sprint.projectId) {
    throw new Error(`task ${input.taskId} is outside sprint scope ${input.sprintId}`);
  }

  await em.query(
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
  const sprint = await sprintRepo.findOne({ where: { id: input.sprintId } });
  if (!sprint) throw new Error(`sprint not found: ${input.sprintId}`);

  const orgId = typeof sprint.org === "string" ? sprint.org : sprint.org?.id ?? "";

  const rows = await em.query(`UPDATE tasks SET sprint_id = NULL, updated_at = now()
      WHERE id = ? AND org_id = ? AND project_id = ? AND sprint_id = ?
      RETURNING *`, [input.taskId, orgId, sprint.projectId, sprint.id]);
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
  const rows = await em.query(`SELECT * FROM tasks
      WHERE project_id = ?
        AND sprint_id IS NULL
        AND status NOT IN ('completed', 'cancelled')
      ORDER BY priority DESC, updated_at DESC, id ASC`, [projectId]);
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
  const rows = await em.query(`SELECT * FROM tasks
      WHERE sprint_id = ?
      ORDER BY priority DESC, updated_at DESC, id ASC`, [sprintId]);
  return rows.map(rawToTaskRow);
}

export async function sprintCapacityUsed(db: DbHandle, sprintId: string): Promise<number> {
  if (isProductDb(db)) {
    const pointsExpression = await taskPointExpressionForProductDb(db);
    const rows = await db.query<{ used: number | string | null }>(
      `SELECT COALESCE(SUM(${pointsExpression}), 0) AS used FROM tasks WHERE sprint_id = $1`,
      [sprintId],
    );
    return Number(rows[0]?.used ?? 0);
  }
  const em = assertEm(db);
  const pointsExpression = await taskPointExpressionForEm(em);
  const rows = await em.query<{ used: number | string | null }[]>(`SELECT COALESCE(SUM(${pointsExpression}), 0) AS used FROM tasks WHERE sprint_id = ?`, [sprintId]);
  return Number(rows[0]?.used ?? 0);
}

export async function closeSprint(
  db: DbHandle,
  sprintId: string,
): Promise<{ sprint: SprintRow; metrics: MetricsSnapshot; event: EventRow }> {
  if (isProductDb(db)) {
    const pointsExpression = await taskPointExpressionForProductDb(db);
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
         COALESCE(SUM(CASE WHEN status = 'completed' THEN ${pointsExpression} ELSE 0 END), 0) AS completed_points,
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
  const sprint = await repo.findOne({ where: { id: sprintId } });
  if (!sprint) throw new Error(`sprint not found: ${sprintId}`);
  if (sprint.status === "completed") throw new Error(`sprint already closed: ${sprintId}`);

  const pointsExpression = await taskPointExpressionForEm(em);
  const metricRows = await em.query<{
    completed_points: number | string | null;
    total_tasks: number | string;
    completed_tasks: number | string;
  }[]>(`SELECT
        COALESCE(SUM(CASE WHEN status = 'completed' THEN ${pointsExpression} ELSE 0 END), 0) AS completed_points,
        COUNT(*) AS total_tasks,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_tasks
      FROM tasks
      WHERE sprint_id = ?`, [sprint.id]);
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
  const rows = await em.query<{ event_id: string }[]>(`SELECT event_id FROM event_handler_log WHERE event_id = ? AND handler = ?`, [eventId, handler]);
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
  await em.query(
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
  const sprint = await repo.findOne({ where: { id: sprintId } });
  if (!sprint) throw new Error(`sprint not found: ${sprintId}`);
  sprint.retroDocId = docId;
  sprint.updatedAt = new Date();
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
    conditions.push(cond);
  };
  if (filters.projectId) push("project_id = ?", filters.projectId);
  if (filters.status) push("status = ?", filters.status);
  if (filters.sprintId) push("sprint_id = ?", filters.sprintId);
  if (filters.assigneeId) push("assignee_id = ?", filters.assigneeId);
  if (filters.cursor) push("id > ?", filters.cursor);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 50;
  params.push(limit + 1);
  const rows = await em.query(`SELECT * FROM tasks ${where} ORDER BY id ASC LIMIT ?`, params);
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
    sets.push(`${col} = ?`);
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
  const rows = await em.query(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = ? RETURNING *`,
    params,
  ) as Record<string, unknown>[];
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
      `SELECT * FROM custom_field_defs WHERE project_id = $1 ORDER BY position ASC, id ASC`,
      [projectId],
    );
    return rows.map(rawToCustomFieldRow);
  }
  const em = assertEm(db);
  const rows = await em.query(`SELECT * FROM custom_field_defs WHERE project_id = ? ORDER BY position ASC, id ASC`, [projectId]);
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
    const id = randomUUID();
    await db.query(
      `INSERT INTO custom_field_defs (id, org_id, project_id, name, slug, type, config_json, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [id, input.orgId, input.projectId, input.name, input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), input.fieldType, JSON.stringify({ options: input.options ?? [] }), input.position ?? 0],
    );
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM custom_field_defs WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) throw new Error(`custom_field insert lost: ${id}`);
    return rawToCustomFieldRow(rows[0]!);
  }
  const em = assertEm(db);
  const id = randomUUID();
  await em.query(
    `INSERT INTO custom_field_defs (id, org_id, project_id, name, slug, type, config_json, position)
     VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?)`,
    [id, input.orgId, input.projectId, input.name, input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), input.fieldType, JSON.stringify({ options: input.options ?? [] }), input.position ?? 0],
  );
  const rows = await em.query(`SELECT * FROM custom_field_defs WHERE id = ?`, [id]);
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
  const rows = await em.query(`SELECT * FROM saved_views WHERE project_id = ? ORDER BY name ASC, id ASC`, [projectId]);
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
    const id = randomUUID();
    await db.query(
      `INSERT INTO saved_views (id, org_id, project_id, scope, name, query_json, order_by, view_type, created_by, default_for)
       VALUES ($1, $2, $3, 'project', $4, $5::jsonb, $6::jsonb, 'list', (SELECT id FROM users ORDER BY created_at ASC LIMIT 1), $7)`,
      [id, input.orgId, input.projectId, input.name, JSON.stringify(input.filters ?? {}), JSON.stringify(input.sortBy ? [{ field: input.sortBy }] : []), input.isDefault ? "project" : null],
    );
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM saved_views WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) throw new Error(`saved_view insert lost: ${id}`);
    return rawToSavedViewRow(rows[0]!);
  }
  const em = assertEm(db);
  const id = randomUUID();
  await em.query(
    `INSERT INTO saved_views (id, org_id, project_id, scope, name, query_json, order_by, view_type, created_by, default_for)
     VALUES (?, ?, ?, 'project', ?, ?::jsonb, ?::jsonb, 'list', (SELECT id FROM users ORDER BY created_at ASC LIMIT 1), ?)`,
    [id, input.orgId, input.projectId, input.name, JSON.stringify(input.filters ?? {}), JSON.stringify(input.sortBy ? [{ field: input.sortBy }] : []), input.isDefault ? "project" : null],
  );
  const rows = await em.query(`SELECT * FROM saved_views WHERE id = ?`, [id]);
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
  const rows = await em.query(`UPDATE api_keys SET last_used_at = now() WHERE key_hash = ? RETURNING *`, [keyHash]);
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
