import "reflect-metadata";

import { Body, Controller, Delete, ForbiddenException, Get, Inject, InternalServerErrorException, Module, NotFoundException, Param, Patch, Query } from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsIn, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import {
  FULCRUM_IDENTITY_ACCESS_ENTITIES,
} from "@identity-access/infrastructure/database/organization.entities.ts";
import {
  LastOrganizationOwnerError,
  OrganizationPermissionError,
  OrganizationStore,
  type OrganizationMemberPublicRow,
  type OrganizationPublicRow,
} from "@identity-access/infrastructure/database/organization-store.ts";
import { isFeatureEnabled } from "@feature-flags/application/env-features.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

import { OrganizationScopeDto, OrganizationUpdateDto, OrganizationMemberParamsDto, OrganizationMemberRoleDto } from "./dto/organization.dto.ts";
export { OrganizationScopeDto, OrganizationUpdateDto, OrganizationMemberParamsDto, OrganizationMemberRoleDto };

export const ORGANIZATION_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.organizationPublicApi.options");

export interface OrganizationPublicApiOptions {
  featuresEnv?: string;
}

export class OrganizationPublicApiService {
  constructor(
    private readonly options: OrganizationPublicApiOptions | null = null,
    private readonly store: OrganizationStore | null = null,
  ) {}

  async getOrganization(input: OrganizationScopeDto): Promise<OrganizationPublicRow> {
    return await this.mapStoreErrors(() => this.requireResult(this.requireStore().getOrganization(input)));
  }

  async updateOrganization(input: OrganizationUpdateDto): Promise<{ ok: true }> {
    await this.mapStoreErrors(() => this.requireBoolean(this.requireStore().updateOrganization(input)));
    return { ok: true };
  }

  async listMembers(input: OrganizationScopeDto): Promise<OrganizationMemberPublicRow[]> {
    return await this.mapStoreErrors(() => this.requireStore().listMembers(input));
  }

  async updateMemberRole(params: OrganizationMemberParamsDto, input: OrganizationMemberRoleDto): Promise<{ ok: true }> {
    await this.mapStoreErrors(() => this.requireBoolean(this.requireStore().updateMemberRole({
      orgId: input.orgId,
      userId: input.userId,
      targetUserId: params.userId,
      role: input.role,
    })));
    return { ok: true };
  }

  async removeMember(params: OrganizationMemberParamsDto, input: OrganizationScopeDto): Promise<{ ok: true }> {
    await this.mapStoreErrors(() => this.requireBoolean(this.requireStore().removeMember({
      orgId: input.orgId,
      userId: input.userId,
      targetUserId: params.userId,
    })));
    return { ok: true };
  }

  private async requireResult<T>(promise: Promise<T | null>): Promise<T> {
    const result = await promise;
    if (!result) throw new NotFoundException({ error: "Organization target not found." });
    return result;
  }

  private async requireBoolean(promise: Promise<boolean>): Promise<void> {
    if (!(await promise)) throw new NotFoundException({ error: "Organization target not found." });
  }

  private async mapStoreErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof OrganizationPermissionError) throw new ForbiddenException(error.message);
      if (error instanceof LastOrganizationOwnerError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  private requireStore(): OrganizationStore {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    if (!this.store) {
      throw new InternalServerErrorException("Organization public API TypeORM store is not configured.");
    }
    return this.store;
  }
}

export class OrganizationPublicApiController {
  constructor(private readonly organizations: OrganizationPublicApiService) {}

  async getOrganization(query: OrganizationScopeDto): Promise<OrganizationPublicRow> {
    return await this.organizations.getOrganization(query);
  }

  async updateOrganization(body: OrganizationUpdateDto): Promise<{ ok: true }> {
    return await this.organizations.updateOrganization(body);
  }

  async listMembers(query: OrganizationScopeDto): Promise<OrganizationMemberPublicRow[]> {
    return await this.organizations.listMembers(query);
  }

  async updateMemberRole(params: OrganizationMemberParamsDto, body: OrganizationMemberRoleDto): Promise<{ ok: true }> {
    return await this.organizations.updateMemberRole(params, body);
  }

  async removeMember(params: OrganizationMemberParamsDto, query: OrganizationScopeDto): Promise<{ ok: true }> {
    return await this.organizations.removeMember(params, query);
  }
}

export class OrganizationPublicApiModule {
  static register(options: OrganizationPublicApiOptions): NestDynamicModule {
    return {
      module: OrganizationPublicApiModule,
      imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...FULCRUM_IDENTITY_ACCESS_ENTITIES])],
      controllers: [OrganizationPublicApiController],
      providers: [
        { provide: ORGANIZATION_PUBLIC_API_OPTIONS, useValue: options },
        OrganizationStore,
        OrganizationPublicApiService,
      ],
      exports: [OrganizationPublicApiService],
    };
  }
}

