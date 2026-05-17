import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { ForbiddenException, NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  type FulcrumTypeOrmConnectionSource,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";
import {
  FULCRUM_IDENTITY_ACCESS_ENTITIES,
  OrganizationMemberEntity,
} from "@identity-access/infrastructure/database/organization.entities.ts";
import { IdentityAccess1778623200009 } from "@identity-access/infrastructure/database/organization.migration.ts";
import { OrganizationStore } from "@identity-access/infrastructure/database/organization-store.ts";
import {
  OrganizationPublicApiController,
  OrganizationPublicApiModule,
  OrganizationPublicApiService,
} from "@identity-access/interface/http/organization-public-api.controller.ts";
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

async function assertOrganizationRoundTrip(source: FulcrumTypeOrmConnectionSource, url: string): Promise<void> {
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
    await seedOrganization(dataSource, source);
    const controller = new OrganizationPublicApiController(
      new OrganizationPublicApiService(
        { featuresEnv: "public-api" },
        new OrganizationStore(dataSource),
      ),
    );

    await expect(controller.getOrganization({
      orgId: `workspace-organization-${source}`,
      userId: `owner-organization-${source}`,
    })).resolves.toEqual(expect.objectContaining({ id: `workspace-organization-${source}`, name: "Organization" }));
    await expect(controller.listMembers({
      orgId: `workspace-organization-${source}`,
      userId: `owner-organization-${source}`,
    })).resolves.toEqual([
      expect.objectContaining({ userId: `owner-organization-${source}`, role: "owner" }),
      expect.objectContaining({ userId: `member-organization-${source}`, role: "member" }),
    ]);
    await expect(controller.updateOrganization({
      orgId: `workspace-organization-${source}`,
      userId: `owner-organization-${source}`,
      name: "Organization renamed",
    })).resolves.toEqual({ ok: true });
    await expect(controller.updateMemberRole(
      { userId: `member-organization-${source}` },
      {
        orgId: `workspace-organization-${source}`,
        userId: `owner-organization-${source}`,
        role: "admin",
      },
    )).resolves.toEqual({ ok: true });
    await expect(controller.removeMember(
      { userId: `member-organization-${source}` },
      {
        orgId: `workspace-organization-${source}`,
        userId: `owner-organization-${source}`,
      },
    )).resolves.toEqual({ ok: true });
    await expect(controller.updateOrganization({
      orgId: `workspace-organization-${source}`,
      userId: `outsider-organization-${source}`,
      name: "Blocked",
    })).rejects.toBeInstanceOf(ForbiddenException);
  } finally {
    await dataSource.destroy();
  }
}

describe("organization public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, OrganizationPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(OrganizationPublicApiController);
    expect(appImports).toContain(OrganizationPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, OrganizationPublicApiController)).toBe("api/v1/organizations");
    expect(Reflect.getMetadata(METHOD_METADATA, OrganizationPublicApiController.prototype.updateOrganization))
      .toBe(RequestMethod.PATCH);
    expect(Reflect.getMetadata(METHOD_METADATA, OrganizationPublicApiController.prototype.removeMember))
      .toBe(RequestMethod.DELETE);
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const controller = new OrganizationPublicApiController(new OrganizationPublicApiService());

    await expect(controller.getOrganization({ orgId: "workspace-1", userId: "user-1" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test("persists organizations through PGlite socket", async () => {
    await assertOrganizationRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("persists organizations through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertOrganizationRoundTrip("postgres", postgres.url);
  });
});

async function seedOrganization(
  dataSource: ReturnType<typeof createFulcrumTypeOrmDataSource>,
  source: FulcrumTypeOrmConnectionSource,
): Promise<void> {
  await dataSource.getRepository(FulcrumWorkspaceEntity).save({
    id: `workspace-organization-${source}`,
    slug: `organization-${source}`,
    name: "Organization",
  });
  await dataSource.getRepository(OrganizationMemberEntity).save([
    {
      id: `membership-owner-${source}`,
      orgId: `workspace-organization-${source}`,
      userId: `owner-organization-${source}`,
      role: "owner",
    },
    {
      id: `membership-member-${source}`,
      orgId: `workspace-organization-${source}`,
      userId: `member-organization-${source}`,
      role: "member",
    },
  ]);
}
