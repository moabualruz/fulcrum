import "reflect-metadata";

import { Body, Controller, Delete, Get, Inject, InternalServerErrorException, Module, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";
import {
  CustomFieldStore,
  type CustomFieldPublicRow,
  type CustomFieldType,
  type TaskCustomFieldsPublicRow,
} from "@work-management/infrastructure/database/custom-field-store.ts";
import { WORK_MANAGEMENT_ENTITIES } from "@work-management/infrastructure/database/work-structure.entities.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export const CUSTOM_FIELD_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.customFieldPublicApi.options");

export interface CustomFieldPublicApiOptions {
  featuresEnv?: string;
}

export class CustomFieldListQueryDto {
  orgId!: string;
  userId!: string;
  projectId?: string;
  includeArchived?: boolean;
  entityType?: string;
}

export class CustomFieldIdParamsDto {
  id!: string;
}

export class CustomFieldCreateDto {
  orgId!: string;
  userId!: string;
  projectId!: string;
  name!: string;
  type!: CustomFieldType;
  configJson?: Record<string, unknown>;
  required?: boolean;
}

export class CustomFieldUpdateDto {
  orgId!: string;
  userId!: string;
  name?: string;
  type?: CustomFieldType;
  configJson?: Record<string, unknown>;
  required?: boolean;
  position?: number;
}

export class CustomFieldReorderDto {
  orgId!: string;
  userId!: string;
  projectId!: string;
  orderedIds!: string[];
}

export class TaskCustomFieldSetDto {
  orgId!: string;
  userId!: string;
  taskId!: string;
  fieldDefId!: string;
  value!: unknown;
}

export class TaskCustomFieldClearDto {
  orgId!: string;
  userId!: string;
  taskId!: string;
  fieldDefId!: string;
}

export class CustomFieldPublicApiService {
  constructor(
    private readonly options: CustomFieldPublicApiOptions | null = null,
    private readonly store: CustomFieldStore | null = null,
  ) {}

  async listFields(input: CustomFieldListQueryDto): Promise<CustomFieldPublicRow[]> {
    return await this.requireStore().list(input);
  }

  async createField(input: CustomFieldCreateDto): Promise<CustomFieldPublicRow> {
    return await this.requireResult(this.requireStore().create(input));
  }

  async updateField(params: CustomFieldIdParamsDto, input: CustomFieldUpdateDto): Promise<CustomFieldPublicRow> {
    return await this.requireResult(this.requireStore().update({ ...input, id: params.id }));
  }

  async deleteField(params: CustomFieldIdParamsDto, input: CustomFieldListQueryDto): Promise<{ ok: true }> {
    await this.requireBoolean(this.requireStore().archive({ orgId: input.orgId, id: params.id }));
    return { ok: true };
  }

  async reorderFields(input: CustomFieldReorderDto): Promise<{ ok: true }> {
    await this.requireBoolean(this.requireStore().reorder(input));
    return { ok: true };
  }

  async setTaskField(input: TaskCustomFieldSetDto): Promise<TaskCustomFieldsPublicRow> {
    return await this.requireResult(this.requireStore().setTaskField(input));
  }

  async clearTaskField(input: TaskCustomFieldClearDto): Promise<TaskCustomFieldsPublicRow> {
    return await this.requireResult(this.requireStore().clearTaskField(input));
  }

  private async requireResult<T>(promise: Promise<T | null>): Promise<T> {
    const result = await promise;
    if (!result) throw new NotFoundException({ error: "Custom field target not found." });
    return result;
  }

  private async requireBoolean(promise: Promise<boolean>): Promise<void> {
    if (!(await promise)) throw new NotFoundException({ error: "Custom field target not found." });
  }

  private requireStore(): CustomFieldStore {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    if (!this.store) {
      throw new InternalServerErrorException("Custom field public API TypeORM store is not configured.");
    }
    return this.store;
  }
}

export class CustomFieldPublicApiController {
  constructor(private readonly fields: CustomFieldPublicApiService) {}

  async listFields(query: CustomFieldListQueryDto): Promise<CustomFieldPublicRow[]> {
    return await this.fields.listFields(query);
  }

  async createField(body: CustomFieldCreateDto): Promise<CustomFieldPublicRow> {
    return await this.fields.createField(body);
  }

