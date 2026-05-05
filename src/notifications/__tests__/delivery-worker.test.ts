import { describe, expect, test } from "bun:test";

import {
  createNotificationDeliveryTask,
  retryHeldQuietHoursDeliveries,
  type NotificationDeliveryRepositories,
} from "../delivery-worker.ts";
import { deliverPushNotification } from "../delivery-handlers/push.ts";
import { deliverSmtpNotification } from "../delivery-handlers/smtp.ts";
import {
  FULCRUM_DELIVERY_HEADER,
  FULCRUM_EVENT_HEADER,
  FULCRUM_SIGNATURE_HEADER,
  FULCRUM_TIMESTAMP_HEADER,
  deliverWebhookNotification,
} from "../delivery-handlers/webhook.ts";
import { evaluateQuietHours } from "../quiet-hours.ts";

const ORG_ID = "00000000-0000-0000-0000-00000000000a";
const DELIVERY_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";

describe("notification delivery worker", () => {
  test("SMTP handler calls transporter once and stores delivered timestamp", async () => {
    const sent: unknown[] = [];
    const delivery = deliveryRow({ channel: "email" });

    const result = await deliverSmtpNotification(delivery, {
      now: () => new Date("2026-05-05T12:00:00.000Z"),
      config: {
        host: "smtp.example.test",
        port: 587,
        user: "smtp-user",
        pass: "smtp-pass",
        from: "Fulcrum <notify@example.test>",
      },
      createTransporter() {
        return {
          async sendMail(message: unknown) {
            sent.push(message);
            return { messageId: "smtp-message-1" };
          },
        };
      },
    });

    expect(sent).toHaveLength(1);
    expect(result).toMatchObject({
      status: "sent",
      provider: "smtp",
      sentAt: new Date("2026-05-05T12:00:00.000Z"),
      responseStatus: 202,
    });
  });

  test("webhook handler writes endpoint status and HMAC signature header", async () => {
    const requests: Array<{ url: string; headers: Headers; body: string }> = [];
    const delivery = deliveryRow({
      channel: "webhook",
      payload: {
        eventId: "event-1",
        eventType: "repo.sync.completed",
        webhook: {
          url: "https://hooks.example.test/fulcrum",
          secret: "webhook-secret",
        },
      },
    });

    const result = await deliverWebhookNotification(delivery, {
      now: () => new Date("2026-05-05T12:00:00.000Z"),
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          headers: new Headers(init?.headers),
          body: String(init?.body),
        });
        return new Response("accepted", { status: 202 });
      },
    });

    expect(result).toMatchObject({
      status: "sent",
      provider: "webhook",
      responseStatus: 202,
      responseBodyExcerpt: "accepted",
      attemptCount: 1,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe("https://hooks.example.test/fulcrum");
    expect(requests[0]!.headers.get(FULCRUM_EVENT_HEADER)).toBe("repo.sync.completed");
    expect(requests[0]!.headers.get(FULCRUM_DELIVERY_HEADER)).toBe(DELIVERY_ID);
    expect(requests[0]!.headers.get(FULCRUM_TIMESTAMP_HEADER)).toBe("1777982400");
    expect(requests[0]!.headers.get(FULCRUM_SIGNATURE_HEADER)).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  test("webhook handler sets retry metadata on 5xx with default backoff schedule", async () => {
    const delivery = deliveryRow({
      channel: "webhook",
      attemptCount: 1,
      payload: {
        eventId: "event-1",
        eventType: "artifact.created",
        webhook: { url: "https://hooks.example.test/fail", secret: "webhook-secret" },
      },
    });

    const result = await deliverWebhookNotification(delivery, {
      now: () => new Date("2026-05-05T12:00:00.000Z"),
      fetch: async () => new Response("server unavailable", { status: 503 }),
    });

    expect(result).toMatchObject({
      status: "retrying",
      provider: "webhook",
      responseStatus: 503,
      responseBodyExcerpt: "server unavailable",
      attemptCount: 2,
      errorCode: "http_503",
    });
    expect(result.nextAttemptAt?.toISOString()).toBe("2026-05-05T12:01:00.000Z");
  });

  test("push handler degrades to failed state when VAPID keys are absent", async () => {
    const result = await deliverPushNotification(deliveryRow({ channel: "push" }), {
      now: () => new Date("2026-05-05T12:00:00.000Z"),
      config: {},
    });

    expect(result).toMatchObject({
      status: "failed",
      provider: "push",
      errorCode: "missing_config",
      attemptCount: 1,
    });
  });

  test("quiet-hours delivery holds until window end, then retries as queued", async () => {
    const heldAt = new Date("2026-05-05T22:30:00.000Z");
    const quiet = evaluateQuietHours({
      quietHours: {
        userId: USER_ID,
        tz: "UTC",
        startHour: 22,
        endHour: 7,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      },
      now: heldAt,
    });
    expect(quiet).toMatchObject({
      quiet: true,
      status: "held-quiet-hours",
    });
    expect(quiet.nextAttemptAt?.toISOString()).toBe("2026-05-06T07:00:00.000Z");

    const deliveries = [
      deliveryRow({
        channel: "email",
        status: "held-quiet-hours",
        attemptCount: 2,
        nextAttemptAt: quiet.nextAttemptAt,
      }),
    ];
    const jobs: unknown[] = [];
    const repos = createDeliveryRepos(deliveries, jobs);

    await retryHeldQuietHoursDeliveries(repos, {
      now: () => new Date("2026-05-06T07:00:01.000Z"),
    });

    expect(deliveries[0]).toMatchObject({
      status: "queued",
      attemptCount: 2,
    });
    expect(jobs).toEqual([{ name: "notification-delivery", payload: { deliveryId: DELIVERY_ID } }]);
  });

  test("worker persists handler status and attempt metadata", async () => {
    const delivery = deliveryRow({ channel: "push" });
    const repos = createDeliveryRepos([delivery], []);

    await createNotificationDeliveryTask(repos, {
      now: () => new Date("2026-05-05T12:00:00.000Z"),
      pushConfig: {},
    })({ deliveryId: DELIVERY_ID });

    expect(delivery).toMatchObject({
      status: "failed",
      provider: "push",
      attemptCount: 1,
      errorCode: "missing_config",
    });
    expect(delivery.lastAttemptAt?.toISOString()).toBe("2026-05-05T12:00:00.000Z");
  });
});

function deliveryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DELIVERY_ID,
    orgId: ORG_ID,
    userId: USER_ID,
    ruleId: "33333333-3333-3333-3333-333333333333",
    notificationId: "44444444-4444-4444-4444-444444444444",
    channel: "email",
    status: "pending",
    attemptCount: 0,
    maxAttempts: 5,
    payload: {
      eventId: "event-1",
      eventType: "repo.sync.completed",
      title: "Repo synced",
      body: "main updated",
      to: "user@example.test",
    },
    nextAttemptAt: null,
    lastAttemptAt: null,
    sentAt: null,
    ...overrides,
  };
}

function createDeliveryRepos(
  deliveries: Array<Record<string, unknown>>,
  jobs: unknown[],
): NotificationDeliveryRepositories {
  return {
    deliveryRepo: {
      async findOneOrFail(id) {
        const delivery = deliveries.find((row) => row["id"] === id);
        if (!delivery) throw new Error(`missing delivery ${id}`);
        return delivery;
      },
      async findDueHeld(now) {
        return deliveries.filter((row) => row["status"] === "held-quiet-hours" && row["nextAttemptAt"] <= now);
      },
      async update(delivery, patch) {
        Object.assign(delivery, patch);
      },
    },
    queue: {
      async addJob(name, payload) {
        jobs.push({ name, payload });
      },
    },
  };
}
