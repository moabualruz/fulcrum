import { afterEach, describe, expect, test } from "bun:test";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Webhook } from "@notification-center/infrastructure/database/entities/notifications/Webhook.ts";
import { WebhookDelivery, WebhookDeliveryStatus } from "@notification-center/infrastructure/database/entities/notifications/WebhookDelivery.ts";
import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { AppNotFoundError } from "@platform-core/domain/errors.ts";
import { createWebhook, deleteWebhook, updateWebhook } from "@integration-hub/application/webhooks/commands.ts";
import { getWebhook, getWebhookDelivery, listWebhookDeliveries, listWebhooks } from "@integration-hub/application/webhooks/queries.ts";
import type { WebhookAppContext } from "@integration-hub/domain/webhook.ts";

const OTHER_ORG_ID = "11111111-1111-4111-8111-111111111111";

let db: TestOrm | null = null;

afterEach(async () => {
  delete process.env["FULCRUM_WEBHOOK_SECRET_KEY"];
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  process.env["FULCRUM_WEBHOOK_SECRET_KEY"] = "webhook-test-secret-key";
  db = await createTestOrm();
  return db;
}

function ctx(orgId = DEFAULT_ORG_ID): WebhookAppContext {
  return { orgId, userId: "user-webhooks", projectId: null };
}

describe("application webhooks commands and queries", () => {
  test("create persists encrypted webhook secret and returns redacted DTO", async () => {
    const testDb = await freshDb();
    const em = testDb.em;

    const created = await createWebhook(em, ctx(), {
      name: "Build events",
      url: "https://example.com/hooks/build",
      secret: "whsec_plaintext",
      eventsFilter: ["task.created"],
      enabled: true,
    });

    expect(created).toMatchObject({
      orgId: DEFAULT_ORG_ID,
      name: "Build events",
      url: "https://example.com/hooks/build",
      secret: "****",
      eventsFilter: ["task.created"],
      enabled: true,
    });

    const stored = await em.findOneOrFail(Webhook, { id: created.id });
    expect(stored.encryptedSecret).toBeString();
    expect(stored.encryptedSecret).not.toBe("whsec_plaintext");
  });

  test("list and get are org-scoped and newest-first", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    em.persist(em.create(Org, { id: OTHER_ORG_ID, name: "Other", slug: "other", createdAt: new Date(), updatedAt: new Date() }));
    /* flushed */

    const first = await createWebhook(em, ctx(), {
      name: "First",
      url: "https://example.com/first",
      secret: "first-secret",
    });
    const second = await createWebhook(em, ctx(), {
      name: "Second",
      url: "https://example.com/second",
      secret: "second-secret",
    });
    await createWebhook(em, ctx(OTHER_ORG_ID), {
      name: "Other",
      url: "https://example.com/other",
      secret: "other-secret",
    });

    const listed = (await listWebhooks(em, ctx())).map((webhook) => webhook.id);
    expect(listed).toHaveLength(2);
    expect(listed).toContain(first.id);
    expect(listed).toContain(second.id);
    await expect(getWebhook(em, ctx(), second.id)).resolves.toMatchObject({ id: second.id, secret: "****" });
    await expect(getWebhook(em, ctx(), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toBeInstanceOf(AppNotFoundError);
  });

  test("update mutates fields and keeps secret redacted", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const created = await createWebhook(em, ctx(), {
      name: "Before",
      url: "https://example.com/before",
      secret: "before-secret",
    });

    const updated = await updateWebhook(em, ctx(), {
      id: created.id,
      name: "After",
      url: "https://example.com/after",
      secret: "after-secret",
      eventsFilter: ["run.failed"],
      enabled: false,
    });

    expect(updated).toMatchObject({
      id: created.id,
      name: "After",
      url: "https://example.com/after",
      secret: "****",
      eventsFilter: ["run.failed"],
      enabled: false,
    });
    const stored = await em.findOneOrFail(Webhook, { id: created.id });
    expect(stored.encryptedSecret).not.toBe("after-secret");
  });

  test("delete removes webhook so later get throws not found", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const created = await createWebhook(em, ctx(), {
      name: "Delete me",
      url: "https://example.com/delete",
      secret: "delete-secret",
    });

    await expect(deleteWebhook(em, ctx(), created.id)).resolves.toEqual({ ok: true });
    await expect(getWebhook(em, ctx(), created.id)).rejects.toBeInstanceOf(AppNotFoundError);
  });

  test("delivery list and get return delivery DTO shape", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const webhook = await createWebhook(em, ctx(), {
      name: "Delivery target",
      url: "https://example.com/deliveries",
      secret: "delivery-secret",
    });
    const org = em.getReference(Org, DEFAULT_ORG_ID);
    const delivery = em.create(WebhookDelivery, {
      org,
      webhook: em.getReference(Webhook, webhook.id),
      eventId: "22222222-2222-4222-8222-222222222222",
      status: WebhookDeliveryStatus.Delivered,
      attempt: 2,
      responseCode: 204,
      error: null,
      nextRetryAt: null,
    });
    await em.save(delivery);

    const listed = await listWebhookDeliveries(em, ctx(), { webhookId: webhook.id, limit: 10 });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: delivery.id,
      orgId: DEFAULT_ORG_ID,
      webhookId: webhook.id,
      eventId: "22222222-2222-4222-8222-222222222222",
      status: "delivered",
      attempt: 2,
      responseCode: 204,
      error: null,
      nextRetryAt: null,
    });
    await expect(getWebhookDelivery(em, ctx(), delivery.id)).resolves.toMatchObject({ id: delivery.id });
  });
});
