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
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";
import { WORK_AUTOMATION_ENTITIES } from "@work-management/infrastructure/database/automation.entities.ts";
import {
  AutomationStore,
  type AutomationCondition,
  type AutomationPublicRow,
  type AutomationTemplate,
} from "@work-management/infrastructure/database/automation-store.ts";

import { AutomationListQueryDto, AutomationContextQueryDto, AutomationIdParamsDto, AutomationConditionDto, AutomationCreateDto, AutomationUpdateDto } from "./dto/automation.dto.ts";
export { AutomationListQueryDto, AutomationContextQueryDto, AutomationIdParamsDto, AutomationConditionDto, AutomationCreateDto, AutomationUpdateDto };

export const AUTOMATION_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.automationPublicApi.options");

export interface AutomationPublicApiOptions {
  featuresEnv?: string;
}

export class AutomationPublicApiService {
  constructor(
    private readonly options: AutomationPublicApiOptions | null = null,
    private readonly store: AutomationStore | null = null,
  ) {}

  async listAutomations(input: AutomationListQueryDto): Promise<AutomationPublicRow[]> {
    return await this.requireStore().list({
      orgId: input.orgId,
      projectId: input.projectId,
    });
  }

  async createAutomation(input: AutomationCreateDto): Promise<AutomationPublicRow> {
    return await this.requireStore().create(input);
  }

  async updateAutomation(params: AutomationIdParamsDto, input: AutomationUpdateDto): Promise<AutomationPublicRow> {
    const result = await this.requireStore().update({
      ...input,
      id: params.id,
    });
    if (!result) throw new NotFoundException({ error: "automation not found" });
    return result;
  }

  async deleteAutomation(params: AutomationIdParamsDto, input: AutomationContextQueryDto): Promise<{ deleted: true }> {
    if (!(await this.requireStore().delete({ orgId: input.orgId, id: params.id }))) {
      throw new NotFoundException({ error: "automation not found" });
    }
    return { deleted: true };
  }

  templates(): AutomationTemplate[] {
    return this.requireStore().templates();
  }

  private requireStore(): AutomationStore {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    if (!this.store) {
      throw new InternalServerErrorException("Automation public API TypeORM store is not configured.");
    }
    return this.store;
  }
}

export class AutomationPublicApiController {
  constructor(private readonly automations: AutomationPublicApiService) {}

  async listAutomations(query: AutomationListQueryDto): Promise<AutomationPublicRow[]> {
    return await this.automations.listAutomations(query);
  }

  async createAutomation(body: AutomationCreateDto): Promise<AutomationPublicRow> {
    return await this.automations.createAutomation(body);
  }

  async templates(): Promise<AutomationTemplate[]> {
    return this.automations.templates();
  }

  async updateAutomation(params: AutomationIdParamsDto, body: AutomationUpdateDto): Promise<AutomationPublicRow> {
    return await this.automations.updateAutomation(params, body);
  }

  async deleteAutomation(params: AutomationIdParamsDto, query: AutomationContextQueryDto): Promise<{ deleted: true }> {
    return await this.automations.deleteAutomation(params, query);
  }
}

export class AutomationPublicApiModule {
  static register(options: AutomationPublicApiOptions): NestDynamicModule {
    return {
      module: AutomationPublicApiModule,
      imports: [TypeOrmModule.forFeature(WORK_AUTOMATION_ENTITIES)],
      controllers: [AutomationPublicApiController],
      providers: [
        { provide: AUTOMATION_PUBLIC_API_OPTIONS, useValue: options },
        AutomationStore,
        AutomationPublicApiService,
      ],
      exports: [AutomationPublicApiService],
    };
  }
}

Inject(AUTOMATION_PUBLIC_API_OPTIONS)(AutomationPublicApiService, undefined, 0);
Inject(AutomationStore)(AutomationPublicApiService, undefined, 1);
Inject(DataSource)(AutomationStore, undefined, 0);
Inject(AutomationPublicApiService)(AutomationPublicApiController, undefined, 0);

for (const target of [AutomationListQueryDto, AutomationContextQueryDto, AutomationCreateDto, AutomationUpdateDto] as const) {
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
  IsString()(target.prototype, "userId");
  MinLength(1)(target.prototype, "userId");
}

IsString()(AutomationListQueryDto.prototype, "projectId");
MinLength(1)(AutomationListQueryDto.prototype, "projectId");
IsString()(AutomationIdParamsDto.prototype, "id");
MinLength(1)(AutomationIdParamsDto.prototype, "id");

IsString()(AutomationConditionDto.prototype, "field");
MinLength(1)(AutomationConditionDto.prototype, "field");
IsIn(["equals", "not_equals", "contains", "is_empty", "is_not_empty"])(
  AutomationConditionDto.prototype,
  "operator",
);

