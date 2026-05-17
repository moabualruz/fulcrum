import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Webhook } from "@notification-center/infrastructure/database/entities/notifications/Webhook.ts";
import { WebhookDelivery, WebhookDeliveryStatus } from "@notification-center/infrastructure/database/entities/notifications/WebhookDelivery.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { adminSession } from "@test-support/auth-session.ts";
import { createContext } from "../context.ts";
import { webhooksRouter } from "./webhooks.ts";

const ROUTER_ORG_ID = "11111111-1111-4111-8111-111111111111";

let db: TestOrm | null = null;

afterEach(async () => {
  delete process.env["FULCRUM_FEATURES"];
  delete process.env["FULCRUM_WEBHOOK_SECRET_KEY"];
  await db?.close();
  db = null;
});

async function freshCaller(): Promise<ReturnType<typeof webhooksRouter.createCaller>> {
  process.env["FULCRUM_FEATURES"] = "outbound-webhooks";
  process.env["FULCRUM_WEBHOOK_SECRET_KEY"] = "webhook-test-secret-key";
  db = await createTestOrm();
  const seedManager = db.em;
  await seedManager.save(Org, {
    id: ROUTER_ORG_ID,
    name: "Router Org",
    slug: "router-org",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return webhooksRouter.createCaller(createContext({
    session: adminSession({ ...db.seed, orgId: ROUTER_ORG_ID }),
    orgId: ROUTER_ORG_ID,
    userId: db.seed.userId,
    em: db.em,
    container: null,
  }));
}

describe("webhooks tRPC router", () => {
  test("create, list, update, and delete use application persistence surface", async () => {
    const caller = await freshCaller();

    const created = await caller.create({
      name: "Router target",
      url: "https://example.com/router",
      secret: "router-secret",
      eventsFilter: ["task.created"],
      enabled: true,
    });
    expect(created.secret).toBe("****");

    const listed = await caller.list();
    expect(listed.map((webhook) => webhook.id)).toEqual([created.id]);

    const updated = await caller.update({
      id: created.id,
      name: "Router target updated",
      url: "https://example.com/router-updated",
      secret: "router-secret-updated",
      eventsFilter: ["run.completed"],
      enabled: false,
    });
    expect(updated).toMatchObject({
      id: created.id,
      name: "Router target updated",
      secret: "****",
      enabled: false,
    });

    await expect(caller.delete({ id: created.id })).resolves.toEqual({ ok: true });
    await expect(caller.get({ id: created.id })).resolves.toBeNull();
  });

  test("delivery list and get use application delivery queries", async () => {
    const caller = await freshCaller();
    const created = await caller.create({
      name: "Delivery target",
      url: "https://example.com/delivery-router",
      secret: "delivery-router-secret",
    });
    const em = db!.em;
    const delivery = await em.save(WebhookDelivery, {
      org: { id: ROUTER_ORG_ID } as Org,
      webhook: { id: created.id } as Webhook,
      eventId: "33333333-3333-4333-8333-333333333333",
      status: WebhookDeliveryStatus.Failed,
      attempt: 1,
      responseCode: 500,
      error: "boom",
      nextRetryAt: null,
    });

    const listed = await caller.deliveries.list({ webhookId: created.id, limit: 10 });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: delivery.id,
      orgId: ROUTER_ORG_ID,
      webhookId: created.id,
      status: "failed",
      responseCode: 500,
      error: "boom",
    });
    await expect(caller.deliveries.get({ id: delivery.id })).resolves.toMatchObject({ id: delivery.id });
  });

  test("router source stays grep-clean of direct EntityManager persistence", async () => {
    const source = await readFile(new URL("./webhooks.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/ctx\.em|em\.find|em\.findOne|em\.create|em\.persist|em\.flush|em\.transactional|getRepository\(/);
  });
});
