/**
 * Email notification channel — gated behind FULCRUM_FEATURES=notify-email.
 *
 * Transport factory pattern: accepts any object with sendMail() so nodemailer
 * can be swapped for emailjs or a mock in tests.
 */

import type { ProductDb } from "../db/types.ts";
import { newUlid } from "../ids.ts";
import { randomBytes } from "node:crypto";

// --- Types ---

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export interface SmtpTransport {
  sendMail(payload: EmailPayload): Promise<{ messageId: string }>;
}

export interface UserRow {
  id: string;
  org_id: string;
  email: string | null;
  email_verified: boolean;
  email_verify_token: string | null;
  email_verify_token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationDeliveryRow {
  id: string;
  org_id: string;
  user_id: string;
  channel: string;
  notification_id: string | null;
  subject: string | null;
  body: string | null;
  status: "sent" | "failed" | "suppressed";
  suppression_reason: string | null;
  last_error: string | null;
  created_at: string;
}

export interface SendEmailInput {
  userId: string;
  orgId: string;
  subject: string;
  body: string;
  notificationId?: string;
  transport: SmtpTransport;
  featureEnabled: boolean;
  quietHoursActive?: boolean;
  rateLimitPerHour?: number;
}

// --- User CRUD ---

export async function createUser(
  db: ProductDb,
  input: { orgId: string; email?: string; emailVerified?: boolean },
): Promise<UserRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO users (id, org_id, handle, email, email_verified) VALUES ($1, $2, $3, $4, $5)`,
    [id, input.orgId, input.email ?? id, input.email ?? null, input.emailVerified ?? false],
  );
  const rows = await db.query<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`user insert lost: ${id}`);
  return rows[0] as UserRow;
}

async function getUser(db: ProductDb, id: string): Promise<UserRow | null> {
  const rows = await db.query<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
  return (rows[0] as UserRow) ?? null;
}

// --- Email verify flow ---

export async function generateVerifyToken(db: ProductDb, userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h
  await db.query(
    `UPDATE users SET email_verify_token = $1, email_verify_token_expires_at = $2, updated_at = now() WHERE id = $3`,
    [token, expiresAt, userId],
  );
  return token;
}

export async function confirmVerifyToken(db: ProductDb, token: string): Promise<boolean> {
  const rows = await db.query<UserRow>(
    `SELECT * FROM users WHERE email_verify_token = $1`,
    [token],
  );
  const user = rows[0] as UserRow | undefined;
  if (!user) return false;

  // Check expiry
  if (user.email_verify_token_expires_at) {
    const expires = new Date(user.email_verify_token_expires_at);
    if (expires < new Date()) return false;
  }

  await db.query(
    `UPDATE users SET email_verified = true, email_verify_token = NULL, email_verify_token_expires_at = NULL, updated_at = now() WHERE id = $1`,
    [user.id],
  );
  return true;
}

// --- Rate limiter ---

export async function countRecentDeliveries(
  db: ProductDb,
  userId: string,
  channel: string,
  minutesAgo: number,
): Promise<number> {
  const since = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
  const rows = await db.query<{ cnt: string }>(
    `SELECT count(*)::text AS cnt FROM notification_deliveries
     WHERE user_id = $1 AND channel = $2 AND status = 'sent' AND created_at >= $3`,
    [userId, channel, since],
  );
  return parseInt((rows[0] as { cnt: string })?.cnt ?? "0", 10);
}

// --- Core send ---

async function insertDelivery(
  db: ProductDb,
  input: {
    orgId: string;
    userId: string;
    channel: string;
    notificationId?: string;
    subject?: string;
    body?: string;
    status: "sent" | "failed" | "suppressed";
    suppressionReason?: string;
    lastError?: string;
  },
): Promise<NotificationDeliveryRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO notification_deliveries
       (id, org_id, user_id, channel, notification_id, subject, body, status, suppression_reason, last_error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      input.orgId,
      input.userId,
      input.channel,
      input.notificationId ?? null,
      input.subject ?? null,
      input.body ?? null,
      input.status,
      input.suppressionReason ?? null,
      input.lastError ?? null,
    ],
  );
  const rows = await db.query<NotificationDeliveryRow>(
    `SELECT * FROM notification_deliveries WHERE id = $1`,
    [id],
  );
  return rows[0] as NotificationDeliveryRow;
}

export async function sendEmailNotification(
  db: ProductDb,
  input: SendEmailInput,
): Promise<NotificationDeliveryRow | null> {
  // Feature gate
  if (!input.featureEnabled) return null;

  const user = await getUser(db, input.userId);
  if (!user) throw new Error(`user not found: ${input.userId}`);

  // Quiet hours check
  if (input.quietHoursActive) {
    return insertDelivery(db, {
      orgId: input.orgId,
      userId: input.userId,
      channel: "email",
      notificationId: input.notificationId,
      subject: input.subject,
      body: input.body,
      status: "suppressed",
      suppressionReason: "quiet_hours",
    });
  }

  // Email verification check
  if (!user.email_verified) {
    return insertDelivery(db, {
      orgId: input.orgId,
      userId: input.userId,
      channel: "email",
      notificationId: input.notificationId,
      subject: input.subject,
      body: input.body,
      status: "suppressed",
      suppressionReason: "email_not_verified",
    });
  }

  // Rate limit check
  const limit = input.rateLimitPerHour ?? 5;
  const recentCount = await countRecentDeliveries(db, input.userId, "email", 60);
  if (recentCount >= limit) {
    return insertDelivery(db, {
      orgId: input.orgId,
      userId: input.userId,
      channel: "email",
      notificationId: input.notificationId,
      subject: input.subject,
      body: input.body,
      status: "suppressed",
      suppressionReason: "rate_limit",
    });
  }

  // Attempt send
  try {
    await input.transport.sendMail({
      to: user.email!,
      subject: input.subject,
      html: input.body,
    });
    return insertDelivery(db, {
      orgId: input.orgId,
      userId: input.userId,
      channel: "email",
      notificationId: input.notificationId,
      subject: input.subject,
      body: input.body,
      status: "sent",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return insertDelivery(db, {
      orgId: input.orgId,
      userId: input.userId,
      channel: "email",
      notificationId: input.notificationId,
      subject: input.subject,
      body: input.body,
      status: "failed",
      lastError: message,
    });
  }
}
