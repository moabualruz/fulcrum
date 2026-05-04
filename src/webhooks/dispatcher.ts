import { createHmac } from "node:crypto";

import { Org } from "../db/entities/auth/Org.ts";
import { Webhook } from "../db/entities/notifications/Webhook.ts";
import {
  WebhookDelivery,
  WebhookDeliveryStatus,
} from "../db/entities/notifications/WebhookDelivery.ts";
import { requireMasterKey } from "../secrets/keyring.ts";
import { decrypt } from "../secrets/vault.ts";

export const WEBHOOK_SIGNATURE_HEADER = "X-Fulcrum-Signature-256";
export const WEBHOOK_DELIVERY_ID_HEADER = "X-Fulcrum-Delivery-Id";
export const WEBHOOK_MAX_ATTEMPTS = 5;
export const WEBHOOK_MAX_BACKOFF_MS = 32_000;

export type WebhookFetch = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface DispatchWebhookEventInput {
  em: WebhookDispatcherEntityManager;
  orgId: string;
  eventId?: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  fetch?: WebhookFetch;
  now?: () => Date;
}

export interface WebhookDispatcherEntityManager {
  find<T>(entity: { new (...args: never[]): T }, where: unknown): Promise<T[]>;
  create<T>(entity: { new (...args: never[]): T }, data: Partial<T>): T;
  persist(entity: unknown): void;
  flush(): Promise<void>;
}

type DispatchableWebhook = Webhook & {
  org: Org | { id: string };
};

export function signWebhookPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function webhookMatchesEvent(
  eventsFilter: string[] | Record<string, unknown> | null | undefined,
  eventType: string,
): boolean {
  if (!eventsFilter) return true;
  if (Array.isArray(eventsFilter)) return eventsFilter.length === 0 || eventsFilter.includes(eventType);
  return Object.keys(eventsFilter).length === 0 || Boolean(eventsFilter[eventType]);
}

export async function dispatchWebhookEvent(input: DispatchWebhookEventInput): Promise<WebhookDelivery[]> {
  const now = input.now ?? (() => new Date());
  const fetchImpl = input.fetch ?? fetch;
  const webhooks = await input.em.find(Webhook, {
    org: { id: input.orgId },
    enabled: true,
  }) as DispatchableWebhook[];
  const matching = webhooks.filter((webhook) => webhook.enabled && webhookMatchesEvent(webhook.eventsFilter, input.eventType));
  const deliveries: WebhookDelivery[] = [];

  for (const webhook of matching) {
    const delivery = input.em.create(WebhookDelivery, {
      org: input.em.create(Org, { id: input.orgId }),
      webhook,
      eventId: input.eventId ?? null,
      status: WebhookDeliveryStatus.Pending,
      attempt: 0,
      payload: input.payload,
      responseCode: null,
      error: null,
      nextRetryAt: null,
    });

    input.em.persist(delivery);
    await input.em.flush();
    deliveries.push(delivery);

    await deliverWithRetry({
      delivery,
      webhook,
      payload: input.payload,
      fetch: fetchImpl,
      now,
      flush: () => input.em.flush(),
    });
  }

  return deliveries;
}

async function deliverWithRetry(input: {
  delivery: WebhookDelivery;
  webhook: DispatchableWebhook;
  payload: Record<string, unknown>;
  fetch: WebhookFetch;
  now: () => Date;
  flush: () => Promise<void>;
}): Promise<void> {
  const body = JSON.stringify(input.payload);
  const secret = await resolveWebhookSecret(input.webhook.encryptedSecret);

  for (let attempt = 1; attempt <= WEBHOOK_MAX_ATTEMPTS; attempt += 1) {
    input.delivery.attempt = attempt;
    input.delivery.status = attempt === 1 ? WebhookDeliveryStatus.Pending : WebhookDeliveryStatus.Retrying;
    input.delivery.nextRetryAt = null;
    input.delivery.error = null;

    try {
      const response = await input.fetch(input.webhook.url, {
        method: "POST",
        headers: buildWebhookHeaders(input.delivery.id, secret, body),
        body,
      });
      const responseText = await response.text().catch(() => "");
      input.delivery.responseCode = response.status;

      if (response.status >= 200 && response.status < 300) {
        input.delivery.status = WebhookDeliveryStatus.Delivered;
        input.delivery.error = null;
        input.delivery.nextRetryAt = null;
        input.webhook.lastDeliveryAt = input.now();
        await input.flush();
        return;
      }

      input.delivery.error = responseText || `HTTP ${response.status}`;
    } catch (error) {
      input.delivery.responseCode = null;
      input.delivery.error = error instanceof Error ? error.message : String(error);
    }

    if (attempt >= WEBHOOK_MAX_ATTEMPTS) {
      input.delivery.status = WebhookDeliveryStatus.Failed;
      input.delivery.nextRetryAt = null;
      await input.flush();
      return;
    }

    input.delivery.status = WebhookDeliveryStatus.Retrying;
    input.delivery.nextRetryAt = new Date(input.now().getTime() + backoffMsForAttempt(attempt));
    await input.flush();
  }
}

function buildWebhookHeaders(deliveryId: string, secret: string | null, body: string): Headers {
  const headers = new Headers({
    "Content-Type": "application/json",
    [WEBHOOK_DELIVERY_ID_HEADER]: deliveryId,
  });
  if (secret) headers.set(WEBHOOK_SIGNATURE_HEADER, signWebhookPayload(secret, body));
  return headers;
}

function backoffMsForAttempt(attempt: number): number {
  return Math.min(2 ** (attempt - 1) * 1_000, WEBHOOK_MAX_BACKOFF_MS);
}

async function resolveWebhookSecret(encryptedSecret: string | null): Promise<string | null> {
  if (!encryptedSecret) return null;
  if (encryptedSecret.startsWith("plain:")) {
    return Buffer.from(encryptedSecret.slice("plain:".length), "base64").toString("utf8");
  }

  const masterKey = await requireMasterKey();
  const plain = decrypt(masterKey.key, new Uint8Array(Buffer.from(encryptedSecret, "base64url")));
  return new TextDecoder().decode(plain);
}
