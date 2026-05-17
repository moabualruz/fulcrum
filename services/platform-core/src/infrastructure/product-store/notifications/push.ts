/**
 * VAPID Web Push dispatcher (P12#19).
 * Gated behind FULCRUM_FEATURES=notify-push.
 *
 * Sends push notifications via the web-push protocol.
 * HTTP 410 from the push service → subscription deleted automatically.
 */

import type { ProductDb } from "../db/types.ts";
import { newUlid } from "../ids.ts";

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

export function isPushEnabled(): boolean {
  const flags = (process.env.FULCRUM_FEATURES ?? "").split(",").map((s) => s.trim());
  return flags.includes("notify-push");
}

// ---------------------------------------------------------------------------
// PushSubscription store
// ---------------------------------------------------------------------------

export interface PushSubscriptionRow {
  id: string;
  org_id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscribeInput {
  orgId: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

export async function subscribePush(
  db: ProductDb,
  input: SubscribeInput,
): Promise<PushSubscriptionRow> {
  const id = newUlid();
  // Upsert: if same (user_id, endpoint) already exists, update keys.
  await db.query(
    `INSERT INTO push_subscriptions (id, org_id, user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, endpoint)
     DO UPDATE SET p256dh = EXCLUDED.p256dh,
                   auth = EXCLUDED.auth,
                   user_agent = EXCLUDED.user_agent,
                   updated_at = now()`,
    [
      id,
      input.orgId,
      input.userId,
      input.endpoint,
      input.p256dh,
      input.auth,
      input.userAgent ?? null,
    ],
  );
  const rows = await db.query<PushSubscriptionRow>(
    `SELECT * FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
    [input.userId, input.endpoint],
  );
  if (rows.length === 0) throw new Error("push subscription insert lost");
  return rows[0] as PushSubscriptionRow;
}

export async function unsubscribePush(
  db: ProductDb,
  userId: string,
  endpoint: string,
): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2 RETURNING id`,
    [userId, endpoint],
  );
  return rows.length > 0;
}

export async function listPushSubscriptions(
  db: ProductDb,
  userId: string,
): Promise<PushSubscriptionRow[]> {
  return db.query<PushSubscriptionRow>(
    `SELECT * FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId],
  );
}

export async function removePushSubscription(
  db: ProductDb,
  id: string,
): Promise<void> {
  await db.query(`DELETE FROM push_subscriptions WHERE id = $1`, [id]);
}

// ---------------------------------------------------------------------------
// Push send interface (web-push abstraction)
// ---------------------------------------------------------------------------

export interface PushSendResult {
  statusCode: number;
  body: string;
}

/** Pluggable sender — production uses web-push, tests inject mock. */
export type PushSender = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  options: { vapidDetails: { subject: string; publicKey: string; privateKey: string } },
) => Promise<PushSendResult>;

export interface DeliverPushInput {
  db: ProductDb;
  userId: string;
  title: string;
  body: string;
  url?: string;
  sender: PushSender;
  vapidSubject: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
}

export interface DeliveryResult {
  subscriptionId: string;
  endpoint: string;
  status: "sent" | "failed" | "gone";
}

/**
 * Deliver push notification to all subscriptions for a user.
 * HTTP 410 → subscription auto-deleted.
 */
export async function deliverPush(input: DeliverPushInput): Promise<DeliveryResult[]> {
  if (!isPushEnabled()) return [];

  const subs = await listPushSubscriptions(input.db, input.userId);
  const results: DeliveryResult[] = [];

  for (const sub of subs) {
    const payload = JSON.stringify({
      title: input.title,
      body: input.body,
      url: input.url ?? "/",
    });

    try {
      const res = await input.sender(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        {
          vapidDetails: {
            subject: input.vapidSubject,
            publicKey: input.vapidPublicKey,
            privateKey: input.vapidPrivateKey,
          },
        },
      );

      if (res.statusCode === 410 || res.statusCode === 404) {
        // Subscription expired or invalid — clean up.
        await removePushSubscription(input.db, sub.id);
        results.push({ subscriptionId: sub.id, endpoint: sub.endpoint, status: "gone" });
      } else if (res.statusCode >= 200 && res.statusCode < 300) {
        results.push({ subscriptionId: sub.id, endpoint: sub.endpoint, status: "sent" });
      } else {
        results.push({ subscriptionId: sub.id, endpoint: sub.endpoint, status: "failed" });
      }
    } catch {
      results.push({ subscriptionId: sub.id, endpoint: sub.endpoint, status: "failed" });
    }
  }

  return results;
}