  async updateField(params: CustomFieldIdParamsDto, body: CustomFieldUpdateDto): Promise<CustomFieldPublicRow> {
    return await this.fields.updateField(params, body);
  }

  async deleteField(params: CustomFieldIdParamsDto, query: CustomFieldListQueryDto): Promise<{ ok: true }> {
    return await this.fields.deleteField(params, query);
  }

  async reorderFields(body: CustomFieldReorderDto): Promise<{ ok: true }> {
    return await this.fields.reorderFields(body);
  }

  async setTaskField(body: TaskCustomFieldSetDto): Promise<TaskCustomFieldsPublicRow> {
    return await this.fields.setTaskField(body);
  }

  async clearTaskField(body: TaskCustomFieldClearDto): Promise<TaskCustomFieldsPublicRow> {
    return await this.fields.clearTaskField(body);
  }
}

export class CustomFieldPublicApiModule {
  static register(options: CustomFieldPublicApiOptions): NestDynamicModule {
    return {
      module: CustomFieldPublicApiModule,
      imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...WORK_MANAGEMENT_ENTITIES])],
      controllers: [CustomFieldPublicApiController],
      providers: [
        { provide: CUSTOM_FIELD_PUBLIC_API_OPTIONS, useValue: options },
        CustomFieldStore,
        CustomFieldPublicApiService,
      ],
      exports: [CustomFieldPublicApiService],
    };
  }
}

Inject(CUSTOM_FIELD_PUBLIC_API_OPTIONS)(CustomFieldPublicApiService, undefined, 0);
Inject(CustomFieldStore)(CustomFieldPublicApiService, undefined, 1);
Inject(DataSource)(CustomFieldStore, undefined, 0);
Inject(CustomFieldPublicApiService)(CustomFieldPublicApiController, undefined, 0);

for (const target of [
  CustomFieldListQueryDto,
  CustomFieldCreateDto,
  CustomFieldUpdateDto,
  CustomFieldReorderDto,
  TaskCustomFieldSetDto,
  TaskCustomFieldClearDto,
] as const) {
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
  IsString()(target.prototype, "userId");
  MinLength(1)(target.prototype, "userId");
}

IsString()(CustomFieldIdParamsDto.prototype, "id");
MinLength(1)(CustomFieldIdParamsDto.prototype, "id");
IsOptional()(CustomFieldListQueryDto.prototype, "projectId");
IsString()(CustomFieldListQueryDto.prototype, "projectId");
IsOptional()(CustomFieldListQueryDto.prototype, "includeArchived");
IsBoolean()(CustomFieldListQueryDto.prototype, "includeArchived");
IsOptional()(CustomFieldListQueryDto.prototype, "entityType");
IsString()(CustomFieldListQueryDto.prototype, "entityType");
for (const target of [CustomFieldCreateDto, CustomFieldReorderDto] as const) {
  IsString()(target.prototype, "projectId");
  MinLength(1)(target.prototype, "projectId");
}
IsString()(CustomFieldCreateDto.prototype, "name");
MinLength(1)(CustomFieldCreateDto.prototype, "name");
for (const target of [CustomFieldCreateDto, CustomFieldUpdateDto] as const) {
  IsOptional()(target.prototype, "configJson");
  IsObject()(target.prototype, "configJson");
  IsOptional()(target.prototype, "required");
  IsBoolean()(target.prototype, "required");
  IsOptional()(target.prototype, "type");
  IsIn(["text", "number", "date", "select", "multi_select", "boolean", "checkbox", "user", "url", "json"])(target.prototype, "type");
}
IsOptional()(CustomFieldUpdateDto.prototype, "name");
IsString()(CustomFieldUpdateDto.prototype, "name");
IsOptional()(CustomFieldUpdateDto.prototype, "position");
IsArray()(CustomFieldReorderDto.prototype, "orderedIds");
for (const target of [TaskCustomFieldSetDto, TaskCustomFieldClearDto] as const) {
  IsString()(target.prototype, "taskId");
  MinLength(1)(target.prototype, "taskId");
  IsString()(target.prototype, "fieldDefId");
  MinLength(1)(target.prototype, "fieldDefId");
}

