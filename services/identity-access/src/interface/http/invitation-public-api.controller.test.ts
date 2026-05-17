import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { ForbiddenException, NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  FULCRUM_INVITATION_ENTITIES,
} from "@identity-access/infrastructure/database/invitation.entities.ts";
import { Invitation1778757000000 } from "@identity-access/infrastructure/database/invitation.migration.ts";
import { InvitationStore } from "@identity-access/infrastructure/database/invitation-store.ts";
import {
  FULCRUM_IDENTITY_ACCESS_ENTITIES,
  OrganizationMemberEntity,
} from "@identity-access/infrastructure/database/organization.entities.ts";
import { IdentityAccess1778623200009 } from "@identity-access/infrastructure/database/organization.migration.ts";
import {
  InvitationCreateDto,
  InvitationPublicApiController,
  InvitationPublicApiModule,
  InvitationPublicApiService,
} from "@identity-access/interface/http/invitation-public-api.controller.ts";
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

describe("invitation public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, InvitationPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(InvitationPublicApiController);
    expect(appImports).toContain(InvitationPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, InvitationPublicApiController)).toBe("api/v1/invitations");
    expect(Reflect.getMetadata(METHOD_METADATA, InvitationPublicApiController.prototype.list)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, InvitationPublicApiController.prototype.create)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(METHOD_METADATA, InvitationPublicApiController.prototype.revoke)).toBe(RequestMethod.PATCH);
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const controller = new InvitationPublicApiController(new InvitationPublicApiService());

    await expect(controller.list({ orgId: "workspace-1", userId: "user-1" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test("keeps request validation at the Nest boundary", () => {
    const invalid = Object.assign(new InvitationCreateDto(), {
      orgId: "",
      userId: "",
      email: "not-email",
      role: "invalid",
    });

    expect(validateSync(invalid).map((error) => error.property).sort()).toEqual(["email", "orgId", "role", "userId"]);
  });

  test("persists invitations through PGlite socket", async () => {
    await assertInvitationRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("persists invitations through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertInvitationRoundTrip("postgres", postgres.url);
  });
});

async function assertInvitationRoundTrip(source: FulcrumTypeOrmConnectionSource, url: string): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...FULCRUM_IDENTITY_ACCESS_ENTITIES, ...FULCRUM_INVITATION_ENTITIES],
      migrations: [WorkflowSpine1778623200001, IdentityAccess1778623200009, Invitation1778757000000],
    }),
  );

  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
    await seedInvitationOrganization(dataSource, source);
    const controller = new InvitationPublicApiController(
      new InvitationPublicApiService({ featuresEnv: "public-api" }, new InvitationStore(dataSource)),
    );
    const ownerScope = {
      orgId: `workspace-invitation-${source}`,
      userId: `owner-invitation-${source}`,
    };
    const adminScope = {
      orgId: `workspace-invitation-${source}`,
      userId: `admin-invitation-${source}`,
    };

    const created = await controller.create({
      ...ownerScope,
      email: "New@Test.Local",
      role: "member",
    });
    expect(created).toMatchObject({
      email: "new@test.local",
      role: "member",
      status: "pending",
      invitedBy: ownerScope.userId,
    });
    expect(typeof created.token).toBe("string");
    expect(created.token.length).toBeGreaterThan(20);
    expect(Object.keys(created)).not.toContain("tokenHash");

    await expect(controller.list(ownerScope)).resolves.toEqual([
      expect.objectContaining({ id: created.id, email: "new@test.local", status: "pending" }),
    ]);
    await expect(controller.get({ id: created.id }, ownerScope)).resolves.toEqual(
      expect.objectContaining({ id: created.id, role: "member" }),
    );
    await expect(controller.create({
      ...adminScope,
      email: "member@test.local",
      role: "member",
    })).resolves.toEqual(expect.objectContaining({ role: "member" }));
    await expect(controller.create({
      ...adminScope,
      email: "admin@test.local",
      role: "admin",
    })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.revoke({ id: created.id }, ownerScope)).resolves.toEqual({ ok: true });
    await expect(controller.get({ id: created.id }, ownerScope)).resolves.toEqual(
      expect.objectContaining({ id: created.id, status: "revoked", revokedAt: expect.any(String) }),
    );
    await expect(controller.list({
      orgId: `workspace-invitation-${source}`,
      userId: `member-invitation-${source}`,
    })).rejects.toBeInstanceOf(ForbiddenException);
  } finally {
    await dataSource.destroy();
  }
}

async function seedInvitationOrganization(
  dataSource: ReturnType<typeof createFulcrumTypeOrmDataSource>,
  source: FulcrumTypeOrmConnectionSource,
): Promise<void> {
  await dataSource.getRepository(FulcrumWorkspaceEntity).save({
    id: `workspace-invitation-${source}`,
    slug: `invitation-${source}`,
    name: "Invitations",
  });
  await dataSource.getRepository(OrganizationMemberEntity).save([
    {
      id: `membership-invitation-owner-${source}`,
      orgId: `workspace-invitation-${source}`,
      userId: `owner-invitation-${source}`,
      role: "owner",
    },
    {
      id: `membership-invitation-admin-${source}`,
      orgId: `workspace-invitation-${source}`,
      userId: `admin-invitation-${source}`,
      role: "admin",
    },
    {
      id: `membership-invitation-member-${source}`,
      orgId: `workspace-invitation-${source}`,
      userId: `member-invitation-${source}`,
      role: "member",
    },
  ]);
}
