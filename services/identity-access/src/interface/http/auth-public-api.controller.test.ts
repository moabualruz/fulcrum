import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { BadRequestException, ForbiddenException, NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import { AppModule } from "@fulcrum/server/app.module.ts";
import { FULCRUM_INVITATION_ENTITIES } from "@identity-access/infrastructure/database/invitation.entities.ts";
import { Invitation1778757000000 } from "@identity-access/infrastructure/database/invitation.migration.ts";
import {
  FULCRUM_IDENTITY_ACCESS_ENTITIES,
  OrganizationMemberEntity,
} from "@identity-access/infrastructure/database/organization.entities.ts";
import { IdentityAccess1778623200009 } from "@identity-access/infrastructure/database/organization.migration.ts";
import { AuthStore } from "@identity-access/infrastructure/database/auth-store.ts";
import {
  AuthAcceptInviteDto,
  AuthInviteDto,
  AuthPublicApiController,
  AuthPublicApiModule,
  AuthPublicApiService,
} from "@identity-access/interface/http/auth-public-api.controller.ts";
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

describe("auth public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AuthPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(AuthPublicApiController);
    expect(appImports).toContain(AuthPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, AuthPublicApiController)).toBe("api/v1/auth");
    expect(Reflect.getMetadata(METHOD_METADATA, AuthPublicApiController.prototype.whoami)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, AuthPublicApiController.prototype.invite)).toBe(RequestMethod.POST);
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const controller = new AuthPublicApiController(new AuthPublicApiService());

    await expect(controller.whoami({ orgId: "workspace-1", userId: "user-1" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test("keeps request validation at the Nest boundary", () => {
    const invalidInvite = Object.assign(new AuthInviteDto(), {
      orgId: "",
      userId: "",
      email: "not-email",
      role: "superadmin",
    });
    const invalidAccept = Object.assign(new AuthAcceptInviteDto(), { token: "" });

    expect(validateSync(invalidInvite).map((error) => error.property).sort()).toEqual(["email", "orgId", "role", "userId"]);
    expect(validateSync(invalidAccept).map((error) => error.property)).toEqual(["token"]);
  });

  test("runs whoami, invite, and accept-invite through PGlite socket", async () => {
    await assertAuthRoundTrip("pglite-socket", await startPgliteSocket());
  }, 60_000);

  test("runs whoami, invite, and accept-invite through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertAuthRoundTrip("postgres", postgres.url);
  });
});

async function assertAuthRoundTrip(source: FulcrumTypeOrmConnectionSource, url: string): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: [
        ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
        ...FULCRUM_IDENTITY_ACCESS_ENTITIES,
        ...FULCRUM_INVITATION_ENTITIES,
      ],
      migrations: [WorkflowSpine1778623200001, IdentityAccess1778623200009, Invitation1778757000000],
    }),
  );

  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
    await seedAuthOrganization(dataSource, source);
    const controller = new AuthPublicApiController(
      new AuthPublicApiService({ featuresEnv: "public-api" }, new AuthStore(dataSource)),
    );
    const scope = {
      orgId: `workspace-auth-${source}`,
      userId: `owner-auth-${source}`,
    };

    await expect(controller.whoami(scope)).resolves.toMatchObject({
      orgId: scope.orgId,
      activeOrgId: scope.orgId,
      sessionId: null,
      sessionExpiresAt: null,
      userId: scope.userId,
      role: "owner",
      orgName: "Auth",
    });
    const invitation = await controller.invite({
      ...scope,
      email: "Invitee@Example.com",
      role: "member",
    });
    expect(typeof invitation.invitationId).toBe("string");
    expect(typeof invitation.token).toBe("string");
    const accepted = await controller.acceptInvite({ token: invitation.token });
    expect(accepted).toEqual({
      orgId: scope.orgId,
      userId: "invitee@example.com",
    });
    const inviteeSession = await eventuallyWhoami(controller, {
      orgId: scope.orgId,
      userId: "invitee@example.com",
    });
    expect(inviteeSession).toMatchObject({
      activeOrgId: scope.orgId,
      sessionId: null,
      email: "invitee@example.com",
      role: "member",
    });
    await expect(controller.acceptInvite({ token: invitation.token })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.invite({
      orgId: scope.orgId,
      userId: `admin-auth-${source}`,
      email: "owner@example.com",
      role: "owner",
    })).rejects.toBeInstanceOf(ForbiddenException);
  } finally {
    await dataSource.destroy();
  }
}

async function eventuallyWhoami(
  controller: AuthPublicApiController,
  input: { orgId: string; userId: string },
): Promise<Awaited<ReturnType<AuthPublicApiController["whoami"]>>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await controller.whoami(input);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}

async function seedAuthOrganization(
  dataSource: ReturnType<typeof createFulcrumTypeOrmDataSource>,
  source: FulcrumTypeOrmConnectionSource,
): Promise<void> {
  await dataSource.getRepository(FulcrumWorkspaceEntity).save({
    id: `workspace-auth-${source}`,
    slug: `auth-${source}`,
    name: "Auth",
  });
  await dataSource.getRepository(OrganizationMemberEntity).save([
    {
      id: `membership-auth-owner-${source}`,
      orgId: `workspace-auth-${source}`,
      userId: `owner-auth-${source}`,
      role: "owner",
    },
    {
      id: `membership-auth-admin-${source}`,
      orgId: `workspace-auth-${source}`,
      userId: `admin-auth-${source}`,
      role: "admin",
    },
  ]);
}
