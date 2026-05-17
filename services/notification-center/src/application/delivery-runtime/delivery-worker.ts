import { assertRecordPayload, assertStringField, type WorkerRegistry } from "@platform-core/application/jobs/registry.ts";
import { defineQueue, defineTask } from "@platform-core/application/jobs/queue.ts";
import { requeueDueNotificationDeliveries, type DeliveryRetryRepositories } from "./delivery-retry.ts";
import { deliverPushNotification, type PushConfig, type PushDeliveryOptions } from "./delivery-handlers/push.ts";
import { deliverSmtpNotification, type SmtpConfig, type SmtpDeliveryOptions } from "./delivery-handlers/smtp.ts";
import {
  deliverWebhookNotification,
  type DeliveryHandlerResult,
  type NotificationDeliveryLike,
  type WebhookDeliveryOptions,
} from "./delivery-handlers/webhook.ts";

export const NOTIFICATION_DELIVERY_TASK = "notification-delivery";
export const NOTIFICATION_DELIVERY_RETRY_TASK = "notification-delivery-retry";

export interface NotificationDeliveryPayload {
  deliveryId: string;
}

export interface NotificationDeliveryRepositories extends DeliveryRetryRepositories {
  deliveryRepo: DeliveryRetryRepositories["deliveryRepo"] & {
    findOneOrFail(id: string): Promise<NotificationDeliveryLike & Record<string, unknown>>;
    update(delivery: NotificationDeliveryLike & Record<string, unknown>, patch: Record<string, unknown>): Promise<void>;
  };
}

export interface NotificationDeliveryWorkerOptions {
  now?: () => Date;
  smtpConfig?: SmtpConfig;
  smtpTransport?: SmtpDeliveryOptions["createTransporter"];
  webhookFetch?: WebhookDeliveryOptions["fetch"];
  pushConfig?: PushConfig;
  sendPush?: PushDeliveryOptions["sendPush"];
}

export const notificationDeliveryTaskDefinition = defineTask<NotificationDeliveryPayload>({
  name: NOTIFICATION_DELIVERY_TASK,
  assertPayload: assertNotificationDeliveryPayload,
});

export const notificationDeliveryQueueDefinition = defineQueue(
  NOTIFICATION_DELIVERY_TASK,
  notificationDeliveryTaskDefinition,
);

export const notificationDeliveryRetryTaskDefinition = defineTask<Record<string, never>>({
  name: NOTIFICATION_DELIVERY_RETRY_TASK,
  assertPayload(payload): asserts payload is Record<string, never> {
    assertRecordPayload(payload, NOTIFICATION_DELIVERY_RETRY_TASK);
  },
});

export function createNotificationDeliveryTask(
  repositories: NotificationDeliveryRepositories,
  options: NotificationDeliveryWorkerOptions = {},
): (payload: NotificationDeliveryPayload) => Promise<void> {
  return async (payload) => {
    assertNotificationDeliveryPayload(payload);
    const delivery = await repositories.deliveryRepo.findOneOrFail(payload.deliveryId);
    const result = await deliverNotification(delivery, options);
    await repositories.deliveryRepo.update(delivery, normalizeDeliveryPatch(result));
  };
}

export async function retryHeldQuietHoursDeliveries(
  repositories: NotificationDeliveryRepositories,
  options: { now?: () => Date } = {},
): Promise<number> {
  return requeueDueNotificationDeliveries(repositories, options);
}

export function registerNotificationDeliveryWorkerTasks(
  registry: WorkerRegistry,
  repositories: NotificationDeliveryRepositories,
  options: NotificationDeliveryWorkerOptions = {},
): void {
  registry.registerTask(
    NOTIFICATION_DELIVERY_TASK,
    assertNotificationDeliveryPayload,
    createNotificationDeliveryTask(repositories, options),
  );
  registry.registerTask(
    NOTIFICATION_DELIVERY_RETRY_TASK,
    (payload): asserts payload is Record<string, never> => assertRecordPayload(payload, NOTIFICATION_DELIVERY_RETRY_TASK),
    async () => {
      await retryHeldQuietHoursDeliveries(repositories, options);
    },
  );
}

export function assertNotificationDeliveryPayload(payload: unknown): asserts payload is NotificationDeliveryPayload {
  assertRecordPayload(payload, NOTIFICATION_DELIVERY_TASK);
  assertStringField(payload, "deliveryId", NOTIFICATION_DELIVERY_TASK);
}

async function deliverNotification(
  delivery: NotificationDeliveryLike,
  options: NotificationDeliveryWorkerOptions,
): Promise<DeliveryHandlerResult> {
  if (delivery.channel === "email") {
    return deliverSmtpNotification(delivery, {
      now: options.now,
      config: options.smtpConfig,
      createTransporter: options.smtpTransport,
    });
  }
  if (delivery.channel === "webhook") {
    return deliverWebhookNotification(delivery, {
      now: options.now,
      fetch: options.webhookFetch,
    });
  }
  if (delivery.channel === "push") {
    return deliverPushNotification(delivery, {
      now: options.now,
      config: options.pushConfig,
      sendPush: options.sendPush,
    });
  }
  const now = options.now?.() ?? new Date();
  return {
    provider: delivery.channel,
    status: "failed",
    attemptCount: delivery.attemptCount + 1,
    maxAttempts: delivery.maxAttempts ?? 5,
    nextAttemptAt: null,
    lastAttemptAt: now,
    sentAt: null,
    responseStatus: null,
    responseBodyExcerpt: null,
    errorCode: "unsupported_channel",
    errorMessage: `Unsupported notification channel: ${delivery.channel}`,
    durationMs: 0,
    idempotencyKey: `${delivery.id}:${delivery.attemptCount + 1}`,
  };
}

function normalizeDeliveryPatch(result: DeliveryHandlerResult): Record<string, unknown> {
  return {
    provider: result.provider,
    status: result.status,
    attemptCount: result.attemptCount,
    maxAttempts: result.maxAttempts,
    nextAttemptAt: result.nextAttemptAt,
    retryAfter: result.nextAttemptAt,
    lastAttemptAt: result.lastAttemptAt,
    sentAt: result.sentAt ?? null,
    responseStatus: result.responseStatus ?? null,
    responseBodyExcerpt: result.responseBodyExcerpt ?? null,
    errorCode: result.errorCode ?? null,
    errorMessage: result.errorMessage ?? null,
    lastError: result.errorMessage ?? null,
    durationMs: result.durationMs,
    idempotencyKey: result.idempotencyKey,
  };
}
