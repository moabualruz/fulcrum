import type { ProductDb } from "../db/types.ts";
import { newUlid } from "../ids.ts";

// --- Row types ---

export interface NotificationRuleRow {
  id: string;
  org_id: string;
  name: string;
  event_pattern: Record<string, unknown>;
  channels: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserNotificationRow {
  id: string;
  org_id: string;
  user_id: string;
  subject_kind: string;
  subject_id: string;
  verb: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationMuteRow {
  id: string;
  org_id: string;
  user_id: string;
  subject_kind: string;
  subject_id: string;
  muted_until: string | null;
  created_at: string;
}

export interface NotificationChannelRow {
  id: string;
  org_id: string;
  kind: string;
  config: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuietHoursRow {
  id: string;
  org_id: string;
  user_id: string;
  start_hour: number;
  end_hour: number;
  timezone: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// --- Notifications ---

export interface ListNotificationsInput {
  orgId: string;
  userId: string;
  unread?: boolean;
  limit?: number;
  offset?: number;
}

export async function listNotifications(
  db: ProductDb,
  input: ListNotificationsInput,
): Promise<UserNotificationRow[]> {
  const { orgId, userId, unread, limit = 50, offset = 0 } = input;
  const conditions = ["org_id = $1", "user_id = $2"];
  const params: (string | number)[] = [orgId, userId];
  if (unread) {
    conditions.push("read_at IS NULL");
  }
  let idx = params.length;
  const sql = `SELECT * FROM user_notifications WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${++idx} OFFSET $${++idx}`;
  params.push(limit, offset);
  return db.query<UserNotificationRow>(sql, params);
}

export async function unreadCount(
  db: ProductDb,
  orgId: string,
  userId: string,
): Promise<number> {
  const rows = await db.query<{ count: string }>(
    `SELECT count(*)::text as count FROM user_notifications WHERE org_id = $1 AND user_id = $2 AND read_at IS NULL`,
    [orgId, userId],
  );
  return Number((rows[0] as { count: string }).count);
}

export async function markRead(
  db: ProductDb,
  orgId: string,
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `UPDATE user_notifications SET read_at = now() WHERE id = $1 AND org_id = $2 AND user_id = $3 AND read_at IS NULL RETURNING id`,
    [notificationId, orgId, userId],
  );
  return rows.length > 0;
}

export async function markAllRead(
  db: ProductDb,
  orgId: string,
  userId: string,
): Promise<number> {
  const rows = await db.query<{ id: string }>(
    `UPDATE user_notifications SET read_at = now() WHERE org_id = $1 AND user_id = $2 AND read_at IS NULL RETURNING id`,
    [orgId, userId],
  );
  return rows.length;
}

export async function createNotification(
  db: ProductDb,
  input: {
    orgId: string;
    userId: string;
    subjectKind: string;
    subjectId: string;
    verb: string;
    title: string;
    body?: string | null;
  },
): Promise<UserNotificationRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO user_notifications (id, org_id, user_id, subject_kind, subject_id, verb, title, body)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, input.orgId, input.userId, input.subjectKind, input.subjectId, input.verb, input.title, input.body ?? null],
  );
  const rows = await db.query<UserNotificationRow>(`SELECT * FROM user_notifications WHERE id = $1`, [id]);
  return rows[0] as UserNotificationRow;
}

// --- Mutes ---

