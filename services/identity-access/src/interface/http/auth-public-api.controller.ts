import "reflect-metadata";

import { BadRequestException, Body, Controller, ForbiddenException, Get, Inject, InternalServerErrorException, Module, NotFoundException, Post, Query } from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsEmail, IsIn, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import {
  AuthStore,
  AuthValidationError,
  type AuthInvitationAcceptedRow,
  type AuthManagedSessionRow,
  type AuthSessionPublicRow,
  type AuthSessionRevocationRow,
  type EmailVerificationRequestRow,
  type EmailVerificationResultRow,
} from "@identity-access/infrastructure/database/auth-store.ts";
import { Org, Session, User, Verification } from "@identity-access/infrastructure/database/entities/auth/index.ts";
import { WorkflowAuditEventEntity } from "@workflow-coordination/infrastructure/database/audit-log.entities.ts";
import { FULCRUM_INVITATION_ENTITIES } from "@identity-access/infrastructure/database/invitation.entities.ts";
import { InvitationPermissionError } from "@identity-access/infrastructure/database/invitation-store.ts";
import {
  FULCRUM_IDENTITY_ACCESS_ENTITIES,
} from "@identity-access/infrastructure/database/organization.entities.ts";
import { isFeatureEnabled } from "@feature-flags/application/env-features.ts";
import { WORKFLOW_AUDIT_ENTITIES } from "@workflow-coordination/infrastructure/database/audit-log.entities.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

import {
  AuthScopeDto,
  AuthInviteDto,
  AuthAcceptInviteDto,
  AuthEmailVerificationRequestDto,
  AuthEmailVerificationConfirmDto,
  AuthSessionsQueryDto,
  AuthSessionRevokeDto,
} from "./dto/auth.dto.ts";
export {
  AuthScopeDto,
  AuthInviteDto,
  AuthAcceptInviteDto,
  AuthEmailVerificationRequestDto,
  AuthEmailVerificationConfirmDto,
  AuthSessionsQueryDto,
  AuthSessionRevokeDto,
};

export const AUTH_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.authPublicApi.options");

export interface AuthPublicApiOptions {
  featuresEnv?: string;
}

export class AuthPublicApiService {
  constructor(
    private readonly options: AuthPublicApiOptions | null = null,
    private readonly store: AuthStore | null = null,
  ) {}

  async whoami(input: AuthScopeDto): Promise<AuthSessionPublicRow> {
    if (!input?.orgId || !input?.userId) {
      throw new BadRequestException({
        error: "auth.whoami requires orgId and userId query parameters.",
        recovery: "GET /api/v1/auth/whoami?orgId=<uuid>&userId=<user>",
      });
    }
    return await this.requireStore().whoami(input);
  }

  async invite(input: AuthInviteDto): Promise<{ invitationId: string; token: string }> {
    return await this.mapStoreErrors(() => this.requireStore().invite(input));
  }

  async acceptInvite(input: AuthAcceptInviteDto): Promise<AuthInvitationAcceptedRow> {
    return await this.mapStoreErrors(() => this.requireStore().acceptInvite(input));
  }

  async requestEmailVerification(input: AuthEmailVerificationRequestDto): Promise<EmailVerificationRequestRow> {
    return await this.mapStoreErrors(() => this.requireStore().requestEmailVerification(input));
  }

  async verifyEmail(input: AuthEmailVerificationConfirmDto): Promise<EmailVerificationResultRow> {
    return await this.mapStoreErrors(() => this.requireStore().verifyEmail(input));
  }

  async listSessions(input: AuthSessionsQueryDto): Promise<AuthManagedSessionRow[]> {
    return await this.mapStoreErrors(() => this.requireStore().listSessions(input));
  }

  async revokeSession(input: AuthSessionRevokeDto): Promise<AuthSessionRevocationRow> {
    return await this.mapStoreErrors(() => this.requireStore().revokeSession(input));
  }

  async revokeOtherSessions(input: AuthSessionsQueryDto): Promise<AuthSessionRevocationRow> {
    return await this.mapStoreErrors(() => this.requireStore().revokeOtherSessions(input));
  }

  private async mapStoreErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof InvitationPermissionError) throw new ForbiddenException(error.message);
      if (error instanceof AuthValidationError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private requireStore(): AuthStore {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    if (!this.store) {
      throw new InternalServerErrorException("Auth public API TypeORM store is not configured.");
    }
    return this.store;
  }
}

export class AuthPublicApiController {
  constructor(private readonly auth: AuthPublicApiService) {}

  async whoami(query: AuthScopeDto): Promise<AuthSessionPublicRow> {
    return await this.auth.whoami(query);
  }

  async invite(body: AuthInviteDto): Promise<{ invitationId: string; token: string }> {
    return await this.auth.invite(body);
  }

  async acceptInvite(body: AuthAcceptInviteDto): Promise<AuthInvitationAcceptedRow> {
    return await this.auth.acceptInvite(body);
  }

  async requestEmailVerification(body: AuthEmailVerificationRequestDto): Promise<EmailVerificationRequestRow> {
    return await this.auth.requestEmailVerification(body);
  }

