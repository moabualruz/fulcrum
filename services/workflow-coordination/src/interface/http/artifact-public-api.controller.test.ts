import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { InternalServerErrorException, NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import {
  ArtifactListQueryDto,
  ArtifactParamsDto,
  ArtifactPublicApiController,
  ArtifactPublicApiModule,
  ArtifactPublicApiService,
} from "@workflow-coordination/interface/http/artifact-public-api.controller.ts";
import { ArtifactPublicStore } from "@workflow-coordination/infrastructure/database/artifact-public-store.ts";
import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumProjectEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import {
  FULCRUM_REVIEW_WORKFLOW_ENTITIES,
  FulcrumArtifactEntity,
} from "@planning-review/infrastructure/database/review-workflow.entities.ts";
import { ReviewWorkflow1778623200002 } from "@planning-review/infrastructure/database/review-workflow.migration.ts";
import {
  WORKFLOW_AUDIT_ENTITIES,
  WorkflowAuditEventEntity,
} from "@workflow-coordination/infrastructure/database/audit-log.entities.ts";
import { WorkflowAudit1778623200008 } from "@workflow-coordination/infrastructure/database/audit-log.migration.ts";
import {
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";

let pglite: PGlite | undefined;
let socketServer: PGLiteSocketServer | undefined;

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
});

async function createTypeOrmStore() {
  const url = await startPgliteSocket();
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source: "pglite-socket",
      url,
      entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...FULCRUM_REVIEW_WORKFLOW_ENTITIES, ...WORKFLOW_AUDIT_ENTITIES],
      migrations: [WorkflowSpine1778623200001, ReviewWorkflow1778623200002, WorkflowAudit1778623200008],
    }),
  );

  await dataSource.initialize();
  await dataSource.runMigrations();
  return dataSource;
}

