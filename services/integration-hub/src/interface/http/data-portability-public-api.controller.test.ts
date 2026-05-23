import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { BadRequestException, ForbiddenException, NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  FULCRUM_IDENTITY_ACCESS_ENTITIES,
  OrganizationMemberEntity,
} from "@identity-access/infrastructure/database/organization.entities.ts";
import { IdentityAccess1778623200009 } from "@identity-access/infrastructure/database/organization.migration.ts";
import { DataPortabilityStore } from "@integration-hub/infrastructure/database/data-portability-store.ts";
import {
  DataImportRunDto,
  DataPortabilityPublicApiController,
  DataPortabilityPublicApiModule,
  DataPortabilityPublicApiService,
} from "@integration-hub/interface/http/data-portability-public-api.controller.ts";
import {
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
  type FulcrumTypeOrmConnectionSource,
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

describe("data portability public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, DataPortabilityPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(DataPortabilityPublicApiController);
    expect(appImports).toContain(DataPortabilityPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, DataPortabilityPublicApiController)).toBe("api/v1/data-portability");
    expect(Reflect.getMetadata(METHOD_METADATA, DataPortabilityPublicApiController.prototype.createBackup)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(METHOD_METADATA, DataPortabilityPublicApiController.prototype.preflightImport)).toBe(RequestMethod.GET);
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const controller = new DataPortabilityPublicApiController(new DataPortabilityPublicApiService());

    await expect(controller.createBackup({ orgId: "workspace-1", userId: "user-1" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test("keeps request validation at the Nest boundary", () => {
    const invalid = Object.assign(new DataImportRunDto(), {
      orgId: "",
      userId: "",
      importId: "",
      onConflict: "merge",
    });

    expect(validateSync(invalid).map((error) => error.property).sort()).toEqual(["importId", "onConflict", "orgId", "userId"]);
  });

  test("moves backup, export, and import data through PGlite socket", async () => {
    await assertDataPortabilityRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("moves backup, export, and import data through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertDataPortabilityRoundTrip("postgres", postgres.url);
  });
});

async function assertDataPortabilityRoundTrip(source: FulcrumTypeOrmConnectionSource, url: string): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...FULCRUM_IDENTITY_ACCESS_ENTITIES],
      migrations: [WorkflowSpine1778623200001, IdentityAccess1778623200009],
    }),
  );

  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
    await createPortableTable(dataSource);
    await seedDataPortabilityOrganization(dataSource, source);

    const controller = new DataPortabilityPublicApiController(
      new DataPortabilityPublicApiService({ featuresEnv: "public-api" }, new DataPortabilityStore(dataSource)),
    );
    const scope = {
      orgId: `workspace-data-portability-${source}`,
      userId: `owner-data-portability-${source}`,
    };
    const scratch = await mkdtemp(join(tmpdir(), "fulcrum-data-portability-"));
    const exportPath = join(scratch, `${source}.json`);

    await dataSource.query(
      "insert into fulcrum_portable_items (id, org_id, title, api_token, details) values ($1, $2, $3, $4, $5::jsonb)",
      ["item-1", scope.orgId, "Original", "secret-token", JSON.stringify({ status: "ready" })],
    );

    const backup = await controller.createBackup(scope);
    expect(backup).toMatchObject({
      format: "fulcrum.db-dump.v1",
      schemaVersion: 1,
      entityCounts: expect.objectContaining({ fulcrum_portable_items: 1 }),
    });
    expect(typeof backup.dump).toBe("string");

    const exported = await controller.createExport({ ...scope, outputPath: exportPath, pretty: true });
    const exportFile = JSON.parse(await readFile(exportPath, "utf8"));
    expect(exported).toMatchObject({
      format: "fulcrum.json-export.v1",
      outputPath: exportPath,
      entityCounts: expect.objectContaining({ fulcrum_portable_items: 1 }),
    });
    expect(exportFile.fulcrum_portable_items[0]).toMatchObject({ id: "item-1", title: "Original" });
    expect(exportFile.fulcrum_portable_items[0]).not.toHaveProperty("api_token");

    await expect(controller.preflightImport({ ...scope, path: exportPath })).resolves.toMatchObject({
      importId: exportPath,
      counts: expect.objectContaining({ fulcrum_portable_items: 1 }),
      collisions: expect.arrayContaining([{ kind: "fulcrum_portable_items", id: "item-1" }]),
    });
    await expect(controller.runImport({ ...scope, importId: exportPath, dryRun: true })).resolves.toMatchObject({
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
    });

    await dataSource.query("delete from fulcrum_portable_items where id = $1", ["item-1"]);
    const firstImport = await controller.runImport({ ...scope, importId: exportPath, onConflict: "update" });
    expect(firstImport.imported).toBeGreaterThanOrEqual(1);
    expect(firstImport.errors).toBe(0);
    await dataSource.query("update fulcrum_portable_items set title = $1 where id = $2", ["Changed", "item-1"]);
    const secondImport = await controller.runImport({ ...scope, importId: exportPath, onConflict: "update" });
    expect(secondImport.imported).toBe(0);
    expect(secondImport.updated).toBeGreaterThanOrEqual(1);
    await expect(dataSource.query<{ title: string }[]>(
      "select title from fulcrum_portable_items where id = $1",
      ["item-1"],
    )).resolves.toEqual([{ title: "Original" }]);

    await dataSource.query("update fulcrum_portable_items set title = $1 where id = $2", ["Broken", "item-1"]);
    await expect(controller.restoreBackup({ ...scope, dump: backup.dump })).resolves.toMatchObject({
      format: "fulcrum.db-dump.v1",
      schemaVersion: 1,
      entityCounts: expect.objectContaining({ fulcrum_portable_items: 1 }),
    });
    await expect(dataSource.query<{ title: string; api_token: string }[]>(
      "select title, api_token from fulcrum_portable_items where id = $1",
      ["item-1"],
    )).resolves.toEqual([{ title: "Original", api_token: "secret-token" }]);

    // Partial failure reporting: stage an export manifest where one row violates
    // a NOT NULL constraint. Other rows must still import; failure list captures
    // the offending row with its db error message.
    await dataSource.query("delete from fulcrum_portable_items");
    const partialFailureExportPath = join(scratch, `${source}-partial.json`);
    const failingManifest = {
      format: "fulcrum.json-export.v1",
      manifest: {
        schema_version: 1,
        fulcrum_version: "0.1.0",
        exported_at: new Date().toISOString(),
        counts: { fulcrum_portable_items: 2 },
        column_types: {
          fulcrum_portable_items: {
            id: "character varying",
            org_id: "character varying",
            title: "character varying",
            api_token: "text",
            details: "jsonb",
          },
        },
      },
      fulcrum_portable_items: [
        { id: "item-ok", org_id: scope.orgId, title: "OK", api_token: null, details: { status: "ready" } },
        { id: "item-bad", org_id: scope.orgId, title: null, api_token: null, details: { status: "ready" } },
      ],
    };
    await writeFile(partialFailureExportPath, JSON.stringify(failingManifest), "utf8");
    const partial = await controller.runImport({ ...scope, importId: partialFailureExportPath, onConflict: "update" });
    expect(partial.imported).toBeGreaterThanOrEqual(1);
    expect(partial.errors).toBe(1);
    expect(partial.failures).toEqual([
      expect.objectContaining({ kind: "fulcrum_portable_items", id: "item-bad" }),
    ]);
    await expect(dataSource.query<{ id: string }[]>(
      "select id from fulcrum_portable_items where id = $1",
      ["item-ok"],
    )).resolves.toEqual([{ id: "item-ok" }]);
    await expect(dataSource.query<{ id: string }[]>(
      "select id from fulcrum_portable_items where id = $1",
      ["item-bad"],
    )).resolves.toEqual([]);

    await writeFile(exportPath, JSON.stringify({ bad: true }), "utf8");
    await expect(controller.preflightImport({ ...scope, path: exportPath })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.createBackup({
      orgId: `workspace-data-portability-${source}`,
      userId: `member-data-portability-${source}`,
    })).rejects.toBeInstanceOf(ForbiddenException);
  } finally {
    await dataSource.destroy();
  }
}

async function createPortableTable(dataSource: ReturnType<typeof createFulcrumTypeOrmDataSource>): Promise<void> {
  await dataSource.query(`
    create table fulcrum_portable_items (
      id varchar(128) primary key,
      org_id varchar(128) not null,
      title varchar(160) not null,
      api_token text,
      details jsonb not null default '{}'::jsonb
    )
  `);
}

async function seedDataPortabilityOrganization(
  dataSource: ReturnType<typeof createFulcrumTypeOrmDataSource>,
  source: FulcrumTypeOrmConnectionSource,
): Promise<void> {
  await dataSource.getRepository(FulcrumWorkspaceEntity).save({
    id: `workspace-data-portability-${source}`,
    slug: `data-portability-${source}`,
    name: "Data Portability",
  });
  await dataSource.getRepository(OrganizationMemberEntity).save([
    {
      id: `membership-data-portability-owner-${source}`,
      orgId: `workspace-data-portability-${source}`,
      userId: `owner-data-portability-${source}`,
      role: "owner",
    },
    {
      id: `membership-data-portability-member-${source}`,
      orgId: `workspace-data-portability-${source}`,
      userId: `member-data-portability-${source}`,
      role: "member",
    },
  ]);
}
