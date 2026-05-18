import "reflect-metadata";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { ForbiddenException, NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  FULCRUM_IDENTITY_ACCESS_ENTITIES,
  OrganizationMemberEntity,
} from "@identity-access/infrastructure/database/organization.entities.ts";
import { IdentityAccess1778623200009 } from "@identity-access/infrastructure/database/organization.migration.ts";
import {
  type FulcrumTypeOrmConnectionSource,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";
import {
  CredentialPublicApiController,
  CredentialPublicApiModule,
  CredentialPublicApiService,
} from "@platform-core/interface/http/credential-public-api.controller.ts";
import {
  FULCRUM_CREDENTIAL_ENTITIES,
  FulcrumCredentialEntity,
} from "@platform-core/infrastructure/database/credential.entities.ts";
import { Credential1778623200010 } from "@platform-core/infrastructure/database/credential.migration.ts";
import { CredentialStore } from "@platform-core/infrastructure/database/credential-store.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";

let pglite: PGlite | undefined;
let socketServer: PGLiteSocketServer | undefined;
let postgres: TemporaryPostgres | undefined;
let keyringDir: string | undefined;

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
  if (keyringDir) {
    rmSync(keyringDir, { recursive: true, force: true });
    keyringDir = undefined;
  }
});

async function assertCredentialRoundTrip(source: FulcrumTypeOrmConnectionSource, url: string): Promise<void> {
  keyringDir = mkdtempSync(join(tmpdir(), `fulcrum-credentials-${source}-`));
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...FULCRUM_IDENTITY_ACCESS_ENTITIES, ...FULCRUM_CREDENTIAL_ENTITIES],
      migrations: [WorkflowSpine1778623200001, IdentityAccess1778623200009, Credential1778623200010],
    }),
  );

  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
    await seedCredentialOrganization(dataSource, source);
    const service = new CredentialPublicApiService(
      { featuresEnv: "public-api", keyring: { stateDir: keyringDir, native: null } },
      new CredentialStore(dataSource),
    );
    const controller = new CredentialPublicApiController(service);

    const created = await controller.setCredential({
      orgId: `workspace-credential-${source}`,
      userId: `owner-credential-${source}`,
      name: "LINEAR_API_KEY",
      value: "fixture-value",
    });
    expect(created).toMatchObject({ name: "LINEAR_API_KEY" });
    await expect(controller.listCredentials({
      orgId: `workspace-credential-${source}`,
      userId: `owner-credential-${source}`,
    })).resolves.toEqual([expect.objectContaining({ name: "LINEAR_API_KEY", archived: false })]);
    const publicCredential = await controller.getCredential(
      { name: "LINEAR_API_KEY" },
      {
        orgId: `workspace-credential-${source}`,
        userId: `owner-credential-${source}`,
      },
    );
    expect(publicCredential).toMatchObject({ name: "LINEAR_API_KEY", provider: "local" });
    expect(JSON.stringify(publicCredential)).not.toContain("fixture-value");
    expect(await service.getCredentialReference(
      { name: "LINEAR_API_KEY" },
      {
        orgId: `workspace-credential-${source}`,
        userId: `owner-credential-${source}`,
      },
    )).toEqual({
      credentialId: publicCredential.id,
      name: "LINEAR_API_KEY",
      provider: "local",
    });
    expect(JSON.stringify(await dataSource.getRepository(FulcrumCredentialEntity).find())).not.toContain("fixture-value");
    await expect(controller.rotateCredential(
      { name: "LINEAR_API_KEY" },
      {
        orgId: `workspace-credential-${source}`,
        userId: `owner-credential-${source}`,
        newValue: "rotated-fixture-value",
      },
    )).resolves.toEqual({ ok: true });
    await expect(controller.getCredential(
      { name: "LINEAR_API_KEY" },
      {
        orgId: `workspace-credential-${source}`,
        userId: `owner-credential-${source}`,
      },
    )).resolves.toEqual(expect.objectContaining({ name: "LINEAR_API_KEY", provider: "local" }));
    await expect(controller.archiveCredential(
      { name: "LINEAR_API_KEY" },
      {
        orgId: `workspace-credential-${source}`,
        userId: `owner-credential-${source}`,
      },
    )).resolves.toEqual({ ok: true });
    await expect(controller.listCredentials({
      orgId: `workspace-credential-${source}`,
      userId: `owner-credential-${source}`,
      includeArchived: true,
    })).resolves.toEqual([expect.objectContaining({ name: "LINEAR_API_KEY", archived: true })]);
    await expect(controller.removeCredential(
      { name: "LINEAR_API_KEY" },
      {
        orgId: `workspace-credential-${source}`,
        userId: `owner-credential-${source}`,
      },
    )).resolves.toEqual({ ok: true });
    await expect(controller.setCredential({
      orgId: `workspace-credential-${source}`,
      userId: `outsider-credential-${source}`,
      name: "BLOCKED",
      value: "fixture-value",
    })).rejects.toBeInstanceOf(ForbiddenException);
  } finally {
    await dataSource.destroy();
  }
}

describe("credential public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, CredentialPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(CredentialPublicApiController);
    expect(appImports).toContain(CredentialPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, CredentialPublicApiController)).toBe("api/v1/credentials");
    expect(Reflect.getMetadata(METHOD_METADATA, CredentialPublicApiController.prototype.setCredential))
      .toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(METHOD_METADATA, CredentialPublicApiController.prototype.removeCredential))
      .toBe(RequestMethod.DELETE);
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const controller = new CredentialPublicApiController(new CredentialPublicApiService());

    await expect(controller.listCredentials({ orgId: "workspace-1", userId: "user-1" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test("persists encrypted credentials through PGlite socket", async () => {
    await assertCredentialRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("persists encrypted credentials through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertCredentialRoundTrip("postgres", postgres.url);
  });
});

async function seedCredentialOrganization(
  dataSource: ReturnType<typeof createFulcrumTypeOrmDataSource>,
  source: FulcrumTypeOrmConnectionSource,
): Promise<void> {
  await dataSource.getRepository(FulcrumWorkspaceEntity).save({
    id: `workspace-credential-${source}`,
    slug: `credential-${source}`,
    name: "Credentials",
  });
  await dataSource.getRepository(OrganizationMemberEntity).save({
    id: `membership-credential-owner-${source}`,
    orgId: `workspace-credential-${source}`,
    userId: `owner-credential-${source}`,
    role: "owner",
  });
}