  async verifyEmail(body: AuthEmailVerificationConfirmDto): Promise<EmailVerificationResultRow> {
    return await this.auth.verifyEmail(body);
  }

  async listSessions(query: AuthSessionsQueryDto): Promise<AuthManagedSessionRow[]> {
    return await this.auth.listSessions(query);
  }

  async revokeSession(body: AuthSessionRevokeDto): Promise<AuthSessionRevocationRow> {
    return await this.auth.revokeSession(body);
  }

  async revokeOtherSessions(body: AuthSessionsQueryDto): Promise<AuthSessionRevocationRow> {
    return await this.auth.revokeOtherSessions(body);
  }
}

export class AuthPublicApiModule {
  static register(options: AuthPublicApiOptions): NestDynamicModule {
    return {
      module: AuthPublicApiModule,
      imports: [TypeOrmModule.forFeature([
        ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
        ...WORKFLOW_AUDIT_ENTITIES,
        ...FULCRUM_IDENTITY_ACCESS_ENTITIES,
        ...FULCRUM_INVITATION_ENTITIES,
        Org,
        Session,
        User,
        Verification,
        WorkflowAuditEventEntity,
      ])],
      controllers: [AuthPublicApiController],
      providers: [
        { provide: AUTH_PUBLIC_API_OPTIONS, useValue: options },
        AuthStore,
        AuthPublicApiService,
      ],
      exports: [AuthPublicApiService],
    };
  }
}

Inject(AUTH_PUBLIC_API_OPTIONS)(AuthPublicApiService, undefined, 0);
Inject(AuthStore)(AuthPublicApiService, undefined, 1);
Inject(DataSource)(AuthStore, undefined, 0);
Inject(AuthPublicApiService)(AuthPublicApiController, undefined, 0);

for (const target of [AuthScopeDto, AuthInviteDto, AuthEmailVerificationRequestDto, AuthSessionsQueryDto, AuthSessionRevokeDto] as const) {
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
  IsString()(target.prototype, "userId");
  MinLength(1)(target.prototype, "userId");
}
IsEmail()(AuthInviteDto.prototype, "email");
IsIn(["owner", "admin", "member", "guest"])(AuthInviteDto.prototype, "role");
IsString()(AuthAcceptInviteDto.prototype, "token");
MinLength(1)(AuthAcceptInviteDto.prototype, "token");
IsString()(AuthEmailVerificationConfirmDto.prototype, "token");
MinLength(1)(AuthEmailVerificationConfirmDto.prototype, "token");
IsString()(AuthSessionRevokeDto.prototype, "sessionId");
MinLength(1)(AuthSessionRevokeDto.prototype, "sessionId");

