import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import { INTEGRATION_HUB_CONNECTOR_ENTITIES } from "@integration-hub/infrastructure/database/connector.entities.ts";
import { IntegrationConnectors1778751600000 } from "@integration-hub/infrastructure/database/connector.migration.ts";
import { ConnectorStore } from "@integration-hub/infrastructure/database/connector-store.ts";
import {
  ConnectorPublicApiController,
  ConnectorPublicApiService,
  ConnectorRunPublicApiController,
} from "@integration-hub/interface/http/connector-public-api.controller.ts";
import {
  type FulcrumTypeOrmConnectionSource,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

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

async function assertConnectorRoundTrip(
  source: FulcrumTypeOrmConnectionSource,
  url: string,
): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: INTEGRATION_HUB_CONNECTOR_ENTITIES,
      migrations: [IntegrationConnectors1778751600000],
    }),
  );

  await dataSource.initialize();
  try {
    const migrations = await dataSource.runMigrations();
    expect(migrations.map((migration) => migration.name)).toEqual([
      "IntegrationConnectors1778751600000",
    ]);

    const service = new ConnectorPublicApiService(
      {
        featuresEnv: "public-api",
        env: { FULCRUM_FEATURES: "" } as NodeJS.ProcessEnv,
      },
      new ConnectorStore(dataSource),
    );
    const controller = new ConnectorPublicApiController(service);
    const runController = new ConnectorRunPublicApiController(service);

    await expect(controller.list({ orgId: ORG_ID })).resolves.toEqual([
      { name: "confluence", enabled: false, config: null },
      { name: "notion", enabled: false, config: null },
      { name: "github-issues", enabled: false, config: null },
    ]);
    await expect(controller.enable({ id: "notion" }, {
      orgId: ORG_ID,
      config: {
        host: "https://notion.example",
        email: "ops@example.invalid",
        tokenRef: "credential:notion",
      },
    })).resolves.toEqual({
      name: "notion",
      enabled: true,
      config: expect.objectContaining({
        host: "https://notion.example",
        email: "ops@example.invalid",
        tokenRef: "credential:notion",
      }),
    });
    await expect(controller.get({ id: "notion" }, { orgId: ORG_ID })).resolves.toEqual({
      name: "notion",
      enabled: true,
      config: expect.objectContaining({
        host: "https://notion.example",
        email: "ops@example.invalid",
        tokenRef: "credential:notion",
      }),
    });
    const run = await controller.sync({ id: "notion" }, { orgId: ORG_ID, trigger: "manual" });
    expect(run).toEqual(expect.objectContaining({
      id: expect.any(String),
      orgId: ORG_ID,
      connectorId: "notion",
      status: "queued",
      trigger: "manual",
      summary: {
        message: "Connector sync request recorded for the execution queue.",
      },
    }));
    await expect(runController.listRuns({ orgId: ORG_ID, connectorId: "notion" })).resolves.toEqual([
      expect.objectContaining({
        id: run.id,
        orgId: ORG_ID,
        connectorId: "notion",
        status: "queued",
      }),
    ]);
    await expect(runController.getRun({ id: run.id }, { orgId: ORG_ID })).resolves.toEqual(
      expect.objectContaining({ id: run.id, connectorId: "notion" }),
    );
    await expect(controller.disable({ id: "notion" }, { orgId: ORG_ID })).resolves.toEqual(
      expect.objectContaining({ name: "notion", enabled: false }),
    );
    await expect(controller.sync({ id: "notion" }, { orgId: ORG_ID })).rejects.toThrow(
      "Connector notion is not enabled.",
    );
  } finally {
    await dataSource.destroy();
  }
}

describe("connector public API TypeORM persistence", () => {
  test("persists connector state and sync runs through PGlite socket", async () => {
    await assertConnectorRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("persists connector state and sync runs through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertConnectorRoundTrip("postgres", postgres.url);
  });
});
