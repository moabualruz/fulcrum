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
  type AuthSessionPublicRow,
} from "@identity-access/infrastructure/database/auth-store.ts";
import { FULCRUM_INVITATION_ENTITIES } from "@identity-access/infrastructure/database/invitation.entities.ts";
import { InvitationPermissionError } from "@identity-access/infrastructure/database/invitation-store.ts";
import {
  FULCRUM_IDENTITY_ACCESS_ENTITIES,
} from "@identity-access/infrastructure/database/organization.entities.ts";
import { isFeatureEnabled } from "@feature-flags/application/env-features.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

import { AuthScopeDto, AuthInviteDto, AuthAcceptInviteDto } from "./dto/auth.dto.ts";
export { AuthScopeDto, AuthInviteDto, AuthAcceptInviteDto };

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
}

export class AuthPublicApiModule {
  static register(options: AuthPublicApiOptions): NestDynamicModule {
    return {
      module: AuthPublicApiModule,
      imports: [TypeOrmModule.forFeature([
        ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
        ...FULCRUM_IDENTITY_ACCESS_ENTITIES,
        ...FULCRUM_INVITATION_ENTITIES,
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

for (const target of [AuthScopeDto, AuthInviteDto] as const) {
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
  IsString()(target.prototype, "userId");
  MinLength(1)(target.prototype, "userId");
}
IsEmail()(AuthInviteDto.prototype, "email");
IsIn(["owner", "admin", "member", "guest"])(AuthInviteDto.prototype, "role");
IsString()(AuthAcceptInviteDto.prototype, "token");
MinLength(1)(AuthAcceptInviteDto.prototype, "token");

const routeDescriptors = {
  whoami: Object.getOwnPropertyDescriptor(AuthPublicApiController.prototype, "whoami"),
  invite: Object.getOwnPropertyDescriptor(AuthPublicApiController.prototype, "invite"),
  acceptInvite: Object.getOwnPropertyDescriptor(AuthPublicApiController.prototype, "acceptInvite"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("AuthPublicApiController route descriptors are missing");
}

const whoamiDescriptor = routeDescriptors.whoami!;
const inviteDescriptor = routeDescriptors.invite!;
const acceptInviteDescriptor = routeDescriptors.acceptInvite!;

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

Module({
  imports: [TypeOrmModule.forFeature([
    ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
    ...FULCRUM_IDENTITY_ACCESS_ENTITIES,
    ...FULCRUM_INVITATION_ENTITIES,
  ])],
  controllers: [AuthPublicApiController],
  providers: [
    { provide: AUTH_PUBLIC_API_OPTIONS, useValue: null },
    AuthStore,
    AuthPublicApiService,
  ],
  exports: [AuthPublicApiService],
})(AuthPublicApiModule);
