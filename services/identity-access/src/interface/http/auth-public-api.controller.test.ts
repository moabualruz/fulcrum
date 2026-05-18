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
  AuthEmailVerificationConfirmDto,
  AuthEmailVerificationRequestDto,
  AuthInviteDto,
  AuthPublicApiController,
  AuthPublicApiModule,
  AuthPublicApiService,
} from "@identity-access/interface/http/auth-public-api.controller.ts";
import { Org, User, Verification } from "@identity-access/infrastructure/database/entities/auth/index.ts";
import { CoreAndAuth1715788800000 } from "@platform-core/infrastructure/application-database/migrations/1715788800000-CoreAndAuth.ts";
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

    const invalidVerification = Object.assign(new AuthEmailVerificationRequestDto(), {
      orgId: "",
      userId: "",
    });
    const invalidConfirm = Object.assign(new AuthEmailVerificationConfirmDto(), { token: "" });

    expect(validateSync(invalidInvite).map((error) => error.property).sort()).toEqual(["email", "orgId", "role", "userId"]);
    expect(validateSync(invalidAccept).map((error) => error.property)).toEqual(["token"]);
    expect(validateSync(invalidVerification).map((error) => error.property).sort()).toEqual(["orgId", "userId"]);
    expect(validateSync(invalidConfirm).map((error) => error.property)).toEqual(["token"]);
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
        Org,
        User,
        Verification,
      ],
      migrations: [CoreAndAuth1715788800000, WorkflowSpine1778623200001, IdentityAccess1778623200009, Invitation1778757000000],
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
      userId: userIdFor(source, "owner"),
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
      userId: userIdFor(source, "admin"),
      email: "owner@example.com",
      role: "owner",
    })).rejects.toBeInstanceOf(ForbiddenException);

    const verification = await controller.requestEmailVerification({
      ...scope,
      email: "owner@example.com",
      baseUrl: "http://fulcrum.test",
    });
    expect(verification.email).toBe("owner@example.com");
    expect(verification.verificationUrl).toStartWith("http://fulcrum.test/auth/verify-email?token=");
    await expect(controller.requestEmailVerification({
      ...scope,
      email: "owner@example.com",
      baseUrl: "http://fulcrum.test",
    })).rejects.toBeInstanceOf(BadRequestException);

    const token = new URL(verification.verificationUrl).searchParams.get("token");
    expect(token).toBeTruthy();
    const verified = await controller.verifyEmail({ token: token! });
    expect(verified).toMatchObject({
      orgId: scope.orgId,
      userId: scope.userId,
      email: "owner@example.com",
      emailVerified: true,
    });
    const verifiedSession = await controller.whoami(scope);
    expect(verifiedSession.emailVerified).toBe(true);
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
      userId: userIdFor(source, "owner"),
      role: "owner",
    },
    {
      id: `membership-auth-admin-${source}`,
      orgId: `workspace-auth-${source}`,
      userId: userIdFor(source, "admin"),
      role: "admin",
    },
  ]);
  await dataSource.getRepository(User).save({
    id: userIdFor(source, "owner"),
    orgId: `workspace-auth-${source}`,
    email: "owner@example.com",
    name: "Owner",
    role: "owner",
    emailVerified: false,
  });
}

function userIdFor(source: FulcrumTypeOrmConnectionSource, role: "owner" | "admin"): string {
  if (source === "pglite-socket") {
    return role === "owner"
      ? "11111111-1111-4111-8111-111111111111"
      : "22222222-2222-4222-8222-222222222222";
  }
  return role === "owner"
    ? "33333333-3333-4333-8333-333333333333"
    : "44444444-4444-4444-8444-444444444444";
}
