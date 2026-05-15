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
import { IsObject, IsOptional, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";
import {
  TaskTemplateStore,
  type TaskTemplatePublicRow,
} from "@work-management/infrastructure/database/task-template-store.ts";
import { WORK_MANAGEMENT_ENTITIES } from "@work-management/infrastructure/database/work-structure.entities.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export const TEMPLATE_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.templatePublicApi.options");

export interface TemplatePublicApiOptions {
  featuresEnv?: string;
}

export class TemplateListQueryDto {
  orgId!: string;
  userId!: string;
  projectId?: string;
}

export class TemplateIdParamsDto {
  id!: string;
}

export class TemplateCreateDto {
  orgId!: string;
  userId!: string;
  projectId?: string | null;
  name!: string;
  description?: string | null;
  templateData!: Record<string, unknown>;
}

export class TemplateApplyDto {
  orgId!: string;
  userId!: string;
  overrides?: Record<string, unknown>;
}

export class TemplateDefaultDto {
  orgId!: string;
  userId!: string;
  projectId!: string;
}

export class TemplatePublicApiService {
  constructor(
    private readonly options: TemplatePublicApiOptions | null = null,
    private readonly store: TaskTemplateStore | null = null,
  ) {}

  async listTemplates(input: TemplateListQueryDto): Promise<TaskTemplatePublicRow[]> {
    return await this.requireStore().list({
      orgId: input.orgId,
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    });
  }

  async createTemplate(input: TemplateCreateDto): Promise<TaskTemplatePublicRow> {
    return await this.requireResult(this.requireStore().create(input));
  }

  async applyTemplate(params: TemplateIdParamsDto, input: TemplateApplyDto): Promise<Record<string, unknown>> {
    return await this.requireResult(this.requireStore().apply({
      orgId: input.orgId,
      templateId: params.id,
      overrides: input.overrides,
    }));
  }

  async setDefaultTemplate(params: TemplateIdParamsDto, input: TemplateDefaultDto): Promise<{ ok: true }> {
    await this.requireBoolean(this.requireStore().setDefault({
      orgId: input.orgId,
      projectId: input.projectId,
      templateId: params.id,
    }));
    return { ok: true };
  }

  async deleteTemplate(params: TemplateIdParamsDto, input: TemplateListQueryDto): Promise<{ ok: true }> {
    await this.requireBoolean(this.requireStore().delete({ orgId: input.orgId, templateId: params.id }));
    return { ok: true };
  }

  private async requireResult<T>(promise: Promise<T | null>): Promise<T> {
    const result = await promise;
    if (!result) throw new NotFoundException({ error: "Template target not found." });
    return result;
  }

  private async requireBoolean(promise: Promise<boolean>): Promise<void> {
    if (!(await promise)) throw new NotFoundException({ error: "Template target not found." });
  }

  private requireStore(): TaskTemplateStore {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    if (!this.store) {
      throw new InternalServerErrorException("Template public API TypeORM store is not configured.");
    }
    return this.store;
  }
}

export class TemplatePublicApiController {
  constructor(private readonly templates: TemplatePublicApiService) {}

  async listTemplates(query: TemplateListQueryDto): Promise<TaskTemplatePublicRow[]> {
    return await this.templates.listTemplates(query);
  }

  async createTemplate(body: TemplateCreateDto): Promise<TaskTemplatePublicRow> {
    return await this.templates.createTemplate(body);
  }

  async applyTemplate(params: TemplateIdParamsDto, body: TemplateApplyDto): Promise<Record<string, unknown>> {
    return await this.templates.applyTemplate(params, body);
  }

  async setDefaultTemplate(params: TemplateIdParamsDto, body: TemplateDefaultDto): Promise<{ ok: true }> {
    return await this.templates.setDefaultTemplate(params, body);
  }

  async deleteTemplate(params: TemplateIdParamsDto, query: TemplateListQueryDto): Promise<{ ok: true }> {
    return await this.templates.deleteTemplate(params, query);
  }
}

export class TemplatePublicApiModule {
  static register(options: TemplatePublicApiOptions): NestDynamicModule {
    return {
      module: TemplatePublicApiModule,
      imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...WORK_MANAGEMENT_ENTITIES])],
      controllers: [TemplatePublicApiController],
      providers: [
        { provide: TEMPLATE_PUBLIC_API_OPTIONS, useValue: options },
        TaskTemplateStore,
        TemplatePublicApiService,
      ],
      exports: [TemplatePublicApiService],
    };
  }
}

Inject(TEMPLATE_PUBLIC_API_OPTIONS)(TemplatePublicApiService, undefined, 0);
Inject(TaskTemplateStore)(TemplatePublicApiService, undefined, 1);
Inject(DataSource)(TaskTemplateStore, undefined, 0);
Inject(TemplatePublicApiService)(TemplatePublicApiController, undefined, 0);

