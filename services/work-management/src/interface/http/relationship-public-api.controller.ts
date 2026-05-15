import "reflect-metadata";

import { Body, Controller, Inject, InternalServerErrorException, Module, NotFoundException, Post } from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import type { TraceRef } from "@workflow-coordination/domain/trace.ts";
import { RelationshipStore, type RelationshipRow, type RelationshipType } from "@work-management/infrastructure/database/relationship-store.ts";

import { RelationshipTaskScopeDto, RelationshipProjectScopeDto, RelationshipCreateDto, RelationshipDeleteDto, RelationshipDuplicateDto, RelationshipSummaryDto } from "./dto/relationship.dto.ts";
export { RelationshipTaskScopeDto, RelationshipProjectScopeDto, RelationshipCreateDto, RelationshipDeleteDto, RelationshipDuplicateDto, RelationshipSummaryDto };

export const RELATIONSHIP_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.relationshipPublicApi.options");

export interface RelationshipPublicApiOptions {
  featuresEnv?: string;
}

export class RelationshipPublicApiService {
  constructor(
    private readonly options: RelationshipPublicApiOptions | null = null,
    private readonly store: RelationshipStore | null = null,
  ) {}

  async createRelationship(input: RelationshipCreateDto): Promise<RelationshipRow> {
    return await this.requireResult(this.requireStore().createRelationship(input));
  }

  async deleteRelationship(input: RelationshipDeleteDto): Promise<unknown> {
    return await this.requireResult(this.requireStore().deleteRelationship(input));
  }

  async listRelationshipsForTask(input: RelationshipTaskScopeDto): Promise<RelationshipRow[]> {
    return await this.requireStore().listRelationshipsForTask(input);
  }

  async listTaskBlockers(input: RelationshipTaskScopeDto): Promise<RelationshipRow[]> {
    return await this.requireStore().listTaskBlockers(input);
  }

  async listBlockedItems(input: RelationshipProjectScopeDto): Promise<RelationshipRow[]> {
    return await this.requireStore().listBlockedItems(input);
  }

  async listTasksBlockedBy(input: RelationshipTaskScopeDto): Promise<RelationshipRow[]> {
    return await this.requireStore().listTasksBlockedBy(input);
  }

  async markTaskAsDuplicate(input: RelationshipDuplicateDto): Promise<RelationshipRow> {
    return await this.requireResult(this.requireStore().markTaskAsDuplicate(input));
  }

  async summarizeEntityRelationships(input: RelationshipSummaryDto): Promise<unknown> {
    return await this.requireResult(this.requireStore().summarizeEntityRelationships(input));
  }

  private async requireResult<T>(promise: Promise<T | null>): Promise<T> {
    const result = await promise;
    if (!result) throw new NotFoundException({ error: "Relationship target not found." });
    return result;
  }

  private requireStore(): RelationshipStore {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    if (!this.store) {
      throw new InternalServerErrorException("Relationship public API TypeORM store is not configured.");
    }
    return this.store;
  }
}

export class RelationshipPublicApiController {
  constructor(private readonly relationships: RelationshipPublicApiService) {}

  async createRelationship(body: RelationshipCreateDto): Promise<RelationshipRow> {
    return await this.relationships.createRelationship(body);
  }

  async deleteRelationship(body: RelationshipDeleteDto): Promise<unknown> {
    return await this.relationships.deleteRelationship(body);
  }

  async listRelationshipsForTask(body: RelationshipTaskScopeDto): Promise<RelationshipRow[]> {
    return await this.relationships.listRelationshipsForTask(body);
  }

  async listTaskBlockers(body: RelationshipTaskScopeDto): Promise<RelationshipRow[]> {
    return await this.relationships.listTaskBlockers(body);
  }

  async listBlockedItems(body: RelationshipProjectScopeDto): Promise<RelationshipRow[]> {
    return await this.relationships.listBlockedItems(body);
  }

  async listTasksBlockedBy(body: RelationshipTaskScopeDto): Promise<RelationshipRow[]> {
    return await this.relationships.listTasksBlockedBy(body);
  }

  async markTaskAsDuplicate(body: RelationshipDuplicateDto): Promise<RelationshipRow> {
    return await this.relationships.markTaskAsDuplicate(body);
  }

  async summarizeEntityRelationships(body: RelationshipSummaryDto): Promise<unknown> {
    return await this.relationships.summarizeEntityRelationships(body);
  }
}

export class RelationshipPublicApiModule {
  static register(options: RelationshipPublicApiOptions): NestDynamicModule {
    return {
      module: RelationshipPublicApiModule,
      imports: [TypeOrmModule.forFeature(FULCRUM_WORKFLOW_SPINE_ENTITIES)],
      controllers: [RelationshipPublicApiController],
      providers: [
        { provide: RELATIONSHIP_PUBLIC_API_OPTIONS, useValue: options },
        RelationshipStore,
        RelationshipPublicApiService,
      ],
      exports: [RelationshipPublicApiService],
    };
  }
}

