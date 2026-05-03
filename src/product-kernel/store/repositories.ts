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

// ── Notifications ──────────────────────────────────────────────

export interface NotificationRow {
  id: string;
  org_id: string;
  user_id: string;
  event_id: string;
  rule_id: string | null;
  entity_kind: string;
  entity_id: string;
  title: string;
  verb: string;
  actor: string;
  read_at: string | null;
  created_at: string;
}

export interface CreateNotificationInput {
  orgId: string;
  userId: string;
  eventId: string;
  ruleId?: string | null;
  entityKind: string;
  entityId: string;
  title: string;
  verb: string;
  actor: string;
}

export async function createNotification(
  db: ProductDb,
  input: CreateNotificationInput,
): Promise<NotificationRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO user_notifications (id, org_id, user_id, event_id, rule_id, entity_kind, entity_id, title, verb, actor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id, input.orgId, input.userId, input.eventId, input.ruleId ?? null,
      input.entityKind, input.entityId, input.title, input.verb, input.actor,
    ],
  );
  const rows = await db.query<NotificationRow>(
    `SELECT * FROM user_notifications WHERE id = $1`, [id],
  );
  if (rows.length === 0) throw new Error(`notification insert lost: ${id}`);
  return rows[0] as NotificationRow;
}

export async function listNotifications(
  db: ProductDb,
  userId: string,
  opts?: { limit?: number; offset?: number },
): Promise<NotificationRow[]> {
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  return db.query<NotificationRow>(
    `SELECT * FROM user_notifications
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
}

export async function countUnreadNotifications(
  db: ProductDb,
  userId: string,
): Promise<number> {
  const rows = await db.query<{ count: string | number }>(
    `SELECT count(*) AS count FROM user_notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return Number((rows[0] as { count: string | number }).count);
}

export async function markNotificationRead(
  db: ProductDb,
  notificationId: string,
): Promise<void> {
  await db.query(
    `UPDATE user_notifications SET read_at = now() WHERE id = $1 AND read_at IS NULL`,
    [notificationId],
  );
}

export async function listEventsForEntity(
  db: ProductDb,
  entityKind: string,
  entityId: string,
  opts?: { limit?: number },
): Promise<EventRow[]> {
  const limit = opts?.limit ?? 20;
  return db.query<EventRow>(
    `SELECT * FROM events
     WHERE subject_kind = $1 AND subject_id = $2
     ORDER BY created_at DESC, id DESC
     LIMIT $3`,
    [entityKind, entityId, limit],
  );
}

export interface EventFilterInput {
  orgId: string;
  projectId?: string | null;
  actorId?: string | null;
  subjectKind?: string | null;
  verb?: string | null;
  limit?: number;
  offset?: number;
}

export async function listEventsFiltered(
  db: ProductDb,
  filter: EventFilterInput,
): Promise<EventRow[]> {
  const conditions: string[] = ["org_id = $1"];
  const params: unknown[] = [filter.orgId];
  let idx = 2;

  if (filter.projectId) {
    conditions.push(`project_id = $${idx++}`);
    params.push(filter.projectId);
  }
  if (filter.actorId) {
    conditions.push(`actor = $${idx++}`);
    params.push(filter.actorId);
  }
  if (filter.subjectKind) {
    conditions.push(`subject_kind = $${idx++}`);
    params.push(filter.subjectKind);
  }
  if (filter.verb) {
    conditions.push(`verb = $${idx++}`);
    params.push(filter.verb);
  }

  const limit = filter.limit ?? 20;
  const offset = filter.offset ?? 0;
  params.push(limit, offset);

  return db.query<EventRow>(
    `SELECT * FROM events
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC, id DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params,
  );
}

// ── Repos ──────────────────────────────────────────────────────

export interface RepoRow {
  id: string;
  org_id: string;
  project_id: string | null;
  slug: string;
  root_path: string;
  default_branch: string | null;
  remote_url: string | null;
  name: string;
  kind: string;
  local_path: string | null;
  current_branch: string | null;
  last_sync_at: string | Date | null;
  sync_status: string;
  last_touched_at: string | Date | null;
  archived: boolean;
  registered_at: string;
  last_seen_at: string;
}

export interface CreateRepoInput {
  orgId: string;
  projectId?: string | null;
  slug: string;
  rootPath: string;
  defaultBranch?: string | null;
  remoteUrl?: string | null;
  name: string;
  kind: "local" | "remote";
  localPath?: string | null;
  currentBranch?: string | null;
}

export async function createRepo(
  db: ProductDb,
  input: CreateRepoInput,
): Promise<RepoRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO repos (id, org_id, project_id, slug, root_path, default_branch, remote_url, name, kind, local_path, current_branch, sync_status, last_touched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'idle', now())`,
    [
      id,
      input.orgId,
      input.projectId ?? null,
      input.slug,
      input.rootPath,
      input.defaultBranch ?? "main",
      input.remoteUrl ?? null,
      input.name,
      input.kind,
      input.localPath ?? null,
      input.currentBranch ?? "main",
    ],
  );
  await appendEvent(db, {
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    actor: "system",
    subjectKind: "repo",
    subjectId: id,
    verb: "created",
    payload: { name: input.name, kind: input.kind },
  });
  const rows = await db.query<RepoRow>(`SELECT * FROM repos WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`repo insert lost: ${id}`);
  return rows[0] as RepoRow;
}

export async function listReposForProject(
  db: ProductDb,
  projectId: string,
  orgId: string,
): Promise<RepoRow[]> {
  return db.query<RepoRow>(
    `SELECT * FROM repos
     WHERE project_id = $1 AND org_id = $2 AND COALESCE(archived, false) = false
     ORDER BY COALESCE(last_touched_at, last_sync_at) DESC NULLS LAST, slug ASC`,
    [projectId, orgId],
  );
}

export async function linkRepoToProject(
  db: ProductDb,
  repoId: string,
  projectId: string,
): Promise<void> {
  await db.query(
    `UPDATE repos SET project_id = $1 WHERE id = $2`,
    [projectId, repoId],
  );
}

export async function listEventsByActor(
  db: ProductDb,
  actor: string,
  opts?: { limit?: number; offset?: number },
): Promise<EventRow[]> {
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  return db.query<EventRow>(
    `SELECT * FROM events
     WHERE actor = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [actor, limit, offset],
  );
}