const routeDescriptors = {
  listFields: Object.getOwnPropertyDescriptor(CustomFieldPublicApiController.prototype, "listFields"),
  createField: Object.getOwnPropertyDescriptor(CustomFieldPublicApiController.prototype, "createField"),
  updateField: Object.getOwnPropertyDescriptor(CustomFieldPublicApiController.prototype, "updateField"),
  deleteField: Object.getOwnPropertyDescriptor(CustomFieldPublicApiController.prototype, "deleteField"),
  reorderFields: Object.getOwnPropertyDescriptor(CustomFieldPublicApiController.prototype, "reorderFields"),
  setTaskField: Object.getOwnPropertyDescriptor(CustomFieldPublicApiController.prototype, "setTaskField"),
  clearTaskField: Object.getOwnPropertyDescriptor(CustomFieldPublicApiController.prototype, "clearTaskField"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("CustomFieldPublicApiController route descriptors are missing");
}

Controller("api/v1")(CustomFieldPublicApiController);
ApiTags("custom-fields")(CustomFieldPublicApiController);

applyGetRoute("listFields", "custom-fields", CustomFieldListQueryDto, "List custom fields");
applyPostRoute("createField", "custom-fields", CustomFieldCreateDto, "Create custom field");
applyPatchRoute("updateField", "custom-fields/:id", CustomFieldUpdateDto, "Update custom field");
applyDeleteRoute("deleteField", "custom-fields/:id", CustomFieldListQueryDto, "Archive custom field");
applyPostRoute("reorderFields", "custom-fields/reorder", CustomFieldReorderDto, "Reorder custom fields");
applyPostRoute("setTaskField", "task-custom-fields/set", TaskCustomFieldSetDto, "Set task custom field");
applyPostRoute("clearTaskField", "task-custom-fields/clear", TaskCustomFieldClearDto, "Clear task custom field");

Module({
  imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...WORK_MANAGEMENT_ENTITIES])],
  controllers: [CustomFieldPublicApiController],
  providers: [
    { provide: CUSTOM_FIELD_PUBLIC_API_OPTIONS, useValue: null },
    CustomFieldStore,
    CustomFieldPublicApiService,
  ],
  exports: [CustomFieldPublicApiService],
})(CustomFieldPublicApiModule);

function applyGetRoute(method: keyof typeof routeDescriptors, path: string, queryType: new () => unknown, summary: string): void {
  const descriptor = routeDescriptors[method]!;
  Get(path)(CustomFieldPublicApiController.prototype, method, descriptor);
  Query()(CustomFieldPublicApiController.prototype, method, 0);
  ApiQuery({ type: queryType })(CustomFieldPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(CustomFieldPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(CustomFieldPublicApiController.prototype, method, descriptor);
}

function applyPostRoute(method: keyof typeof routeDescriptors, path: string, bodyType: new () => unknown, summary: string): void {
  const descriptor = routeDescriptors[method]!;
  Post(path)(CustomFieldPublicApiController.prototype, method, descriptor);
  Body()(CustomFieldPublicApiController.prototype, method, 0);
  ApiOperation({ summary })(CustomFieldPublicApiController.prototype, method, descriptor);
  ApiBody({ type: bodyType })(CustomFieldPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(CustomFieldPublicApiController.prototype, method, descriptor);
}

function applyPatchRoute(method: keyof typeof routeDescriptors, path: string, bodyType: new () => unknown, summary: string): void {
  const descriptor = routeDescriptors[method]!;
  Patch(path)(CustomFieldPublicApiController.prototype, method, descriptor);
  Param()(CustomFieldPublicApiController.prototype, method, 0);
  Body()(CustomFieldPublicApiController.prototype, method, 1);
  ApiParam({ name: "id" })(CustomFieldPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(CustomFieldPublicApiController.prototype, method, descriptor);
  ApiBody({ type: bodyType })(CustomFieldPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(CustomFieldPublicApiController.prototype, method, descriptor);
}

function applyDeleteRoute(method: keyof typeof routeDescriptors, path: string, queryType: new () => unknown, summary: string): void {
  const descriptor = routeDescriptors[method]!;
  Delete(path)(CustomFieldPublicApiController.prototype, method, descriptor);
  Param()(CustomFieldPublicApiController.prototype, method, 0);
  Query()(CustomFieldPublicApiController.prototype, method, 1);
  ApiParam({ name: "id" })(CustomFieldPublicApiController.prototype, method, descriptor);
  ApiQuery({ type: queryType })(CustomFieldPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(CustomFieldPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(CustomFieldPublicApiController.prototype, method, descriptor);
}
