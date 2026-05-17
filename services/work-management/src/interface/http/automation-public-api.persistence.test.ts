import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import {
  type FulcrumTypeOrmConnectionSource,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";
import { WORK_AUTOMATION_ENTITIES } from "@work-management/infrastructure/database/automation.entities.ts";
import { WorkAutomations1778752500000 } from "@work-management/infrastructure/database/automation.migration.ts";
import { AutomationStore } from "@work-management/infrastructure/database/automation-store.ts";
import {
  AutomationPublicApiController,
  AutomationPublicApiService,
} from "@work-management/interface/http/automation-public-api.controller.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "user-1";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";

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

async function assertAutomationRoundTrip(
  source: FulcrumTypeOrmConnectionSource,
  url: string,
): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: WORK_AUTOMATION_ENTITIES,
      migrations: [WorkAutomations1778752500000],
    }),
  );

  await dataSource.initialize();
  try {
    const migrations = await dataSource.runMigrations();
    expect(migrations.map((migration) => migration.name)).toEqual([
      "WorkAutomations1778752500000",
    ]);

    const controller = new AutomationPublicApiController(
      new AutomationPublicApiService(
        { featuresEnv: "public-api" },
        new AutomationStore(dataSource),
      ),
    );
    const created = await controller.createAutomation({
      orgId: ORG_ID,
      userId: USER_ID,
      projectId: PROJECT_ID,
      name: `Auto triage ${source}`,
      triggerType: "task.created",
      triggerConfig: { inheritance: { scope: "descendants" } },
      condition: { field: "priority", operator: "equals", value: "high" },
      actionType: "set_status",
      actionConfig: { status: "triage" },
    });
    expect(created).toEqual(expect.objectContaining({
      id: expect.any(String),
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      name: `Auto triage ${source}`,
      enabled: true,
      executionCount: 0,
      triggerConfig: { inheritance: { scope: "descendants" } },
      condition: { field: "priority", operator: "equals", value: "high" },
      actionConfig: { status: "triage" },
    }));
    await expect(controller.listAutomations({
      orgId: ORG_ID,
      userId: USER_ID,
      projectId: PROJECT_ID,
    })).resolves.toEqual([expect.objectContaining({ id: created.id, name: `Auto triage ${source}` })]);
    await expect(controller.updateAutomation({ id: created.id }, {
      orgId: ORG_ID,
      userId: USER_ID,
      name: `Auto triage updated ${source}`,
      enabled: false,
    })).resolves.toEqual(expect.objectContaining({
      id: created.id,
      name: `Auto triage updated ${source}`,
      enabled: false,
    }));
    await expect(controller.templates()).resolves.toEqual([
      expect.objectContaining({ name: "Close stale tasks", actionType: "set_status" }),
      expect.objectContaining({ name: "Auto-assign by label", actionType: "set_assignee" }),
      expect.objectContaining({ name: "Notify on status change", actionType: "subscribe_watcher" }),
      expect.objectContaining({ name: "Sprint auto-close", actionType: "set_status" }),
    ]);
    await expect(controller.deleteAutomation({ id: created.id }, {
      orgId: ORG_ID,
      userId: USER_ID,
    })).resolves.toEqual({ deleted: true });
    await expect(controller.listAutomations({
      orgId: ORG_ID,
      userId: USER_ID,
      projectId: PROJECT_ID,
    })).resolves.toEqual([]);
  } finally {
    await dataSource.destroy();
  }
}

describe("automation public API TypeORM persistence", () => {
  test("persists automation CRUD through PGlite socket", async () => {
    await assertAutomationRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("persists automation CRUD through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertAutomationRoundTrip("postgres", postgres.url);
  });
});