const routeDescriptors = {
  whoami: Object.getOwnPropertyDescriptor(AuthPublicApiController.prototype, "whoami"),
  invite: Object.getOwnPropertyDescriptor(AuthPublicApiController.prototype, "invite"),
  acceptInvite: Object.getOwnPropertyDescriptor(AuthPublicApiController.prototype, "acceptInvite"),
  requestEmailVerification: Object.getOwnPropertyDescriptor(AuthPublicApiController.prototype, "requestEmailVerification"),
  verifyEmail: Object.getOwnPropertyDescriptor(AuthPublicApiController.prototype, "verifyEmail"),
  listSessions: Object.getOwnPropertyDescriptor(AuthPublicApiController.prototype, "listSessions"),
  revokeSession: Object.getOwnPropertyDescriptor(AuthPublicApiController.prototype, "revokeSession"),
  revokeOtherSessions: Object.getOwnPropertyDescriptor(AuthPublicApiController.prototype, "revokeOtherSessions"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("AuthPublicApiController route descriptors are missing");
}

const whoamiDescriptor = routeDescriptors.whoami!;
const inviteDescriptor = routeDescriptors.invite!;
const acceptInviteDescriptor = routeDescriptors.acceptInvite!;
const requestEmailVerificationDescriptor = routeDescriptors.requestEmailVerification!;
const verifyEmailDescriptor = routeDescriptors.verifyEmail!;
const listSessionsDescriptor = routeDescriptors.listSessions!;
const revokeSessionDescriptor = routeDescriptors.revokeSession!;
const revokeOtherSessionsDescriptor = routeDescriptors.revokeOtherSessions!;

Controller("api/v1/auth")(AuthPublicApiController);
ApiTags("auth")(AuthPublicApiController);
ApiForbiddenResponse({ description: "Caller is not allowed to perform the auth operation" })(AuthPublicApiController);

Get("whoami")(AuthPublicApiController.prototype, "whoami", whoamiDescriptor);
Query()(AuthPublicApiController.prototype, "whoami", 0);
ApiQuery({ type: AuthScopeDto })(AuthPublicApiController.prototype, "whoami", whoamiDescriptor);
ApiOperation({ summary: "Resolve current auth context" })(AuthPublicApiController.prototype, "whoami", whoamiDescriptor);
ApiOkResponse({ description: "Current auth context" })(AuthPublicApiController.prototype, "whoami", whoamiDescriptor);

Post("invite")(AuthPublicApiController.prototype, "invite", inviteDescriptor);
Body()(AuthPublicApiController.prototype, "invite", 0);
ApiBody({ type: AuthInviteDto })(AuthPublicApiController.prototype, "invite", inviteDescriptor);
ApiOperation({ summary: "Create organization invitation" })(AuthPublicApiController.prototype, "invite", inviteDescriptor);
ApiOkResponse({ description: "Invitation token" })(AuthPublicApiController.prototype, "invite", inviteDescriptor);

Post("accept-invite")(AuthPublicApiController.prototype, "acceptInvite", acceptInviteDescriptor);
Body()(AuthPublicApiController.prototype, "acceptInvite", 0);
ApiBody({ type: AuthAcceptInviteDto })(AuthPublicApiController.prototype, "acceptInvite", acceptInviteDescriptor);
ApiOperation({ summary: "Accept organization invitation" })(AuthPublicApiController.prototype, "acceptInvite", acceptInviteDescriptor);
ApiOkResponse({ description: "Invitation accepted" })(AuthPublicApiController.prototype, "acceptInvite", acceptInviteDescriptor);

Post("email-verification/request")(AuthPublicApiController.prototype, "requestEmailVerification", requestEmailVerificationDescriptor);
Body()(AuthPublicApiController.prototype, "requestEmailVerification", 0);
ApiBody({ type: AuthEmailVerificationRequestDto })(AuthPublicApiController.prototype, "requestEmailVerification", requestEmailVerificationDescriptor);
ApiOperation({ summary: "Request or resend email verification" })(AuthPublicApiController.prototype, "requestEmailVerification", requestEmailVerificationDescriptor);
ApiOkResponse({ description: "Verification link generated" })(AuthPublicApiController.prototype, "requestEmailVerification", requestEmailVerificationDescriptor);

Post("email-verification/verify")(AuthPublicApiController.prototype, "verifyEmail", verifyEmailDescriptor);
Body()(AuthPublicApiController.prototype, "verifyEmail", 0);
ApiBody({ type: AuthEmailVerificationConfirmDto })(AuthPublicApiController.prototype, "verifyEmail", verifyEmailDescriptor);
ApiOperation({ summary: "Confirm email verification token" })(AuthPublicApiController.prototype, "verifyEmail", verifyEmailDescriptor);
ApiOkResponse({ description: "Email verified" })(AuthPublicApiController.prototype, "verifyEmail", verifyEmailDescriptor);

Get("sessions")(AuthPublicApiController.prototype, "listSessions", listSessionsDescriptor);
Query()(AuthPublicApiController.prototype, "listSessions", 0);
ApiQuery({ type: AuthSessionsQueryDto })(AuthPublicApiController.prototype, "listSessions", listSessionsDescriptor);
ApiOperation({ summary: "List active login sessions" })(AuthPublicApiController.prototype, "listSessions", listSessionsDescriptor);
ApiOkResponse({ description: "Active login sessions" })(AuthPublicApiController.prototype, "listSessions", listSessionsDescriptor);

Post("sessions/revoke")(AuthPublicApiController.prototype, "revokeSession", revokeSessionDescriptor);
Body()(AuthPublicApiController.prototype, "revokeSession", 0);
ApiBody({ type: AuthSessionRevokeDto })(AuthPublicApiController.prototype, "revokeSession", revokeSessionDescriptor);
ApiOperation({ summary: "Revoke a remote login session" })(AuthPublicApiController.prototype, "revokeSession", revokeSessionDescriptor);
ApiOkResponse({ description: "Session revoked" })(AuthPublicApiController.prototype, "revokeSession", revokeSessionDescriptor);

Post("sessions/revoke-others")(AuthPublicApiController.prototype, "revokeOtherSessions", revokeOtherSessionsDescriptor);
Body()(AuthPublicApiController.prototype, "revokeOtherSessions", 0);
ApiBody({ type: AuthSessionsQueryDto })(AuthPublicApiController.prototype, "revokeOtherSessions", revokeOtherSessionsDescriptor);
ApiOperation({ summary: "Revoke all other login sessions" })(AuthPublicApiController.prototype, "revokeOtherSessions", revokeOtherSessionsDescriptor);
ApiOkResponse({ description: "Other sessions revoked" })(AuthPublicApiController.prototype, "revokeOtherSessions", revokeOtherSessionsDescriptor);

Module({
  imports: [TypeOrmModule.forFeature([
    ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
    ...WORKFLOW_AUDIT_ENTITIES,
    ...FULCRUM_IDENTITY_ACCESS_ENTITIES,
    ...FULCRUM_INVITATION_ENTITIES,
    Org,
    Session,
    User,
    Verification,
    WorkflowAuditEventEntity,
  ])],
  controllers: [AuthPublicApiController],
  providers: [
    { provide: AUTH_PUBLIC_API_OPTIONS, useValue: null },
    AuthStore,
    AuthPublicApiService,
  ],
  exports: [AuthPublicApiService],
})(AuthPublicApiModule);