for (const target of [TemplateListQueryDto, TemplateCreateDto, TemplateApplyDto, TemplateDefaultDto] as const) {
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
  IsString()(target.prototype, "userId");
  MinLength(1)(target.prototype, "userId");
}

IsOptional()(TemplateListQueryDto.prototype, "projectId");
IsString()(TemplateListQueryDto.prototype, "projectId");
IsString()(TemplateIdParamsDto.prototype, "id");
MinLength(1)(TemplateIdParamsDto.prototype, "id");
IsOptional()(TemplateCreateDto.prototype, "projectId");
IsString()(TemplateCreateDto.prototype, "projectId");
IsString()(TemplateCreateDto.prototype, "name");
MinLength(1)(TemplateCreateDto.prototype, "name");
IsOptional()(TemplateCreateDto.prototype, "description");
IsString()(TemplateCreateDto.prototype, "description");
IsObject()(TemplateCreateDto.prototype, "templateData");
IsOptional()(TemplateApplyDto.prototype, "overrides");
IsObject()(TemplateApplyDto.prototype, "overrides");
IsString()(TemplateDefaultDto.prototype, "projectId");
MinLength(1)(TemplateDefaultDto.prototype, "projectId");

const routeDescriptors = {
  listTemplates: Object.getOwnPropertyDescriptor(TemplatePublicApiController.prototype, "listTemplates"),
  createTemplate: Object.getOwnPropertyDescriptor(TemplatePublicApiController.prototype, "createTemplate"),
  applyTemplate: Object.getOwnPropertyDescriptor(TemplatePublicApiController.prototype, "applyTemplate"),
  setDefaultTemplate: Object.getOwnPropertyDescriptor(TemplatePublicApiController.prototype, "setDefaultTemplate"),
  deleteTemplate: Object.getOwnPropertyDescriptor(TemplatePublicApiController.prototype, "deleteTemplate"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("TemplatePublicApiController route descriptors are missing");
}

Controller("api/v1/templates")(TemplatePublicApiController);
ApiTags("templates")(TemplatePublicApiController);

applyGetRoute("listTemplates", "", TemplateListQueryDto, "List task templates");
applyPostRoute("createTemplate", "", TemplateCreateDto, "Create task template");
applyPostRoute("applyTemplate", ":id/apply", TemplateApplyDto, "Apply task template", true);
applyPostRoute("setDefaultTemplate", ":id/default", TemplateDefaultDto, "Set default task template", true);
applyDeleteRoute("deleteTemplate", ":id", TemplateListQueryDto, "Delete task template");

Module({
  imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...WORK_MANAGEMENT_ENTITIES])],
  controllers: [TemplatePublicApiController],
  providers: [
    { provide: TEMPLATE_PUBLIC_API_OPTIONS, useValue: null },
    TaskTemplateStore,
    TemplatePublicApiService,
  ],
  exports: [TemplatePublicApiService],
})(TemplatePublicApiModule);

function applyGetRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  queryType: new () => unknown,
  summary: string,
): void {
  const descriptor = routeDescriptors[method]!;
  Get(path)(TemplatePublicApiController.prototype, method, descriptor);
  Query()(TemplatePublicApiController.prototype, method, 0);
  ApiQuery({ type: queryType })(TemplatePublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(TemplatePublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(TemplatePublicApiController.prototype, method, descriptor);
}

function applyPostRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  bodyType: new () => unknown,
  summary: string,
  hasId = false,
): void {
  const descriptor = routeDescriptors[method]!;
  Post(path)(TemplatePublicApiController.prototype, method, descriptor);
  if (hasId) {
    Param()(TemplatePublicApiController.prototype, method, 0);
    Body()(TemplatePublicApiController.prototype, method, 1);
    ApiParam({ name: "id" })(TemplatePublicApiController.prototype, method, descriptor);
  } else {
    Body()(TemplatePublicApiController.prototype, method, 0);
  }
  ApiOperation({ summary })(TemplatePublicApiController.prototype, method, descriptor);
  ApiBody({ type: bodyType })(TemplatePublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(TemplatePublicApiController.prototype, method, descriptor);
}

function applyDeleteRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  queryType: new () => unknown,
  summary: string,
): void {
  const descriptor = routeDescriptors[method]!;
  Delete(path)(TemplatePublicApiController.prototype, method, descriptor);
  Param()(TemplatePublicApiController.prototype, method, 0);
  Query()(TemplatePublicApiController.prototype, method, 1);
  ApiParam({ name: "id" })(TemplatePublicApiController.prototype, method, descriptor);
  ApiQuery({ type: queryType })(TemplatePublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(TemplatePublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(TemplatePublicApiController.prototype, method, descriptor);
}
