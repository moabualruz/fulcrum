import { createHmac } from "node:crypto";

export const FULCRUM_EVENT_HEADER = "X-Fulcrum-Event";
export const FULCRUM_DELIVERY_HEADER = "X-Fulcrum-Delivery";
export const FULCRUM_TIMESTAMP_HEADER = "X-Fulcrum-Timestamp";
export const FULCRUM_SIGNATURE_HEADER = "X-Fulcrum-Signature";

export type WebhookDeliveryStatusResult = "sent" | "retrying" | "failed";

export interface NotificationDeliveryLike {
  id: string;
  channel: string;
  status: string;
  attemptCount: number;
  maxAttempts?: number | null;
  payload: Record<string, unknown>;
}

export interface DeliveryHandlerResult {
  provider: string;
  status: WebhookDeliveryStatusResult | "sent" | "failed";
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  lastAttemptAt: Date;
  sentAt?: Date | null;
  responseStatus?: number | null;
  responseBodyExcerpt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  durationMs: number;
  idempotencyKey: string;
}

export interface WebhookDeliveryOptions {
  fetch?: (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
  now?: () => Date;
}

export const WEBHOOK_RETRY_DELAYS_MS = [0, 60_000, 3_600_000, 21_600_000] as const;
const DEFAULT_WEBHOOK_MAX_ATTEMPTS = 5;
const RESPONSE_EXCERPT_LIMIT = 512;

export async function deliverWebhookNotification(
  delivery: NotificationDeliveryLike,
  options: WebhookDeliveryOptions = {},
): Promise<DeliveryHandlerResult> {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const fetchImpl = options.fetch ?? fetch;
  const payload = delivery.payload ?? {};
  const eventType = stringPayload(payload, "eventType") ?? stringPayload(payload, "verb") ?? "notification.delivery";
  const webhook = objectPayload(payload, "webhook");
  const url = stringPayload(webhook, "url");
  const secret = stringPayload(webhook, "secret") ?? stringPayload(webhook, "encryptedSecret");
  const attemptCount = delivery.attemptCount + 1;
  const maxAttempts = delivery.maxAttempts ?? DEFAULT_WEBHOOK_MAX_ATTEMPTS;
  const idempotencyKey = stringPayload(payload, "idempotencyKey") ?? `${delivery.id}:${attemptCount}`;

  if (!url) {
    return failedResult(delivery, "webhook", attemptCount, maxAttempts, startedAt, now(), {
      errorCode: "missing_endpoint",
      errorMessage: "Webhook endpoint missing",
      idempotencyKey,
    });
  }
  if (!secret) {
    return failedResult(delivery, "webhook", attemptCount, maxAttempts, startedAt, now(), {
      errorCode: "missing_secret",
      errorMessage: "Webhook secret missing",
      idempotencyKey,
    });
  }

  const rawBody = JSON.stringify({
    deliveryId: delivery.id,
    eventType,
    payload: omitWebhookSecret(payload),
  });
  const timestamp = String(Math.floor(startedAt.getTime() / 1000));
  const headers = buildWebhookHeaders({
    deliveryId: delivery.id,
    eventType,
    secret,
    timestamp,
    rawBody,
  });

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: rawBody,
    });
    const body = await response.text().catch(() => "");
    const finishedAt = now();
    const responseBodyExcerpt = excerpt(body);

    if (response.status >= 200 && response.status < 300) {
      return {
        provider: "webhook",
        status: "sent",
        attemptCount,
        maxAttempts,
        nextAttemptAt: null,
        lastAttemptAt: startedAt,
        sentAt: startedAt,
        responseStatus: response.status,
        responseBodyExcerpt,
        errorCode: null,
        errorMessage: null,
        durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
        idempotencyKey,
      };
    }

    return retryOrFail(delivery, attemptCount, maxAttempts, startedAt, finishedAt, {
      responseStatus: response.status,
      responseBodyExcerpt,
      errorCode: `http_${response.status}`,
      errorMessage: responseBodyExcerpt || `HTTP ${response.status}`,
      idempotencyKey,
    });
  } catch (error) {
    const finishedAt = now();
    return retryOrFail(delivery, attemptCount, maxAttempts, startedAt, finishedAt, {
      responseStatus: null,
      responseBodyExcerpt: null,
      errorCode: "network_error",
      errorMessage: error instanceof Error ? error.message : String(error),
      idempotencyKey,
    });
  }
}