Inject(ORGANIZATION_PUBLIC_API_OPTIONS)(OrganizationPublicApiService, undefined, 0);
Inject(OrganizationStore)(OrganizationPublicApiService, undefined, 1);
Inject(DataSource)(OrganizationStore, undefined, 0);
Inject(OrganizationPublicApiService)(OrganizationPublicApiController, undefined, 0);

for (const target of [OrganizationScopeDto, OrganizationUpdateDto, OrganizationMemberRoleDto] as const) {
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
  IsString()(target.prototype, "userId");
  MinLength(1)(target.prototype, "userId");
}
IsString()(OrganizationUpdateDto.prototype, "name");
MinLength(1)(OrganizationUpdateDto.prototype, "name");
IsString()(OrganizationMemberParamsDto.prototype, "userId");
MinLength(1)(OrganizationMemberParamsDto.prototype, "userId");
IsIn(["owner", "admin", "member", "guest"])(OrganizationMemberRoleDto.prototype, "role");

const routeDescriptors = {
  getOrganization: Object.getOwnPropertyDescriptor(OrganizationPublicApiController.prototype, "getOrganization"),
  updateOrganization: Object.getOwnPropertyDescriptor(OrganizationPublicApiController.prototype, "updateOrganization"),
  listMembers: Object.getOwnPropertyDescriptor(OrganizationPublicApiController.prototype, "listMembers"),
  updateMemberRole: Object.getOwnPropertyDescriptor(OrganizationPublicApiController.prototype, "updateMemberRole"),
  removeMember: Object.getOwnPropertyDescriptor(OrganizationPublicApiController.prototype, "removeMember"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("OrganizationPublicApiController route descriptors are missing");
}

Controller("api/v1/organizations")(OrganizationPublicApiController);
ApiTags("organizations")(OrganizationPublicApiController);

applyGetRoute("getOrganization", "current", OrganizationScopeDto, "Get current organization");
applyPatchRoute("updateOrganization", "current", OrganizationUpdateDto, "Update organization");
applyGetRoute("listMembers", "members", OrganizationScopeDto, "List organization members");
applyPatchRoute("updateMemberRole", "members/:userId/role", OrganizationMemberRoleDto, "Update organization member role", true);
applyDeleteRoute("removeMember", "members/:userId", OrganizationScopeDto, "Remove organization member");

Module({
  imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...FULCRUM_IDENTITY_ACCESS_ENTITIES])],
  controllers: [OrganizationPublicApiController],
  providers: [
    { provide: ORGANIZATION_PUBLIC_API_OPTIONS, useValue: null },
    OrganizationStore,
    OrganizationPublicApiService,
  ],
  exports: [OrganizationPublicApiService],
})(OrganizationPublicApiModule);

function applyGetRoute(method: keyof typeof routeDescriptors, path: string, queryType: new () => unknown, summary: string): void {
  const descriptor = routeDescriptors[method]!;
  Get(path)(OrganizationPublicApiController.prototype, method, descriptor);
  Query()(OrganizationPublicApiController.prototype, method, 0);
  ApiQuery({ type: queryType })(OrganizationPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(OrganizationPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(OrganizationPublicApiController.prototype, method, descriptor);
}

function applyPatchRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  bodyType: new () => unknown,
  summary: string,
  hasUserId = false,
): void {
  const descriptor = routeDescriptors[method]!;
  Patch(path)(OrganizationPublicApiController.prototype, method, descriptor);
  if (hasUserId) {
    Param()(OrganizationPublicApiController.prototype, method, 0);
    Body()(OrganizationPublicApiController.prototype, method, 1);
    ApiParam({ name: "userId" })(OrganizationPublicApiController.prototype, method, descriptor);
  } else {
    Body()(OrganizationPublicApiController.prototype, method, 0);
  }
  ApiOperation({ summary })(OrganizationPublicApiController.prototype, method, descriptor);
  ApiBody({ type: bodyType })(OrganizationPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(OrganizationPublicApiController.prototype, method, descriptor);
}

function applyDeleteRoute(method: keyof typeof routeDescriptors, path: string, queryType: new () => unknown, summary: string): void {
  const descriptor = routeDescriptors[method]!;
  Delete(path)(OrganizationPublicApiController.prototype, method, descriptor);
  Param()(OrganizationPublicApiController.prototype, method, 0);
  Query()(OrganizationPublicApiController.prototype, method, 1);
  ApiParam({ name: "userId" })(OrganizationPublicApiController.prototype, method, descriptor);
  ApiQuery({ type: queryType })(OrganizationPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(OrganizationPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(OrganizationPublicApiController.prototype, method, descriptor);
}
