import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { NotFoundException } from "@nestjs/common";

import { SavedViewPublicStore } from "@work-management/infrastructure/database/saved-view-public-store.ts";
import {
  WORK_MANAGEMENT_ENTITIES,
  WorkManagementSavedViewEntity,
} from "@work-management/infrastructure/database/work-structure.entities.ts";
import { WorkManagement1778623200003 } from "@work-management/infrastructure/database/work-structure.migration.ts";
import {
  SavedViewPublicApiController,
  SavedViewPublicApiService,
} from "@work-management/interface/http/saved-view-public-api.controller.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumProjectEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import {
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
  type FulcrumTypeOrmConnectionSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const VIEW_ID = "44444444-4444-4444-8444-444444444444";

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

async function assertSavedViewPublicApiRoundTrip(
  source: FulcrumTypeOrmConnectionSource,
  url: string,
): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: [
        ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
        ...WORK_MANAGEMENT_ENTITIES,
      ],
      migrations: [
        WorkflowSpine1778623200001,
        WorkManagement1778623200003,
      ],
    }),
  );

  await dataSource.initialize();
  try {
    await dataSource.runMigrations();

    await dataSource.getRepository(FulcrumWorkspaceEntity).save({
      id: ORG_ID,
      slug: `saved-views-${source}`,
      name: "Saved Views",
    });
    await dataSource.getRepository(FulcrumProjectEntity).save([
      {
        id: PROJECT_ID,
        workspaceId: ORG_ID,
        slug: `saved-view-project-${source}`,
        name: "Saved View Project",
        traceId: `trace-saved-view-project-${source}`,
      },
      {
        id: OTHER_PROJECT_ID,
        workspaceId: ORG_ID,
        slug: `other-saved-view-project-${source}`,
        name: "Other Saved View Project",
        traceId: `trace-other-saved-view-project-${source}`,
      },
    ]);
    await dataSource.getRepository(WorkManagementSavedViewEntity).save({
      id: VIEW_ID,
      projectId: PROJECT_ID,
      name: "Manual PM board",
      layout: "kanban",
      filters: { status: ["todo"] },
      groupBy: "status",
      sortBy: "-updated_at",
      displayProperties: { showAssignee: true },
      traceId: `trace-saved-view-${source}`,
    });

    const controller = new SavedViewPublicApiController(
      new SavedViewPublicApiService(
        { featuresEnv: "public-api" },
        new SavedViewPublicStore(dataSource),
      ),
    );

    await expect(controller.listSavedViews({ orgId: ORG_ID, projectId: PROJECT_ID })).resolves.toEqual([
      expect.objectContaining({
        id: VIEW_ID,
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        name: "Manual PM board",
        scope: "project",
        viewType: "kanban",
      }),
    ]);
    await expect(controller.listSavedViews({ orgId: ORG_ID, projectId: OTHER_PROJECT_ID })).resolves.toEqual([]);

    const created = await controller.createSavedView({
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      name: "Created view",
      scope: "private",
      viewType: "table",
      filters: { statuses: ["pending"], cycleIds: ["cycle-1"], moduleIds: ["module-1"], priority: "high" },
      sortBy: "-updated_at",
      isDefault: true,
    });
    expect(created).toEqual(expect.objectContaining({
      id: expect.any(String),
      projectId: PROJECT_ID,
      name: "Created view",
      scope: "private",
      viewType: "table",
      filters: { statuses: ["pending"], cycleIds: ["cycle-1"], moduleIds: ["module-1"], priority: "high" },
      sortBy: "-updated_at",
      isDefault: true,
    }));

    const createdId = (created as { id: string }).id;
    await controller.createSavedView({
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      name: "Default board",
      scope: "project",
      viewType: "kanban",
      filters: { statuses: ["todo"] },
      sortBy: "priority",
      isDefault: true,
    });
    await expect(controller.getSavedView({ id: createdId })).resolves.toEqual(
      expect.objectContaining({ id: createdId, isDefault: false }),
    );
    await expect(controller.getSavedView({ id: createdId })).resolves.toEqual(
      expect.objectContaining({ id: createdId, name: "Created view" }),
    );
    await expect(controller.patchSavedView(
      { id: createdId },
      { name: "Created view revised", scope: "project", viewType: "calendar", isDefault: false },
    )).resolves.toEqual(expect.objectContaining({
      id: createdId,
      name: "Created view revised",
      scope: "project",
      viewType: "calendar",
      isDefault: false,
    }));
    await expect(controller.deleteSavedView({ id: createdId })).resolves.toBeUndefined();
    await expect(controller.deleteSavedView({ id: createdId })).rejects.toBeInstanceOf(NotFoundException);
  } finally {
    await dataSource.destroy();
  }
}

describe("saved-view public API TypeORM persistence", () => {
  test("serves saved-view list/create/delete through PGlite socket", async () => {
    await assertSavedViewPublicApiRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("serves saved-view list/create/delete through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertSavedViewPublicApiRoundTrip("postgres", postgres.url);
  });
});
