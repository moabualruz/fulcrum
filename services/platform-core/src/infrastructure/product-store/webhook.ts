import { createHmac } from "node:crypto";
import type { ProductDb } from "./db/types.ts";
import { newUlid } from "./ids.ts";

// --- HMAC signing ---

export function computeHmacSignature(body: string, secret: string): string {
  const hex = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${hex}`;
}

// --- Exponential backoff: min(5000 * 2^n, 60000) ms ---

export function nextRetryDelay(attempt: number): number {
  return Math.min(5000 * Math.pow(2, attempt), 60000);
}

// --- Delivery persistence ---

export interface DeliveryRow {
  id: string;
  org_id: string;
  notification_id: string;
  channel: string;
  status: string;
  attempts: number;
  max_attempts: number;
  retry_after: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDeliveryInput {
  orgId: string;
  notificationId: string;
  channel: string;
  maxAttempts?: number;
}

export async function createDelivery(
  db: ProductDb,
  input: CreateDeliveryInput,
): Promise<DeliveryRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO notification_deliveries (id, org_id, notification_id, channel, status, max_attempts)
     VALUES ($1, $2, $3, $4, 'pending', $5)`,
    [id, input.orgId, input.notificationId, input.channel, input.maxAttempts ?? 5],
  );
  return (await getDelivery(db, id)) as DeliveryRow;
}

export async function getDelivery(db: ProductDb, id: string): Promise<DeliveryRow | null> {
  const rows = await db.query<DeliveryRow>(
    "SELECT * FROM notification_deliveries WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export interface UpdateDeliveryInput {
  status: "pending" | "sent" | "failed" | "held-quiet-hours";
  attempts?: number;
  retryAfter?: Date;
  lastError?: string;
}

export async function updateDeliveryStatus(
  db: ProductDb,
  id: string,
  input: UpdateDeliveryInput,
): Promise<void> {
  await db.query(
    `UPDATE notification_deliveries
        SET status = $2,
            attempts = COALESCE($3, attempts),
            retry_after = $4,
            last_error = $5,
            updated_at = now()
      WHERE id = $1`,
    [
      id,
      input.status,
      input.attempts ?? null,
      input.retryAfter?.toISOString() ?? null,
      input.lastError ?? null,
    ],
  );
}

// --- Webhook config persistence ---

export interface WebhookConfigRow {
  id: string;
  org_id: string;
  rule_id: string;
  url: string;
  encrypted_secret: string;
  created_at: string;
  updated_at: string;
}

export interface CreateWebhookConfigInput {
  orgId: string;
  ruleId: string;
  url: string;
  encryptedSecret: string;
}

export async function createWebhookConfig(
  db: ProductDb,
  input: CreateWebhookConfigInput,
): Promise<WebhookConfigRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO webhook_rule_configs (id, org_id, rule_id, url, encrypted_secret)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, input.orgId, input.ruleId, input.url, input.encryptedSecret],
  );
  return (await getWebhookConfig(db, input.ruleId)) as WebhookConfigRow;
}

export async function getWebhookConfig(
  db: ProductDb,
  ruleId: string,
): Promise<WebhookConfigRow | null> {
  const rows = await db.query<WebhookConfigRow>(
    "SELECT * FROM webhook_rule_configs WHERE rule_id = $1",
    [ruleId],
  );
  return rows[0] ?? null;
}

// --- Dispatch ---

export type WebhookDispatchResult = {
  outcome: "sent" | "retry" | "skipped";
  statusCode?: number;
  error?: string;
};

export interface DispatchWebhookInput {
  url: string;
  body: string;
  secret: string;
  featureEnabled: boolean;
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

export async function dispatchWebhook(
  input: DispatchWebhookInput,
): Promise<WebhookDispatchResult> {
  if (!input.featureEnabled) {
    return { outcome: "skipped" };
  }

  const signature = computeHmacSignature(input.body, input.secret);
  const doFetch = input.fetchImpl ?? globalThis.fetch;

  try {
    const response = await doFetch(input.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fulcrum-Signature-256": signature,
      },
      body: input.body,
    });

    if (response.status >= 200 && response.status < 300) {
      return { outcome: "sent", statusCode: response.status };
    }
    // 4xx/5xx → retry
    return { outcome: "retry", statusCode: response.status };
  } catch (err) {
    return {
      outcome: "retry",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
