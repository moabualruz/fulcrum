import "reflect-metadata";

import { Body, Controller, ForbiddenException, Get, Inject, InternalServerErrorException, Module, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsEmail, IsIn, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import {
  FULCRUM_INVITATION_ENTITIES,
} from "@identity-access/infrastructure/database/invitation.entities.ts";
import {
  InvitationPermissionError,
  InvitationStore,
  type InvitationPublicRow,
} from "@identity-access/infrastructure/database/invitation-store.ts";
import {
  FULCRUM_IDENTITY_ACCESS_ENTITIES,
} from "@identity-access/infrastructure/database/organization.entities.ts";
import { isFeatureEnabled } from "@feature-flags/application/env-features.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

import { InvitationScopeDto, InvitationParamsDto, InvitationCreateDto } from "./dto/invitation.dto.ts";
export { InvitationScopeDto, InvitationParamsDto, InvitationCreateDto };

export const INVITATION_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.invitationPublicApi.options");

export interface InvitationPublicApiOptions {
  featuresEnv?: string;
}

export class InvitationPublicApiService {
  constructor(
    private readonly options: InvitationPublicApiOptions | null = null,
    private readonly store: InvitationStore | null = null,
  ) {}

  async list(input: InvitationScopeDto): Promise<InvitationPublicRow[]> {
    return await this.mapStoreErrors(() => this.requireStore().list(input));
  }

  async get(params: InvitationParamsDto, input: InvitationScopeDto): Promise<InvitationPublicRow> {
    return await this.mapStoreErrors(() => this.requireResult(this.requireStore().get({ ...input, id: params.id })));
  }

  async create(input: InvitationCreateDto): Promise<InvitationPublicRow & { token: string }> {
    return await this.mapStoreErrors(() => this.requireStore().create(input));
  }

  async revoke(params: InvitationParamsDto, input: InvitationScopeDto): Promise<{ ok: true }> {
    await this.mapStoreErrors(() => this.requireBoolean(this.requireStore().revoke({ ...input, id: params.id })));
    return { ok: true };
  }

  private async requireResult<T>(promise: Promise<T | null>): Promise<T> {
    const result = await promise;
    if (!result) throw new NotFoundException({ error: "Invitation target not found." });
    return result;
  }

  private async requireBoolean(promise: Promise<boolean>): Promise<void> {
    if (!(await promise)) throw new NotFoundException({ error: "Invitation target not found." });
  }

  private async mapStoreErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof InvitationPermissionError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  private requireStore(): InvitationStore {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    if (!this.store) {
      throw new InternalServerErrorException("Invitation public API TypeORM store is not configured.");
    }
    return this.store;
  }
}

export class InvitationPublicApiController {
  constructor(private readonly invitations: InvitationPublicApiService) {}

  async list(query: InvitationScopeDto): Promise<InvitationPublicRow[]> {
    return await this.invitations.list(query);
  }

  async get(params: InvitationParamsDto, query: InvitationScopeDto): Promise<InvitationPublicRow> {
    return await this.invitations.get(params, query);
  }

  async create(body: InvitationCreateDto): Promise<InvitationPublicRow & { token: string }> {
    return await this.invitations.create(body);
  }

  async revoke(params: InvitationParamsDto, body: InvitationScopeDto): Promise<{ ok: true }> {
    return await this.invitations.revoke(params, body);
  }
}

export class InvitationPublicApiModule {
  static register(options: InvitationPublicApiOptions): NestDynamicModule {
    return {
      module: InvitationPublicApiModule,
      imports: [TypeOrmModule.forFeature([
        ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
        ...FULCRUM_IDENTITY_ACCESS_ENTITIES,
        ...FULCRUM_INVITATION_ENTITIES,
      ])],
      controllers: [InvitationPublicApiController],
      providers: [
        { provide: INVITATION_PUBLIC_API_OPTIONS, useValue: options },
        InvitationStore,
        InvitationPublicApiService,
      ],
      exports: [InvitationPublicApiService],
    };
  }
}

Inject(INVITATION_PUBLIC_API_OPTIONS)(InvitationPublicApiService, undefined, 0);
Inject(InvitationStore)(InvitationPublicApiService, undefined, 1);
Inject(DataSource)(InvitationStore, undefined, 0);
Inject(InvitationPublicApiService)(InvitationPublicApiController, undefined, 0);

for (const target of [InvitationScopeDto, InvitationCreateDto] as const) {
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
  IsString()(target.prototype, "userId");
  MinLength(1)(target.prototype, "userId");
}
IsString()(InvitationParamsDto.prototype, "id");
MinLength(1)(InvitationParamsDto.prototype, "id");
IsEmail()(InvitationCreateDto.prototype, "email");
IsIn(["owner", "admin", "member", "guest"])(InvitationCreateDto.prototype, "role");

const routeDescriptors = {
  list: Object.getOwnPropertyDescriptor(InvitationPublicApiController.prototype, "list"),
  get: Object.getOwnPropertyDescriptor(InvitationPublicApiController.prototype, "get"),
  create: Object.getOwnPropertyDescriptor(InvitationPublicApiController.prototype, "create"),
  revoke: Object.getOwnPropertyDescriptor(InvitationPublicApiController.prototype, "revoke"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("InvitationPublicApiController route descriptors are missing");
}

const listDescriptor = routeDescriptors.list!;
const getDescriptor = routeDescriptors.get!;
const createDescriptor = routeDescriptors.create!;
const revokeDescriptor = routeDescriptors.revoke!;

Controller("api/v1/invitations")(InvitationPublicApiController);
ApiTags("invitations")(InvitationPublicApiController);
ApiForbiddenResponse({ description: "Caller is not allowed to perform the invitation operation" })(InvitationPublicApiController);

Get("")(InvitationPublicApiController.prototype, "list", listDescriptor);
Query()(InvitationPublicApiController.prototype, "list", 0);
ApiQuery({ type: InvitationScopeDto })(InvitationPublicApiController.prototype, "list", listDescriptor);
ApiOperation({ summary: "List invitations" })(InvitationPublicApiController.prototype, "list", listDescriptor);
ApiOkResponse({ description: "Invitations" })(InvitationPublicApiController.prototype, "list", listDescriptor);

Get(":id")(InvitationPublicApiController.prototype, "get", getDescriptor);
Param()(InvitationPublicApiController.prototype, "get", 0);
Query()(InvitationPublicApiController.prototype, "get", 1);
ApiParam({ name: "id" })(InvitationPublicApiController.prototype, "get", getDescriptor);
ApiQuery({ type: InvitationScopeDto })(InvitationPublicApiController.prototype, "get", getDescriptor);
ApiOperation({ summary: "Get invitation" })(InvitationPublicApiController.prototype, "get", getDescriptor);
ApiOkResponse({ description: "Invitation" })(InvitationPublicApiController.prototype, "get", getDescriptor);

Post("")(InvitationPublicApiController.prototype, "create", createDescriptor);
Body()(InvitationPublicApiController.prototype, "create", 0);
ApiBody({ type: InvitationCreateDto })(InvitationPublicApiController.prototype, "create", createDescriptor);
ApiOperation({ summary: "Create invitation" })(InvitationPublicApiController.prototype, "create", createDescriptor);
ApiOkResponse({ description: "Invitation created" })(InvitationPublicApiController.prototype, "create", createDescriptor);

Patch(":id/revoke")(InvitationPublicApiController.prototype, "revoke", revokeDescriptor);
Param()(InvitationPublicApiController.prototype, "revoke", 0);
Body()(InvitationPublicApiController.prototype, "revoke", 1);
ApiParam({ name: "id" })(InvitationPublicApiController.prototype, "revoke", revokeDescriptor);
ApiBody({ type: InvitationScopeDto })(InvitationPublicApiController.prototype, "revoke", revokeDescriptor);
ApiOperation({ summary: "Revoke invitation" })(InvitationPublicApiController.prototype, "revoke", revokeDescriptor);
ApiOkResponse({ description: "Invitation revoked" })(InvitationPublicApiController.prototype, "revoke", revokeDescriptor);

Module({
  imports: [TypeOrmModule.forFeature([
    ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
    ...FULCRUM_IDENTITY_ACCESS_ENTITIES,
    ...FULCRUM_INVITATION_ENTITIES,
  ])],
  controllers: [InvitationPublicApiController],
  providers: [
    { provide: INVITATION_PUBLIC_API_OPTIONS, useValue: null },
    InvitationStore,
    InvitationPublicApiService,
  ],
  exports: [InvitationPublicApiService],
})(InvitationPublicApiModule);