Inject(RELATIONSHIP_PUBLIC_API_OPTIONS)(RelationshipPublicApiService, undefined, 0);
Inject(RelationshipStore)(RelationshipPublicApiService, undefined, 1);
Inject(DataSource)(RelationshipStore, undefined, 0);
Inject(RelationshipPublicApiService)(RelationshipPublicApiController, undefined, 0);

for (const target of [
  RelationshipTaskScopeDto,
  RelationshipProjectScopeDto,
  RelationshipCreateDto,
  RelationshipDeleteDto,
  RelationshipDuplicateDto,
  RelationshipSummaryDto,
]) {
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
}

for (const property of ["taskId"] as const) {
  IsString()(RelationshipTaskScopeDto.prototype, property);
  MinLength(1)(RelationshipTaskScopeDto.prototype, property);
}
IsString()(RelationshipProjectScopeDto.prototype, "projectId");
MinLength(1)(RelationshipProjectScopeDto.prototype, "projectId");
IsString()(RelationshipSummaryDto.prototype, "projectId");
MinLength(1)(RelationshipSummaryDto.prototype, "projectId");
IsObject()(RelationshipSummaryDto.prototype, "entity");

for (const property of ["sourceTaskId", "targetTaskId"] as const) {
  IsString()(RelationshipCreateDto.prototype, property);
  MinLength(1)(RelationshipCreateDto.prototype, property);
  IsString()(RelationshipDuplicateDto.prototype, property);
  MinLength(1)(RelationshipDuplicateDto.prototype, property);
}
IsIn(["blocks", "relates_to", "duplicate_of"])(RelationshipCreateDto.prototype, "type");
IsString()(RelationshipDeleteDto.prototype, "relationshipId");
MinLength(1)(RelationshipDeleteDto.prototype, "relationshipId");
for (const property of ["autoClose", "transferWatchers"] as const) {
  IsOptional()(RelationshipDuplicateDto.prototype, property);
  IsBoolean()(RelationshipDuplicateDto.prototype, property);
}

const routeDescriptors = {
  createRelationship: Object.getOwnPropertyDescriptor(RelationshipPublicApiController.prototype, "createRelationship"),
  deleteRelationship: Object.getOwnPropertyDescriptor(RelationshipPublicApiController.prototype, "deleteRelationship"),
  listRelationshipsForTask: Object.getOwnPropertyDescriptor(RelationshipPublicApiController.prototype, "listRelationshipsForTask"),
  listTaskBlockers: Object.getOwnPropertyDescriptor(RelationshipPublicApiController.prototype, "listTaskBlockers"),
  listBlockedItems: Object.getOwnPropertyDescriptor(RelationshipPublicApiController.prototype, "listBlockedItems"),
  listTasksBlockedBy: Object.getOwnPropertyDescriptor(RelationshipPublicApiController.prototype, "listTasksBlockedBy"),
  markTaskAsDuplicate: Object.getOwnPropertyDescriptor(RelationshipPublicApiController.prototype, "markTaskAsDuplicate"),
  summarizeEntityRelationships: Object.getOwnPropertyDescriptor(RelationshipPublicApiController.prototype, "summarizeEntityRelationships"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("RelationshipPublicApiController route descriptors are missing");
}

Controller("api/v1/relationships")(RelationshipPublicApiController);
ApiTags("relationships")(RelationshipPublicApiController);

applyPostRoute("createRelationship", "create", RelationshipCreateDto, "Create task relationship");
applyPostRoute("deleteRelationship", "delete", RelationshipDeleteDto, "Delete task relationship");
applyPostRoute("listRelationshipsForTask", "list-for-task", RelationshipTaskScopeDto, "List task relationships");
applyPostRoute("listTaskBlockers", "blockers", RelationshipTaskScopeDto, "List task blockers");
applyPostRoute("listBlockedItems", "blocked-items", RelationshipProjectScopeDto, "List blocked tasks");
applyPostRoute("listTasksBlockedBy", "list-blocked-by", RelationshipTaskScopeDto, "List tasks blocked by task");
applyPostRoute("markTaskAsDuplicate", "mark-as-duplicate", RelationshipDuplicateDto, "Mark task as duplicate");
applyPostRoute("summarizeEntityRelationships", "summary", RelationshipSummaryDto, "Summarize entity relationships");

Module({
  imports: [TypeOrmModule.forFeature(FULCRUM_WORKFLOW_SPINE_ENTITIES)],
  controllers: [RelationshipPublicApiController],
  providers: [
    { provide: RELATIONSHIP_PUBLIC_API_OPTIONS, useValue: null },
    RelationshipStore,
    RelationshipPublicApiService,
  ],
  exports: [RelationshipPublicApiService],
})(RelationshipPublicApiModule);

function applyPostRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  bodyType: new () => unknown,
  summary: string,
): void {
  const descriptor = routeDescriptors[method]!;
  Post(path)(RelationshipPublicApiController.prototype, method, descriptor);
  Body()(RelationshipPublicApiController.prototype, method, 0);
  ApiOperation({ summary })(RelationshipPublicApiController.prototype, method, descriptor);
  ApiBody({ type: bodyType })(RelationshipPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(RelationshipPublicApiController.prototype, method, descriptor);
}
