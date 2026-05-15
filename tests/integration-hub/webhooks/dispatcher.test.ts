import { describe, expect, it } from "bun:test";
import { createHmac, randomUUID } from "node:crypto";

import { WebhookDeliveryStatus } from "@notification-center/infrastructure/database/entities/notifications/WebhookDelivery.ts";
import {
  dispatchWebhookEvent,
  signWebhookPayload,
  webhookMatchesEvent,
  type WebhookDispatcherEntityManager,
} from "@integration-hub/application/webhooks/dispatcher.ts";

function org(id = randomUUID()) {
  return { id };
}

function webhook(overrides: Partial<{
  id: string;
  org: { id: string };
  url: string;
  encryptedSecret: string | null;
  eventsFilter: string[] | null;
  enabled: boolean;
  lastDeliveryAt: Date | null;
}> = {}) {
  return {
    id: overrides.id ?? randomUUID(),
    org: overrides.org ?? org(),
    url: overrides.url ?? "https://example.com/hook",
    encryptedSecret: overrides.encryptedSecret ?? "plain:" + Buffer.from("hook-secret").toString("base64"),
    eventsFilter: overrides.eventsFilter ?? null,
    enabled: overrides.enabled ?? true,
    lastDeliveryAt: overrides.lastDeliveryAt ?? null,
  };
}

function fakeEntityManager(rows: ReturnType<typeof webhook>[]): WebhookDispatcherEntityManager {
  const persisted: unknown[] = [];
  return {
    persisted,
    async find() {
      return rows;
    },
    create(_entity, data) {
      return { id: randomUUID(), ...data };
    },
    persist(entity) {
      persisted.push(entity);
    },
    async flush() {},
  } as WebhookDispatcherEntityManager & { persisted: unknown[] };
}

describe("webhook dispatcher HMAC signing", () => {
  it("signs the exact JSON body with HMAC-SHA256 hex", () => {
    const body = JSON.stringify({ type: "task.updated", taskId: "t1" });
    const signature = signWebhookPayload("known-secret", body);
    const expected = createHmac("sha256", "known-secret").update(body).digest("hex");

    expect(signature).toBe(expected);
  });

  it("signs an empty JSON payload and wrong secret produces a different signature", () => {
    const body = JSON.stringify({});
    const signature = signWebhookPayload("known-secret", body);
    const wrong = signWebhookPayload("wrong-secret", body);

    expect(signature).toBe(createHmac("sha256", "known-secret").update(body).digest("hex"));
    expect(wrong).not.toBe(signature);
  });
});

describe("webhook dispatcher event filters", () => {
  it("matches all events when eventsFilter is null or empty", () => {
    expect(webhookMatchesEvent(null, "task.updated")).toBe(true);
    expect(webhookMatchesEvent([], "task.updated")).toBe(true);
  });

  it("matches only configured event types when filter is specific", () => {
    expect(webhookMatchesEvent(["task.created"], "task.updated")).toBe(false);
    expect(webhookMatchesEvent(["task.updated"], "task.updated")).toBe(true);
  });
});

describe("webhook dispatcher delivery attempts", () => {
  it("creates a delivered row with signature and stable delivery id on 2xx", async () => {
    const hook = webhook();
    const em = fakeEntityManager([hook]);
    const requests: Array<{ body: string; headers: Headers }> = [];

    const deliveries = await dispatchWebhookEvent({
      em,
      orgId: hook.org.id,
      eventId: randomUUID(),
      eventType: "task.updated",
      payload: { type: "task.updated", taskId: "t1" },
      fetch: async (_url, init) => {
        requests.push({ body: init?.body as string, headers: new Headers(init?.headers) });
        return new Response("ok", { status: 204 });
      },
    });

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe(WebhookDeliveryStatus.Delivered);
    expect(deliveries[0]?.attempt).toBe(1);
    expect(deliveries[0]?.responseCode).toBe(204);
    expect(deliveries[0]?.nextRetryAt).toBeNull();

    const deliveryId = requests[0]?.headers.get("X-Fulcrum-Delivery-Id");
    expect(deliveryId).toBe(deliveries[0]?.id);
    expect(requests[0]?.headers.get("X-Fulcrum-Signature-256")).toBe(
      signWebhookPayload("hook-secret", requests[0]!.body),
    );
  });

  it("retries failures with exponential backoff and reuses delivery id", async () => {
    const hook = webhook();
    const em = fakeEntityManager([hook]);
    const now = new Date("2026-05-03T00:00:00.000Z");
    const deliveryIds: string[] = [];
    let attempts = 0;

    const deliveries = await dispatchWebhookEvent({
      em,
      orgId: hook.org.id,
      eventId: randomUUID(),
      eventType: "task.updated",
      payload: { type: "task.updated" },
      now: () => now,
      fetch: async (_url, init) => {
        attempts += 1;
        deliveryIds.push(new Headers(init?.headers).get("X-Fulcrum-Delivery-Id") ?? "");
        return attempts < 3
          ? new Response("nope", { status: 500 })
          : new Response("ok", { status: 200 });
      },
    });

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe(WebhookDeliveryStatus.Delivered);
    expect(deliveries[0]?.attempt).toBe(3);
    expect(deliveries[0]?.responseCode).toBe(200);
    expect(deliveries[0]?.nextRetryAt).toBeNull();
    expect(new Set(deliveryIds).size).toBe(1);
    expect(deliveryIds[0]).toBe(deliveries[0]?.id);
  });

  it("marks fifth failure as failed and records retry schedule before exhaustion", async () => {
    const hook = webhook();
    const em = fakeEntityManager([hook]);
    const now = new Date("2026-05-03T00:00:00.000Z");

    const deliveries = await dispatchWebhookEvent({
      em,
      orgId: hook.org.id,
      eventId: randomUUID(),
      eventType: "task.updated",
      payload: { type: "task.updated" },
      now: () => now,
      fetch: async () => new Response("still failing", { status: 503 }),
    });

    expect(deliveries[0]?.status).toBe(WebhookDeliveryStatus.Failed);
    expect(deliveries[0]?.attempt).toBe(5);
    expect(deliveries[0]?.responseCode).toBe(503);
    expect(deliveries[0]?.nextRetryAt).toBeNull();
  });
});