for (const target of [AutomationCreateDto, AutomationUpdateDto] as const) {
  IsOptional()(target.prototype, "triggerConfig");
  IsObject()(target.prototype, "triggerConfig");
  IsOptional()(target.prototype, "condition");
  IsObject()(target.prototype, "condition");
  IsOptional()(target.prototype, "actionConfig");
  IsObject()(target.prototype, "actionConfig");
}

for (const property of ["projectId", "name", "triggerType", "actionType"] as const) {
  IsString()(AutomationCreateDto.prototype, property);
  MinLength(1)(AutomationCreateDto.prototype, property);
}

for (const property of ["name", "triggerType", "actionType"] as const) {
  IsOptional()(AutomationUpdateDto.prototype, property);
  IsString()(AutomationUpdateDto.prototype, property);
  MinLength(1)(AutomationUpdateDto.prototype, property);
}
IsOptional()(AutomationUpdateDto.prototype, "enabled");
IsBoolean()(AutomationUpdateDto.prototype, "enabled");

const routeDescriptors = {
  listAutomations: Object.getOwnPropertyDescriptor(AutomationPublicApiController.prototype, "listAutomations"),
  createAutomation: Object.getOwnPropertyDescriptor(AutomationPublicApiController.prototype, "createAutomation"),
  templates: Object.getOwnPropertyDescriptor(AutomationPublicApiController.prototype, "templates"),
  updateAutomation: Object.getOwnPropertyDescriptor(AutomationPublicApiController.prototype, "updateAutomation"),
  deleteAutomation: Object.getOwnPropertyDescriptor(AutomationPublicApiController.prototype, "deleteAutomation"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("AutomationPublicApiController route descriptors are missing");
}

Controller("api/v1/automations")(AutomationPublicApiController);
ApiTags("automations")(AutomationPublicApiController);

applyGetRoute("listAutomations", "", AutomationListQueryDto, "List project automations");
applyPostRoute("createAutomation", "", AutomationCreateDto, "Create project automation");
Get("templates")(AutomationPublicApiController.prototype, "templates", routeDescriptors.templates!);
Query()(AutomationPublicApiController.prototype, "templates", 0);
ApiOperation({ summary: "List automation templates" })(
  AutomationPublicApiController.prototype,
  "templates",
  routeDescriptors.templates!,
);
ApiOkResponse({ description: "Automation templates" })(
  AutomationPublicApiController.prototype,
  "templates",
  routeDescriptors.templates!,
);
applyPatchRoute("updateAutomation", ":id", AutomationUpdateDto, "Update project automation");
applyDeleteRoute("deleteAutomation", ":id", AutomationContextQueryDto, "Delete project automation");

Module({
  imports: [TypeOrmModule.forFeature(WORK_AUTOMATION_ENTITIES)],
  controllers: [AutomationPublicApiController],
  providers: [
    { provide: AUTOMATION_PUBLIC_API_OPTIONS, useValue: null },
    AutomationStore,
    AutomationPublicApiService,
  ],
  exports: [AutomationPublicApiService],
})(AutomationPublicApiModule);

function applyGetRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  queryType: new () => unknown,
  summary: string,
): void {
  const descriptor = routeDescriptors[method]!;
  Get(path)(AutomationPublicApiController.prototype, method, descriptor);
  Query()(AutomationPublicApiController.prototype, method, 0);
  ApiQuery({ type: queryType })(AutomationPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(AutomationPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(AutomationPublicApiController.prototype, method, descriptor);
}

function applyPostRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  bodyType: new () => unknown,
  summary: string,
): void {
  const descriptor = routeDescriptors[method]!;
  Post(path)(AutomationPublicApiController.prototype, method, descriptor);
  Body()(AutomationPublicApiController.prototype, method, 0);
  ApiOperation({ summary })(AutomationPublicApiController.prototype, method, descriptor);
  ApiBody({ type: bodyType })(AutomationPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(AutomationPublicApiController.prototype, method, descriptor);
}

function applyPatchRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  bodyType: new () => unknown,
  summary: string,
): void {
  const descriptor = routeDescriptors[method]!;
  Patch(path)(AutomationPublicApiController.prototype, method, descriptor);
  Param()(AutomationPublicApiController.prototype, method, 0);
  Body()(AutomationPublicApiController.prototype, method, 1);
  ApiParam({ name: "id" })(AutomationPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(AutomationPublicApiController.prototype, method, descriptor);
  ApiBody({ type: bodyType })(AutomationPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(AutomationPublicApiController.prototype, method, descriptor);
}

function applyDeleteRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  queryType: new () => unknown,
  summary: string,
): void {
  const descriptor = routeDescriptors[method]!;
  Delete(path)(AutomationPublicApiController.prototype, method, descriptor);
  Param()(AutomationPublicApiController.prototype, method, 0);
  Query()(AutomationPublicApiController.prototype, method, 1);
  ApiParam({ name: "id" })(AutomationPublicApiController.prototype, method, descriptor);
  ApiQuery({ type: queryType })(AutomationPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(AutomationPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(AutomationPublicApiController.prototype, method, descriptor);
}