export async function mute(
  db: ProductDb,
  input: {
    orgId: string;
    userId: string;
    subjectKind: string;
    subjectId: string;
    mutedUntil?: string | null;
  },
): Promise<NotificationMuteRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO notification_mutes (id, org_id, user_id, subject_kind, subject_id, muted_until)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (org_id, user_id, subject_kind, subject_id)
     DO UPDATE SET muted_until = EXCLUDED.muted_until`,
    [id, input.orgId, input.userId, input.subjectKind, input.subjectId, input.mutedUntil ?? null],
  );
  const rows = await db.query<NotificationMuteRow>(
    `SELECT * FROM notification_mutes WHERE org_id = $1 AND user_id = $2 AND subject_kind = $3 AND subject_id = $4`,
    [input.orgId, input.userId, input.subjectKind, input.subjectId],
  );
  return rows[0] as NotificationMuteRow;
}

export async function unmute(
  db: ProductDb,
  orgId: string,
  userId: string,
  subjectKind: string,
  subjectId: string,
): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `DELETE FROM notification_mutes WHERE org_id = $1 AND user_id = $2 AND subject_kind = $3 AND subject_id = $4 RETURNING id`,
    [orgId, userId, subjectKind, subjectId],
  );
  return rows.length > 0;
}

// --- Rules ---

export async function listRules(
  db: ProductDb,
  orgId: string,
): Promise<NotificationRuleRow[]> {
  return db.query<NotificationRuleRow>(
    `SELECT * FROM notification_rules WHERE org_id = $1 ORDER BY created_at ASC`,
    [orgId],
  );
}

export async function getRule(
  db: ProductDb,
  orgId: string,
  ruleId: string,
): Promise<NotificationRuleRow | null> {
  const rows = await db.query<NotificationRuleRow>(
    `SELECT * FROM notification_rules WHERE id = $1 AND org_id = $2`,
    [ruleId, orgId],
  );
  return rows[0] ?? null;
}

export async function createRule(
  db: ProductDb,
  input: {
    orgId: string;
    name: string;
    eventPattern: Record<string, unknown>;
    channels: string[];
    enabled?: boolean;
  },
): Promise<NotificationRuleRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO notification_rules (id, org_id, name, event_pattern, channels, enabled)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
    [id, input.orgId, input.name, JSON.stringify(input.eventPattern), `{${input.channels.join(",")}}`, input.enabled ?? true],
  );
  const rows = await db.query<NotificationRuleRow>(`SELECT * FROM notification_rules WHERE id = $1`, [id]);
  return rows[0] as NotificationRuleRow;
}

export async function updateRule(
  db: ProductDb,
  orgId: string,
  ruleId: string,
  patch: {
    name?: string;
    eventPattern?: Record<string, unknown>;
    channels?: string[];
    enabled?: boolean;
  },
): Promise<NotificationRuleRow | null> {
  const sets: string[] = [];
  const params: (string | boolean | number)[] = [];
  let idx = 0;
  if (patch.name !== undefined) { sets.push(`name = $${++idx}`); params.push(patch.name); }
  if (patch.eventPattern !== undefined) { sets.push(`event_pattern = $${++idx}::jsonb`); params.push(JSON.stringify(patch.eventPattern)); }
  if (patch.channels !== undefined) { sets.push(`channels = $${++idx}`); params.push(`{${patch.channels.join(",")}}`); }
  if (patch.enabled !== undefined) { sets.push(`enabled = $${++idx}`); params.push(patch.enabled); }
  if (sets.length === 0) return getRule(db, orgId, ruleId);
  sets.push(`updated_at = now()`);
  params.push(ruleId, orgId);
  const sql = `UPDATE notification_rules SET ${sets.join(", ")} WHERE id = $${idx + 1} AND org_id = $${idx + 2} RETURNING *`;
  const rows = await db.query<NotificationRuleRow>(sql, params);
  return rows[0] ?? null;
}

export async function deleteRule(
  db: ProductDb,
  orgId: string,
  ruleId: string,
): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `DELETE FROM notification_rules WHERE id = $1 AND org_id = $2 RETURNING id`,
    [ruleId, orgId],
  );
  return rows.length > 0;
}

// --- Channels ---

export async function listChannels(
  db: ProductDb,
  orgId: string,
): Promise<NotificationChannelRow[]> {
  return db.query<NotificationChannelRow>(
    `SELECT * FROM notification_channels WHERE org_id = $1 ORDER BY kind ASC`,
    [orgId],
  );
}

export async function configureChannel(
  db: ProductDb,
  input: {
    orgId: string;
    kind: string;
    config: Record<string, unknown>;
    enabled?: boolean;
  },
): Promise<NotificationChannelRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO notification_channels (id, org_id, kind, config, enabled)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (org_id, kind)
     DO UPDATE SET config = EXCLUDED.config, enabled = EXCLUDED.enabled, updated_at = now()`,
    [id, input.orgId, input.kind, JSON.stringify(input.config), input.enabled ?? true],
  );
  const rows = await db.query<NotificationChannelRow>(
    `SELECT * FROM notification_channels WHERE org_id = $1 AND kind = $2`,
    [input.orgId, input.kind],
  );
  return rows[0] as NotificationChannelRow;
}
