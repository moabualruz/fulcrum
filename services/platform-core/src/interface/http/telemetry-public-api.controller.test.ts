import "reflect-metadata";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  FULCRUM_TELEMETRY_ENTITIES,
  FulcrumTelemetryEventEntity,
} from "@platform-core/infrastructure/database/telemetry.entities.ts";
import { Telemetry1778755200000 } from "@platform-core/infrastructure/database/telemetry.migration.ts";
import { TelemetryPublicStore } from "@platform-core/infrastructure/database/telemetry-store.ts";
import {
  type FulcrumTypeOrmConnectionSource,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import {
  TelemetryPublicApiController,
  TelemetryPublicApiModule,
  TelemetryPublicApiService,
  TelemetryScopeBodyDto,
} from "@platform-core/interface/http/telemetry-public-api.controller.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";

let pglite: PGlite | undefined;
let socketServer: PGLiteSocketServer | undefined;
let postgres: TemporaryPostgres | undefined;
let scratchDir: string | undefined;

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
  if (scratchDir) {
    rmSync(scratchDir, { recursive: true, force: true });
    scratchDir = undefined;
  }
});

describe("telemetry public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, TelemetryPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(TelemetryPublicApiController);
    expect(appImports).toContain(TelemetryPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, TelemetryPublicApiController)).toBe("api/v1/telemetry");
    expect(Reflect.getMetadata(METHOD_METADATA, TelemetryPublicApiController.prototype.status)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, TelemetryPublicApiController.prototype.optIn)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(METHOD_METADATA, TelemetryPublicApiController.prototype.purge)).toBe(RequestMethod.DELETE);
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const controller = new TelemetryPublicApiController(new TelemetryPublicApiService());

    await expect(controller.status({ orgId: "workspace-1", userId: "user-1" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test("delegates status, opt-in, opt-out, and purge to the TypeORM store facade", async () => {
    const calls: string[] = [];
    const store = {
      status: async () => {
        calls.push("status");
        return { opted_in: true, row_count: 2 };
      },
      setOptedIn: async (input: { value: boolean }) => {
        calls.push(input.value ? "opt-in" : "opt-out");
      },
      purge: async () => {
        calls.push("purge");
        return 2;
      },
    } as unknown as TelemetryPublicStore;
    const controller = new TelemetryPublicApiController(
      new TelemetryPublicApiService({ featuresEnv: "public-api" }, store),
    );

    await expect(controller.status({ orgId: "workspace-1", userId: "user-1" }))
      .resolves.toEqual({ opted_in: true, row_count: 2 });
    await expect(controller.optIn({ orgId: "workspace-1", userId: "user-1" })).resolves.toEqual({ ok: true });
    await expect(controller.optOut({ orgId: "workspace-1", userId: "user-1" })).resolves.toEqual({ ok: true });
    await expect(controller.purge({ orgId: "workspace-1", userId: "user-1" }))
      .resolves.toEqual({ ok: true, deleted: 2 });
    expect(calls).toEqual(["status", "opt-in", "opt-out", "purge"]);
  });

  test("keeps request validation at the Nest boundary", () => {
    const invalid = Object.assign(new TelemetryScopeBodyDto(), { orgId: "", userId: "" });

    expect(validateSync(invalid).map((error) => error.property).sort()).toEqual(["orgId", "userId"]);
  });

  test("persists telemetry controls through PGlite socket", async () => {
    await assertTelemetryRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("persists telemetry controls through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertTelemetryRoundTrip("postgres", postgres.url);
  });
});

async function assertTelemetryRoundTrip(source: FulcrumTypeOrmConnectionSource, url: string): Promise<void> {
  scratchDir = mkdtempSync(join(tmpdir(), `fulcrum-telemetry-${source}-`));
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...FULCRUM_IDENTITY_ACCESS_ENTITIES, ...FULCRUM_TELEMETRY_ENTITIES],
      migrations: [WorkflowSpine1778623200001, IdentityAccess1778623200009, Telemetry1778755200000],
    }),
  );

  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
    await seedTelemetryOrganization(dataSource, source);
    const store = new TelemetryPublicStore(dataSource);
    const controller = new TelemetryPublicApiController(
      new TelemetryPublicApiService({ featuresEnv: "public-api" }, store),
    );
    const scope = {
      orgId: `workspace-telemetry-${source}`,
      userId: `owner-telemetry-${source}`,
    };

    await expect(controller.status(scope)).resolves.toEqual({ opted_in: false, row_count: 0 });
    await expect(controller.optIn(scope)).resolves.toEqual({ ok: true });
    await expect(controller.status(scope)).resolves.toEqual({ opted_in: true, row_count: 0 });

    await store.write({
      ...scope,
      kind: "task.created",
      payload: { title: "private task", duration_ms: 7 },
    });
    await expect(controller.status(scope)).resolves.toEqual({ opted_in: true, row_count: 1 });
    const rows = await dataSource.getRepository(FulcrumTelemetryEventEntity).findBy({ orgId: scope.orgId });
    expect(rows[0]?.payload).toEqual({ title: null, duration_ms: 7 });

    await expect(controller.purge(scope)).resolves.toEqual({ ok: true, deleted: 1 });
    await expect(controller.status(scope)).resolves.toEqual({ opted_in: true, row_count: 0 });
    await expect(controller.optOut(scope)).resolves.toEqual({ ok: true });
    await expect(controller.status(scope)).resolves.toEqual({ opted_in: false, row_count: 0 });
    await expect(controller.status({ ...scope, userId: `outsider-telemetry-${source}` }))
      .rejects.toBeInstanceOf(ForbiddenException);
  } finally {
    await dataSource.destroy();
  }
}

async function seedTelemetryOrganization(
  dataSource: ReturnType<typeof createFulcrumTypeOrmDataSource>,
  source: FulcrumTypeOrmConnectionSource,
): Promise<void> {
  await dataSource.getRepository(FulcrumWorkspaceEntity).save({
    id: `workspace-telemetry-${source}`,
    slug: `telemetry-${source}`,
    name: "Telemetry",
  });
  await dataSource.getRepository(OrganizationMemberEntity).save({
    id: `membership-telemetry-owner-${source}`,
    orgId: `workspace-telemetry-${source}`,
    userId: `owner-telemetry-${source}`,
    role: "owner",
  });
}
