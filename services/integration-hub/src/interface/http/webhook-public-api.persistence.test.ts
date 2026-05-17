import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import {
  INTEGRATION_HUB_WEBHOOK_ENTITIES,
  IntegrationWebhookDeliveryEntity,
  IntegrationWebhookEntity,
} from "@integration-hub/infrastructure/database/webhook.entities.ts";
import { IntegrationWebhooks1778750700000 } from "@integration-hub/infrastructure/database/webhook.migration.ts";
import { WebhookPublicStore } from "@integration-hub/infrastructure/database/webhook-public-store.ts";
import {
  WebhookPublicApiController,
  WebhookPublicApiService,
} from "@integration-hub/interface/http/webhook-public-api.controller.ts";
import {
  type FulcrumTypeOrmConnectionSource,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";

let pglite: PGlite | undefined;
let socketServer: PGLiteSocketServer | undefined;
let postgres: TemporaryPostgres | undefined;

async function startPgliteSocket(): Promise<string> {
  pglite = await PGlite.create();
  await pglite.waitReady;

  socketServer = new PGLiteSocketServer({
    db: pglite,
    host: "127.0.0.1",
    port: 0,
    maxConnections: 20,
  });
  await socketServer.start();

  const [host, port] = socketServer.getServerConn().split(":");
  return `postgresql://postgres:postgres@${host}:${port}/postgres`;
}

afterEach(async () => {
  delete process.env.FULCRUM_WEBHOOK_SECRET_KEY;
  if (socketServer) {
    await socketServer.stop();
    socketServer = undefined;
  }
  if (pglite) {
    await pglite.close();
    pglite = undefined;
  }
  if (postgres) {
    await postgres.stop();
    postgres = undefined;
  }
});

async function assertWebhookPublicApiRoundTrip(
  source: FulcrumTypeOrmConnectionSource,
  url: string,
): Promise<void> {
  process.env.FULCRUM_WEBHOOK_SECRET_KEY = "webhook-test-secret-key";
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: INTEGRATION_HUB_WEBHOOK_ENTITIES,
      migrations: [IntegrationWebhooks1778750700000],
    }),
  );

  await dataSource.initialize();
  try {
    const migrations = await dataSource.runMigrations();
    expect(migrations.map((migration) => migration.name)).toEqual(["IntegrationWebhooks1778750700000"]);

    const controller = new WebhookPublicApiController(
      new WebhookPublicApiService(
        { featuresEnv: "public-api" },
        new WebhookPublicStore(dataSource),
      ),
    );

    const created = await controller.createWebhook(
      { orgId: ORG_ID },
      {
        name: `Build events ${source}`,
        url: `https://hooks.example.test/${source}`,
        secret: "signing-secret",
        eventsFilter: ["run.failed"],
        enabled: true,
      },
    );
    expect(created).toMatchObject({
      orgId: ORG_ID,
      name: `Build events ${source}`,
      url: `https://hooks.example.test/${source}`,
      secret: "****",
      eventsFilter: ["run.failed"],
      enabled: true,
    });

    await expect(dataSource.getRepository(IntegrationWebhookEntity).findOneBy({
      id: created.id,
      orgId: ORG_ID,
    })).resolves.toMatchObject({
      encryptedSecret: expect.stringMatching(/^whsec:v1:/),
    });

    await expect(controller.listWebhooks({ orgId: ORG_ID })).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        secret: "****",
      }),
    ]);
    await expect(controller.updateWebhook(
      { id: created.id },
      { orgId: ORG_ID },
      { enabled: false, url: `https://hooks.example.test/${source}/updated` },
    )).resolves.toMatchObject({
      id: created.id,
      enabled: false,
      url: `https://hooks.example.test/${source}/updated`,
    });
    await expect(controller.listWebhooks({ orgId: ORG_ID })).resolves.toEqual([]);
    await expect(controller.listWebhooks({ orgId: ORG_ID, includeDisabled: true })).resolves.toHaveLength(1);

    const delivery = await dataSource.getRepository(IntegrationWebhookDeliveryEntity).save({
      id: "33333333-3333-4333-8333-333333333333",
      orgId: ORG_ID,
      webhookId: created.id,
      eventId: EVENT_ID,
      status: "failed",
      attempt: 1,
      payload: { eventType: "run.failed" },
      responseCode: 503,
      error: "service unavailable",
      nextRetryAt: null,
      createdAt: new Date("2026-05-14T03:00:00.000Z"),
    });

    await expect(controller.listDeliveries(
      { id: created.id },
      { orgId: ORG_ID, limit: 10 },
    )).resolves.toEqual([
      expect.objectContaining({
        id: delivery.id,
        webhookId: created.id,
        status: "failed",
        attempt: 1,
        responseCode: 503,
      }),
    ]);
    await expect(controller.getDelivery({ deliveryId: delivery.id }, { orgId: ORG_ID })).resolves.toMatchObject({
      id: delivery.id,
      eventId: EVENT_ID,
    });
    await expect(controller.resendDelivery({ deliveryId: delivery.id }, { orgId: ORG_ID })).resolves.toMatchObject({
      id: delivery.id,
      status: "retrying",
      attempt: 2,
      nextRetryAt: expect.any(Date),
    });
    await expect(controller.testWebhook({ id: created.id }, { orgId: ORG_ID })).resolves.toMatchObject({
      orgId: ORG_ID,
      webhookId: created.id,
      eventId: null,
      status: "pending",
      attempt: 1,
      responseCode: null,
      error: null,
    });
    await expect(controller.deleteWebhook({ id: created.id }, { orgId: ORG_ID })).resolves.toEqual({ ok: true });
  } finally {
    await dataSource.destroy();
  }
}

describe("webhook public API TypeORM persistence", () => {
  test("serves webhook endpoint and delivery operations through PGlite socket", async () => {
    await assertWebhookPublicApiRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("serves webhook endpoint and delivery operations through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertWebhookPublicApiRoundTrip("postgres", postgres.url);
  });
});
