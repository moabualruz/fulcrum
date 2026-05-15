import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { ForbiddenException, NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  FULCRUM_IDENTITY_ACCESS_ENTITIES,
  OrganizationMemberEntity,
} from "@identity-access/infrastructure/database/organization.entities.ts";
import { IdentityAccess1778623200009 } from "@identity-access/infrastructure/database/organization.migration.ts";
import {
  FULCRUM_ERROR_LOG_ENTITIES,
} from "@platform-core/infrastructure/database/error-log.entities.ts";
import { ErrorLog1778758800000 } from "@platform-core/infrastructure/database/error-log.migration.ts";
import { ErrorLogStore } from "@platform-core/infrastructure/database/error-log-store.ts";
import {
  ErrorLogListQueryDto,
  ErrorLogPublicApiController,
  ErrorLogPublicApiModule,
  ErrorLogPublicApiService,
} from "@platform-core/interface/http/error-log-public-api.controller.ts";
import {
  type FulcrumTypeOrmConnectionSource,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";

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

describe("error log public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ErrorLogPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(ErrorLogPublicApiController);
    expect(appImports).toContain(ErrorLogPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, ErrorLogPublicApiController)).toBe("api/v1/error-logs");
    expect(Reflect.getMetadata(METHOD_METADATA, ErrorLogPublicApiController.prototype.list)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, ErrorLogPublicApiController.prototype.clear)).toBe(RequestMethod.DELETE);
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const controller = new ErrorLogPublicApiController(new ErrorLogPublicApiService());

    await expect(controller.list({ orgId: "workspace-1", userId: "user-1" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test("keeps request validation at the Nest boundary", () => {
    const invalid = Object.assign(new ErrorLogListQueryDto(), {
      orgId: "",
      userId: "",
      limit: 0,
      since: "not-date",
    });

    expect(validateSync(invalid).map((error) => error.property).sort()).toEqual(["limit", "orgId", "since", "userId"]);
  });

  test("persists error logs through PGlite socket", async () => {
    await assertErrorLogRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("persists error logs through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertErrorLogRoundTrip("postgres", postgres.url);
  });
});

async function assertErrorLogRoundTrip(source: FulcrumTypeOrmConnectionSource, url: string): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...FULCRUM_IDENTITY_ACCESS_ENTITIES, ...FULCRUM_ERROR_LOG_ENTITIES],
      migrations: [WorkflowSpine1778623200001, IdentityAccess1778623200009, ErrorLog1778758800000],
    }),
  );

  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
    await seedErrorLogOrganization(dataSource, source);
    const store = new ErrorLogStore(dataSource);
    const controller = new ErrorLogPublicApiController(
      new ErrorLogPublicApiService({ featuresEnv: "public-api" }, store),
    );
    const scope = {
      orgId: `workspace-error-log-${source}`,
      userId: `owner-error-log-${source}`,
    };
    const before = await store.record({
      ...scope,
      errorMessage: "old boom",
      occurredAt: new Date("2026-05-13T00:00:00.000Z"),
    });
    const after = await store.record({
      ...scope,
      errorMessage: "new boom",
      stackTrace: "stack",
      context: { route: "runs" },
      occurredAt: new Date("2026-05-14T00:00:00.000Z"),
      os: "darwin",
      arch: "arm64",
    });

    await expect(controller.list({ ...scope, limit: 1 })).resolves.toEqual([
      expect.objectContaining({ id: after.id, errorMessage: "new boom", context: { route: "runs" } }),
    ]);
    await expect(controller.list({ ...scope, since: "2026-05-14T00:00:00.000Z" })).resolves.toEqual([
      expect.objectContaining({ id: after.id }),
    ]);
    await expect(controller.get({ id: before.id }, scope)).resolves.toEqual(
      expect.objectContaining({ id: before.id, errorMessage: "old boom" }),
    );
    await expect(controller.list({
      orgId: `workspace-error-log-${source}`,
      userId: `member-error-log-${source}`,
    })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.clear(scope)).resolves.toEqual({ ok: true, deleted: 2 });
    await expect(controller.list(scope)).resolves.toEqual([]);
  } finally {
    await dataSource.destroy();
  }
}

async function seedErrorLogOrganization(
  dataSource: ReturnType<typeof createFulcrumTypeOrmDataSource>,
  source: FulcrumTypeOrmConnectionSource,
): Promise<void> {
  await dataSource.getRepository(FulcrumWorkspaceEntity).save({
    id: `workspace-error-log-${source}`,
    slug: `error-log-${source}`,
    name: "Error Logs",
  });
  await dataSource.getRepository(OrganizationMemberEntity).save([
    {
      id: `membership-error-log-owner-${source}`,
      orgId: `workspace-error-log-${source}`,
      userId: `owner-error-log-${source}`,
      role: "owner",
    },
    {
      id: `membership-error-log-member-${source}`,
      orgId: `workspace-error-log-${source}`,
      userId: `member-error-log-${source}`,
      role: "member",
    },
  ]);
}
