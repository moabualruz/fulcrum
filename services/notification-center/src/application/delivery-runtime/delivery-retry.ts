export const NOTIFICATION_DELIVERY_TASK = "notification-delivery";
export const NOTIFICATION_DELIVERY_RETRY_CRON = {
  name: "notification-delivery-retry",
  taskName: "notification-delivery-retry",
  intervalMs: 60_000,
} as const;

export interface RetryQueue {
  addJob(name: string, payload: Record<string, unknown>): Promise<unknown>;
}

export interface RetryableDelivery {
  id: string;
  status: string;
  attemptCount: number;
  nextAttemptAt?: Date | null;
}

export interface DeliveryRetryRepositories {
  deliveryRepo: {
    findDueHeld(now: Date): Promise<RetryableDelivery[]>;
    update(delivery: RetryableDelivery, patch: Record<string, unknown>): Promise<void>;
  };
  queue: RetryQueue;
}

export async function requeueDueNotificationDeliveries(
  repositories: DeliveryRetryRepositories,
  options: { now?: () => Date } = {},
): Promise<number> {
  const now = options.now?.() ?? new Date();
  const deliveries = await repositories.deliveryRepo.findDueHeld(now);
  for (const delivery of deliveries) {
    await repositories.deliveryRepo.update(delivery, {
      status: "queued",
      nextAttemptAt: null,
    });
    await repositories.queue.addJob(NOTIFICATION_DELIVERY_TASK, { deliveryId: delivery.id });
  }
  return deliveries.length;
}
