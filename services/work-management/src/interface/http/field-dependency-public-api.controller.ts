import "reflect-metadata";

import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  InternalServerErrorException,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsIn, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";
import {
  FieldDependencyStore,
  type FieldDependencyAction,
  type FieldDependencyPublicRow,
} from "@work-management/infrastructure/database/field-dependency-store.ts";
import { WORK_MANAGEMENT_ENTITIES } from "@work-management/infrastructure/database/work-structure.entities.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export const FIELD_DEPENDENCY_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.fieldDependencyPublicApi.options");

export interface FieldDependencyPublicApiOptions {
  featuresEnv?: string;
}

export class FieldDependencyListQueryDto {
  orgId!: string;
  userId!: string;
  projectId!: string;
}

export class FieldDependencyIdParamsDto {
  id!: string;
}

export class FieldDependencyCreateDto {
  orgId!: string;
  userId!: string;
  projectId!: string;
  sourceFieldId!: string;
  sourceValue!: string;
  targetFieldId!: string;
  action!: FieldDependencyAction;
}

export class FieldDependencyDeleteQueryDto {
  orgId!: string;
  userId!: string;
}

export class FieldDependencyPublicApiService {
  constructor(
    private readonly options: FieldDependencyPublicApiOptions | null = null,
    private readonly store: FieldDependencyStore | null = null,
  ) {}

  async listRules(input: FieldDependencyListQueryDto): Promise<FieldDependencyPublicRow[]> {
    return await this.requireStore().list(input);
  }

  async createRule(input: FieldDependencyCreateDto): Promise<FieldDependencyPublicRow> {
    const result = await this.requireStore().create(input);
    if (!result) throw new NotFoundException({ error: "Field dependency project not found." });
    return result;
  }

  async deleteRule(params: FieldDependencyIdParamsDto, input: FieldDependencyDeleteQueryDto): Promise<{ ok: true }> {
    if (!(await this.requireStore().delete({ orgId: input.orgId, id: params.id }))) {
      throw new NotFoundException({ error: "Field dependency rule not found." });
    }
    return { ok: true };
  }

  private requireStore(): FieldDependencyStore {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    if (!this.store) {
      throw new InternalServerErrorException("Field dependency public API TypeORM store is not configured.");
    }
    return this.store;
  }
}

export class FieldDependencyPublicApiController {
  constructor(private readonly dependencies: FieldDependencyPublicApiService) {}

  async listRules(query: FieldDependencyListQueryDto): Promise<FieldDependencyPublicRow[]> {
    return await this.dependencies.listRules(query);
  }

  async createRule(body: FieldDependencyCreateDto): Promise<FieldDependencyPublicRow> {
    return await this.dependencies.createRule(body);
  }

  async deleteRule(params: FieldDependencyIdParamsDto, query: FieldDependencyDeleteQueryDto): Promise<{ ok: true }> {
    return await this.dependencies.deleteRule(params, query);
  }
}

export class FieldDependencyPublicApiModule {
  static register(options: FieldDependencyPublicApiOptions): NestDynamicModule {
    return {
      module: FieldDependencyPublicApiModule,
      imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...WORK_MANAGEMENT_ENTITIES])],
      controllers: [FieldDependencyPublicApiController],
      providers: [
        { provide: FIELD_DEPENDENCY_PUBLIC_API_OPTIONS, useValue: options },
        FieldDependencyStore,
        FieldDependencyPublicApiService,
      ],
      exports: [FieldDependencyPublicApiService],
    };
  }
}

Inject(FIELD_DEPENDENCY_PUBLIC_API_OPTIONS)(FieldDependencyPublicApiService, undefined, 0);
Inject(FieldDependencyStore)(FieldDependencyPublicApiService, undefined, 1);
Inject(DataSource)(FieldDependencyStore, undefined, 0);
Inject(FieldDependencyPublicApiService)(FieldDependencyPublicApiController, undefined, 0);

