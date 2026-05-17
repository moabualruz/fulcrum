import { createRequire } from "node:module";

import type { DeliveryHandlerResult, NotificationDeliveryLike } from "./webhook.ts";

export interface PushConfig {
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  subject?: string;
  timeoutMs?: number;
}

export interface PushDeliveryOptions {
  now?: () => Date;
  config?: PushConfig;
  sendPush?: (subscription: unknown, payload: string, config: Required<PushConfig>) => Promise<unknown>;
}

export async function deliverPushNotification(
  delivery: NotificationDeliveryLike,
  options: PushDeliveryOptions = {},
): Promise<DeliveryHandlerResult> {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const attemptCount = delivery.attemptCount + 1;
  const maxAttempts = delivery.maxAttempts ?? 5;
  const idempotencyKey = stringPayload(delivery.payload, "idempotencyKey") ?? `${delivery.id}:${attemptCount}`;
  const config = resolvePushConfig(options.config);

  if (!config) {
    return failedResult("missing_config", "Web Push VAPID configuration missing", delivery, attemptCount, maxAttempts, startedAt, now(), idempotencyKey);
  }

  const subscription = delivery.payload["subscription"];
  if (!subscription || typeof subscription !== "object") {
    return failedResult("missing_subscription", "Web Push subscription missing", delivery, attemptCount, maxAttempts, startedAt, now(), idempotencyKey);
  }

  try {
    const payload = JSON.stringify({
      title: stringPayload(delivery.payload, "title") ?? "Fulcrum notification",
      body: stringPayload(delivery.payload, "body") ?? "",
      eventId: stringPayload(delivery.payload, "eventId"),
      eventType: stringPayload(delivery.payload, "eventType"),
    });
    if (options.sendPush) await options.sendPush(subscription, payload, config);
    else await sendWithWebPush(subscription, payload, config);

    const finishedAt = now();
    return {
      provider: "push",
      status: "sent",
      attemptCount,
      maxAttempts,
      nextAttemptAt: null,
      lastAttemptAt: startedAt,
      sentAt: startedAt,
      responseStatus: 201,
      responseBodyExcerpt: "accepted",
      errorCode: null,
      errorMessage: null,
      durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      idempotencyKey,
    };
  } catch (error) {
    return failedResult(
      "push_error",
      error instanceof Error ? redactPushSecrets(error.message, config) : "Web Push delivery failed",
      delivery,
      attemptCount,
      maxAttempts,
      startedAt,
      now(),
      idempotencyKey,
    );
  }
}

export function resolvePushConfig(config: PushConfig | undefined = undefined): Required<PushConfig> | null {
  const cfg = config ?? {};
  const vapidPublicKey = cfg.vapidPublicKey ?? process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = cfg.vapidPrivateKey ?? process.env.VAPID_PRIVATE_KEY;
  const subject = cfg.subject ?? process.env.WEB_PUSH_SUBJECT;
  const timeoutMs = Number(cfg.timeoutMs ?? process.env.WEB_PUSH_TIMEOUT_MS ?? 10_000);
  if (!vapidPublicKey || !vapidPrivateKey || !subject) return null;
  return { vapidPublicKey, vapidPrivateKey, subject, timeoutMs };
}

async function sendWithWebPush(subscription: unknown, payload: string, config: Required<PushConfig>): Promise<void> {
  const require = createRequire(import.meta.url);
  const webPush = require("web-push") as {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(subscription: unknown, payload: string, options: { timeout: number }): Promise<unknown>;
  };
  webPush.setVapidDetails(config.subject, config.vapidPublicKey, config.vapidPrivateKey);
  await webPush.sendNotification(subscription, payload, { timeout: config.timeoutMs });
}

function failedResult(
  errorCode: string,
  errorMessage: string,
  delivery: NotificationDeliveryLike,
  attemptCount: number,
  maxAttempts: number,
  startedAt: Date,
  finishedAt: Date,
  idempotencyKey: string,
): DeliveryHandlerResult {
  return {
    provider: "push",
    status: errorCode === "missing_config" ? "failed" : attemptCount >= maxAttempts ? "failed" : "retrying",
    attemptCount,
    maxAttempts,
    nextAttemptAt: errorCode === "missing_config" || attemptCount >= maxAttempts ? null : new Date(startedAt.getTime() + 60_000),
    lastAttemptAt: startedAt,
    sentAt: null,
    responseStatus: null,
    responseBodyExcerpt: null,
    errorCode,
    errorMessage,
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    idempotencyKey,
  };
}

function stringPayload(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function redactPushSecrets(message: string, config: Required<PushConfig>): string {
  let redacted = message;
  for (const secret of [config.vapidPublicKey, config.vapidPrivateKey]) {
    if (secret) redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}
