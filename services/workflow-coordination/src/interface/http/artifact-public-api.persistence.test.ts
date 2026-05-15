import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import {
  FULCRUM_REVIEW_WORKFLOW_ENTITIES,
  FulcrumArtifactEntity,
} from "@planning-review/infrastructure/database/review-workflow.entities.ts";
import { ReviewWorkflow1778623200002 } from "@planning-review/infrastructure/database/review-workflow.migration.ts";
import {
  type FulcrumTypeOrmConnectionSource,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";
import { ArtifactPublicStore } from "@workflow-coordination/infrastructure/database/artifact-public-store.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumProjectEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import {
  ArtifactPublicApiController,
  ArtifactPublicApiService,
} from "@workflow-coordination/interface/http/artifact-public-api.controller.ts";

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

async function assertArtifactPublicApiRoundTrip(
  source: FulcrumTypeOrmConnectionSource,
  url: string,
): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...FULCRUM_REVIEW_WORKFLOW_ENTITIES],
      migrations: [WorkflowSpine1778623200001, ReviewWorkflow1778623200002],
    }),
  );

  await dataSource.initialize();
  try {
    await dataSource.runMigrations();

    await dataSource.getRepository(FulcrumWorkspaceEntity).save({
      id: `workspace-artifacts-${source}`,
      slug: `artifacts-${source}`,
      name: "Artifacts",
    });
    await dataSource.getRepository(FulcrumProjectEntity).save({
      id: `project-artifacts-${source}`,
      workspaceId: `workspace-artifacts-${source}`,
      slug: `artifacts-project-${source}`,
      name: "Artifacts",
      traceId: `trace-project-artifacts-${source}`,
    });
    await dataSource.getRepository(FulcrumArtifactEntity).save([
      {
        id: `artifact-prototype-${source}`,
        projectId: `project-artifacts-${source}`,
        traceId: `trace-artifacts-${source}`,
        kind: "prototype",
        title: "Prototype shell",
        filename: "prototype.md",
        bodyPath: "artifacts/prototype.md",
        checksumSha256: "sha-prototype",
        mime: "text/markdown",
        sizeBytes: "42",
        lifecycleState: "pending_review",
        archived: false,
        metadataJson: { sourceKind: "prototype", sourceId: "plan-1" },
      },
      {
        id: `artifact-review-${source}`,
        projectId: `project-artifacts-${source}`,
        traceId: `trace-artifacts-${source}`,
        kind: "review",
        title: "Review notes",
        filename: "review.md",
        bodyPath: "artifacts/review.md",
        checksumSha256: null,
        mime: "text/markdown",
        sizeBytes: "0",
        lifecycleState: "accepted",
        archived: true,
        archivedAt: new Date("2026-05-14T00:00:00.000Z"),
        metadataJson: { sourceKind: "review", lifecycleState: "accepted" },
      },
    ]);

    const controller = new ArtifactPublicApiController(
      new ArtifactPublicApiService(
        { featuresEnv: "public-api" },
        new ArtifactPublicStore(dataSource),
      ),
    );

    await expect(controller.listArtifacts({ projectId: `project-artifacts-${source}` })).resolves.toHaveLength(2);
    await expect(controller.listArtifacts({
      projectId: `project-artifacts-${source}`,
      traceId: `trace-artifacts-${source}`,
      kind: "prototype",
    })).resolves.toEqual([
      expect.objectContaining({
        id: `artifact-prototype-${source}`,
        projectId: `project-artifacts-${source}`,
        traceId: `trace-artifacts-${source}`,
        kind: "prototype",
        title: "Prototype shell",
        filename: "prototype.md",
        bodyPath: "artifacts/prototype.md",
        checksumSha256: "sha-prototype",
        mime: "text/markdown",
        sizeBytes: "42",
        lifecycleState: "pending_review",
        archived: false,
        metadataJson: { sourceKind: "prototype", sourceId: "plan-1" },
      }),
    ]);
  } finally {
    await dataSource.destroy();
  }
}

describe("artifact public API TypeORM persistence", () => {
  test("serves artifact list through PGlite socket", async () => {
    await assertArtifactPublicApiRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("serves artifact list through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertArtifactPublicApiRoundTrip("postgres", postgres.url);
  });
});