for (const target of [
  FieldDependencyListQueryDto,
  FieldDependencyCreateDto,
  FieldDependencyDeleteQueryDto,
] as const) {
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
  IsString()(target.prototype, "userId");
  MinLength(1)(target.prototype, "userId");
}

for (const target of [FieldDependencyListQueryDto, FieldDependencyCreateDto] as const) {
  IsString()(target.prototype, "projectId");
  MinLength(1)(target.prototype, "projectId");
}

IsString()(FieldDependencyIdParamsDto.prototype, "id");
MinLength(1)(FieldDependencyIdParamsDto.prototype, "id");

for (const field of ["sourceFieldId", "sourceValue", "targetFieldId"] as const) {
  IsString()(FieldDependencyCreateDto.prototype, field);
  MinLength(1)(FieldDependencyCreateDto.prototype, field);
}
IsIn(["show", "hide", "require"])(FieldDependencyCreateDto.prototype, "action");

const routeDescriptors = {
  listRules: Object.getOwnPropertyDescriptor(FieldDependencyPublicApiController.prototype, "listRules"),
  createRule: Object.getOwnPropertyDescriptor(FieldDependencyPublicApiController.prototype, "createRule"),
  deleteRule: Object.getOwnPropertyDescriptor(FieldDependencyPublicApiController.prototype, "deleteRule"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("FieldDependencyPublicApiController route descriptors are missing");
}

Controller("api/v1")(FieldDependencyPublicApiController);
ApiTags("field-dependencies")(FieldDependencyPublicApiController);

applyGetRoute("listRules", "field-dependencies", FieldDependencyListQueryDto, "List field dependency rules");
applyPostRoute("createRule", "field-dependencies", FieldDependencyCreateDto, "Create field dependency rule");
applyDeleteRoute("deleteRule", "field-dependencies/:id", FieldDependencyDeleteQueryDto, "Delete field dependency rule");

Module({
  imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...WORK_MANAGEMENT_ENTITIES])],
  controllers: [FieldDependencyPublicApiController],
  providers: [
    { provide: FIELD_DEPENDENCY_PUBLIC_API_OPTIONS, useValue: null },
    FieldDependencyStore,
    FieldDependencyPublicApiService,
  ],
  exports: [FieldDependencyPublicApiService],
})(FieldDependencyPublicApiModule);

function applyGetRoute(method: keyof typeof routeDescriptors, path: string, queryType: new () => unknown, summary: string): void {
  const descriptor = routeDescriptors[method]!;
  Get(path)(FieldDependencyPublicApiController.prototype, method, descriptor);
  Query()(FieldDependencyPublicApiController.prototype, method, 0);
  ApiQuery({ type: queryType })(FieldDependencyPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(FieldDependencyPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(FieldDependencyPublicApiController.prototype, method, descriptor);
}

function applyPostRoute(method: keyof typeof routeDescriptors, path: string, bodyType: new () => unknown, summary: string): void {
  const descriptor = routeDescriptors[method]!;
  Post(path)(FieldDependencyPublicApiController.prototype, method, descriptor);
  Body()(FieldDependencyPublicApiController.prototype, method, 0);
  ApiOperation({ summary })(FieldDependencyPublicApiController.prototype, method, descriptor);
  ApiBody({ type: bodyType })(FieldDependencyPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(FieldDependencyPublicApiController.prototype, method, descriptor);
}

function applyDeleteRoute(method: keyof typeof routeDescriptors, path: string, queryType: new () => unknown, summary: string): void {
  const descriptor = routeDescriptors[method]!;
  Delete(path)(FieldDependencyPublicApiController.prototype, method, descriptor);
  Param()(FieldDependencyPublicApiController.prototype, method, 0);
  Query()(FieldDependencyPublicApiController.prototype, method, 1);
  ApiParam({ name: "id" })(FieldDependencyPublicApiController.prototype, method, descriptor);
  ApiQuery({ type: queryType })(FieldDependencyPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(FieldDependencyPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(FieldDependencyPublicApiController.prototype, method, descriptor);
}