export function buildWebhookHeaders(input: {
  deliveryId: string;
  eventType: string;
  secret: string;
  timestamp: string;
  rawBody: string;
}): Headers {
  return new Headers({
    "Content-Type": "application/json",
    [FULCRUM_EVENT_HEADER]: input.eventType,
    [FULCRUM_DELIVERY_HEADER]: input.deliveryId,
    [FULCRUM_TIMESTAMP_HEADER]: input.timestamp,
    [FULCRUM_SIGNATURE_HEADER]: signWebhookPayload(input.secret, input.timestamp, input.rawBody),
  });
}

export function signWebhookPayload(secret: string, timestamp: string, rawBody: string): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `sha256=${digest}`;
}

export function webhookMatchesEvent(
  eventsFilter: string[] | Record<string, unknown> | null | undefined,
  eventType: string,
): boolean {
  if (!eventsFilter) return true;
  if (Array.isArray(eventsFilter)) return eventsFilter.length === 0 || eventsFilter.includes(eventType);
  return Object.keys(eventsFilter).length === 0 || Boolean(eventsFilter[eventType]);
}

function retryOrFail(
  delivery: NotificationDeliveryLike,
  attemptCount: number,
  maxAttempts: number,
  startedAt: Date,
  finishedAt: Date,
  details: Pick<DeliveryHandlerResult, "responseStatus" | "responseBodyExcerpt" | "errorCode" | "errorMessage" | "idempotencyKey">,
): DeliveryHandlerResult {
  const failed = attemptCount >= maxAttempts;
  return {
    provider: "webhook",
    status: failed ? "failed" : "retrying",
    attemptCount,
    maxAttempts,
    nextAttemptAt: failed ? null : nextAttemptAt(startedAt, attemptCount),
    lastAttemptAt: startedAt,
    sentAt: null,
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    ...details,
  };
}

function failedResult(
  delivery: NotificationDeliveryLike,
  provider: string,
  attemptCount: number,
  maxAttempts: number,
  startedAt: Date,
  finishedAt: Date,
  details: Pick<DeliveryHandlerResult, "errorCode" | "errorMessage" | "idempotencyKey">,
): DeliveryHandlerResult {
  return {
    provider,
    status: "failed",
    attemptCount,
    maxAttempts,
    nextAttemptAt: null,
    lastAttemptAt: startedAt,
    sentAt: null,
    responseStatus: null,
    responseBodyExcerpt: null,
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    ...details,
  };
}

function nextAttemptAt(now: Date, attemptCount: number): Date {
  const delayIndex = Math.max(1, attemptCount - 1);
  const delay = WEBHOOK_RETRY_DELAYS_MS[Math.min(delayIndex, WEBHOOK_RETRY_DELAYS_MS.length - 1)] ?? 21_600_000;
  return new Date(now.getTime() + delay);
}

function objectPayload(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = payload[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringPayload(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function excerpt(value: string): string {
  return value.length > RESPONSE_EXCERPT_LIMIT ? `${value.slice(0, RESPONSE_EXCERPT_LIMIT)}...` : value;
}

function omitWebhookSecret(payload: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...payload };
  const webhook = objectPayload(copy, "webhook");
  if (Object.keys(webhook).length > 0) {
    copy["webhook"] = {
      ...webhook,
      secret: webhook["secret"] ? "[redacted]" : undefined,
      encryptedSecret: webhook["encryptedSecret"] ? "[redacted]" : undefined,
    };
  }
  return copy;
}