describe("artifact public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ArtifactPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(ArtifactPublicApiController);
    expect(appImports).toContain(ArtifactPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, ArtifactPublicApiController)).toBe("api/v1/artifacts");
    expect(Reflect.getMetadata(PATH_METADATA, ArtifactPublicApiController.prototype.listArtifacts)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, ArtifactPublicApiController.prototype.listArtifacts)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, ArtifactPublicApiController.prototype.getArtifact)).toBe(":id");
    expect(Reflect.getMetadata(METHOD_METADATA, ArtifactPublicApiController.prototype.getArtifact)).toBe(
      RequestMethod.GET,
    );

    const routes = [
      ["uploadArtifact", "/", RequestMethod.POST],
      ["acceptArtifact", ":id/accept", RequestMethod.POST],
      ["rejectArtifact", ":id/reject", RequestMethod.POST],
      ["archiveArtifact", ":id/archive", RequestMethod.POST],
      ["unarchiveArtifact", ":id/unarchive", RequestMethod.POST],
      ["downloadArtifact", ":id/download", RequestMethod.GET],
      ["deleteArtifact", ":id", RequestMethod.DELETE],
    ] as const;

    for (const [method, path, verb] of routes) {
      const descriptor = Object.getOwnPropertyDescriptor(
        ArtifactPublicApiController.prototype,
        method,
      );
      expect(descriptor).toBeDefined();
      expect(Reflect.getMetadata(PATH_METADATA, ArtifactPublicApiController.prototype[method])).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, ArtifactPublicApiController.prototype[method])).toBe(verb);
    }
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const original = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    try {
      const controller = new ArtifactPublicApiController(new ArtifactPublicApiService());

      await expect(controller.listArtifacts({})).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("fails closed when the public API feature is on but TypeORM is not configured", async () => {
    const original = process.env.FULCRUM_FEATURES;
    process.env.FULCRUM_FEATURES = "public-api";
    try {
      const controller = new ArtifactPublicApiController(new ArtifactPublicApiService());

      await expect(controller.listArtifacts({})).rejects.toBeInstanceOf(InternalServerErrorException);
    } finally {
      if (original === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = original;
    }
  });

  test("lists TypeORM workflow artifacts with project, trace, and kind filters", async () => {
    const dataSource = await createTypeOrmStore();
    try {
      await dataSource.getRepository(FulcrumWorkspaceEntity).save({
        id: "workspace-artifacts",
        slug: "artifacts",
        name: "Artifacts",
      });
      await dataSource.getRepository(FulcrumProjectEntity).save({
        id: "project-artifacts",
        workspaceId: "workspace-artifacts",
        slug: "artifacts",
        name: "Artifacts",
        traceId: "trace-artifacts",
      });
      await dataSource.getRepository(FulcrumArtifactEntity).save([
        {
          id: "artifact-prototype",
          projectId: "project-artifacts",
          traceId: "trace-artifacts",
          kind: "prototype",
          title: "Prototype shell",
          bodyPath: "artifacts/prototype.md",
          checksumSha256: "sha-prototype",
        },
        {
          id: "artifact-review",
          projectId: "project-artifacts",
          traceId: "trace-artifacts",
          kind: "review",
          title: "Review notes",
          bodyPath: "artifacts/review.md",
          checksumSha256: null,
        },
      ]);

      const controller = new ArtifactPublicApiController(
        new ArtifactPublicApiService(
          { featuresEnv: "public-api" },
          new ArtifactPublicStore(dataSource),
        ),
      );

      await expect(controller.listArtifacts({})).resolves.toEqual([
        expect.objectContaining({ id: "artifact-prototype", title: "Prototype shell" }),
        expect.objectContaining({ id: "artifact-review", title: "Review notes" }),
      ]);
      await expect(controller.listArtifacts({
        projectId: "project-artifacts",
        traceId: "trace-artifacts",
        kind: "prototype",
      })).resolves.toEqual([
        expect.objectContaining({
          id: "artifact-prototype",
          projectId: "project-artifacts",
          traceId: "trace-artifacts",
          kind: "prototype",
          bodyPath: "artifacts/prototype.md",
          checksumSha256: "sha-prototype",
          createdAt: expect.stringContaining("T"),
        }),
      ]);
      await expect(controller.listArtifacts({ projectId: "project-missing" })).resolves.toEqual([]);
      await expect(controller.getArtifact({ id: "artifact-review" })).resolves.toMatchObject({
        id: "artifact-review",
        projectId: "project-artifacts",
        traceId: "trace-artifacts",
        kind: "review",
        title: "Review notes",
      });
      await expect(controller.getArtifact({ id: "artifact-missing" })).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      await dataSource.destroy();
    }
  });

  test("creates, transitions, archives, downloads, and deletes TypeORM workflow artifacts", async () => {
    const dataSource = await createTypeOrmStore();
    try {
      await dataSource.getRepository(FulcrumWorkspaceEntity).save({
        id: "workspace-artifact-actions",
        slug: "artifact-actions",
        name: "Artifact Actions",
      });
      await dataSource.getRepository(FulcrumProjectEntity).save({
        id: "project-artifact-actions",
        workspaceId: "workspace-artifact-actions",
        slug: "artifact-actions",
        name: "Artifact Actions",
        traceId: "trace-artifact-actions",
      });

      const controller = new ArtifactPublicApiController(
        new ArtifactPublicApiService(
          { featuresEnv: "public-api" },
          new ArtifactPublicStore(dataSource),
        ),
      );
      const actions = controller as unknown as {
        uploadArtifact(input: Record<string, unknown>): Promise<Record<string, unknown>>;
        acceptArtifact(params: { id: string }): Promise<Record<string, unknown>>;
        rejectArtifact(params: { id: string }): Promise<Record<string, unknown>>;
        archiveArtifact(params: { id: string }): Promise<Record<string, unknown>>;
        unarchiveArtifact(params: { id: string }): Promise<Record<string, unknown>>;
        downloadArtifact(params: { id: string }): Promise<Record<string, unknown>>;
        deleteArtifact(params: { id: string }, query: { hard?: boolean | string }): Promise<Record<string, unknown>>;
      };

      const uploaded = await actions.uploadArtifact({
        id: "artifact-actions",
        projectId: "project-artifact-actions",
        traceId: "trace-artifact-actions",
        kind: "uat-evidence",
        title: "UAT evidence",
        filename: "evidence.md",
        bodyPath: "artifacts/evidence.md",
        checksumSha256: "sha-evidence",
        mime: "text/markdown",
        sizeBytes: "42",
        runId: "run-actions",
        taskId: "task-actions",
        docId: "doc-actions",
      });
      expect(uploaded).toMatchObject({
        id: "artifact-actions",
        projectId: "project-artifact-actions",
        traceId: "trace-artifact-actions",
        filename: "evidence.md",
        lifecycleState: "created",
        archived: false,
      });

      await expect(actions.acceptArtifact({ id: "artifact-actions" })).resolves.toMatchObject({
        id: "artifact-actions",
        lifecycleState: "accepted",
        metadataJson: expect.objectContaining({ lifecycleState: "accepted" }),
      });
      await expect(actions.rejectArtifact({ id: "artifact-actions" })).resolves.toMatchObject({
        id: "artifact-actions",
        lifecycleState: "rejected",
        metadataJson: expect.objectContaining({ lifecycleState: "rejected" }),
      });
      await expect(actions.archiveArtifact({ id: "artifact-actions" })).resolves.toMatchObject({
        id: "artifact-actions",
        archived: true,
        lifecycleState: "archived",
      });
      await expect(actions.unarchiveArtifact({ id: "artifact-actions" })).resolves.toMatchObject({
        id: "artifact-actions",
        archived: false,
      });
      await expect(actions.downloadArtifact({ id: "artifact-actions" })).resolves.toMatchObject({
        artifact: expect.objectContaining({ id: "artifact-actions" }),
        bodyPath: "artifacts/evidence.md",
        checksumSha256: "sha-evidence",
      });
      await actions.uploadArtifact({
        id: "artifact-unsafe-path",
        projectId: "project-artifact-actions",
        traceId: "trace-artifact-actions",
        kind: "log",
        title: "Unsafe path",
        filename: "unsafe.log",
        bodyPath: "../outside/unsafe.log",
        checksumSha256: "sha-unsafe",
      });
      await expect(actions.downloadArtifact({ id: "artifact-unsafe-path" })).resolves.toMatchObject({
        artifact: expect.objectContaining({ id: "artifact-unsafe-path" }),
        bodyPath: null,
        checksumSha256: "sha-unsafe",
      });
      await expect(actions.deleteArtifact({ id: "artifact-actions" }, { hard: "true" })).resolves.toEqual({
        ok: true,
        id: "artifact-actions",
        hard: true,
      });
      await expect(controller.getArtifact({ id: "artifact-actions" })).rejects.toBeInstanceOf(NotFoundException);
      const auditEvents = await dataSource.getRepository(WorkflowAuditEventEntity).find({
        where: { subjectId: "artifact-actions" },
        order: { createdAt: "ASC" },
      });
      expect(auditEvents.map((event) => event.verb)).toEqual([
        "created",
        "accepted",
        "rejected",
        "archived",
        "unarchived",
        "deleted",
      ]);
      expect(auditEvents).toContainEqual(expect.objectContaining({
        orgId: "workspace-artifact-actions",
        projectId: "project-artifact-actions",
        subjectKind: "artifact",
        subjectId: "artifact-actions",
        traceId: "trace-artifact-actions",
      }));
    } finally {
      await dataSource.destroy();
    }
  });

  test("keeps request validation at the Nest boundary", () => {
    const params = Object.assign(new ArtifactParamsDto(), { id: "artifact-review" });
    const query = Object.assign(new ArtifactListQueryDto(), {
      projectId: "project-artifacts",
      traceId: "trace-artifacts",
      kind: "prototype",
      limit: 25,
    });
    const invalidQuery = Object.assign(new ArtifactListQueryDto(), {
      projectId: "",
      limit: 0,
    });

    expect(validateSync(params)).toHaveLength(0);
    expect(validateSync(query)).toHaveLength(0);
    expect(validateSync(invalidQuery).map((error) => error.property)).toEqual([
      "projectId",
      "limit",
    ]);
  });
});
