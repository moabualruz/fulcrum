import "reflect-metadata";

import { Body, Controller, Delete, Get, HttpCode, Inject, InternalServerErrorException, Module, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { isFeatureEnabled } from "@feature-flags/application/env-features.ts";
import {
  PlanningStructurePublicStore,
  type PlanningIntakePublicRow,
  type PlanningLabelPublicRow,
  type PlanningModulePublicRow,
  type PlanningTaskAssignmentPublicRow,
} from "@work-management/infrastructure/database/planning-structure-public-store.ts";
import { WORK_MANAGEMENT_ENTITIES } from "@work-management/infrastructure/database/work-structure.entities.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export const PLANNING_STRUCTURE_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.planningStructurePublicApi.options");

export const PLANNING_MODULE_STATUSES = ["planned", "active", "completed", "archived"] as const;
export const PLANNING_INTAKE_STATUSES = ["open", "accepted", "declined", "converted"] as const;

export class PlanningStructureScopeDto {
  orgId!: string;
  projectId!: string;
  project_id?: string;
}

export class PlanningStructureIdParamsDto {
  id!: string;
}

export class PlanningStructureTaskParamsDto {
  id!: string;
  taskId!: string;
}

export class PlanningModuleCreateDto extends PlanningStructureScopeDto {
  name!: string;
  status?: (typeof PLANNING_MODULE_STATUSES)[number];
  leadUserId?: string | null;
}

export class PlanningModulePatchDto extends PlanningStructureScopeDto {
  name?: string;
  status?: (typeof PLANNING_MODULE_STATUSES)[number];
  leadUserId?: string | null;
}

export class PlanningLabelCreateDto extends PlanningStructureScopeDto {
  name!: string;
  color?: string;
}

export class PlanningLabelPatchDto extends PlanningStructureScopeDto {
  name?: string;
  color?: string;
}

export class PlanningIntakeCreateDto extends PlanningStructureScopeDto {
  title!: string;
  description?: string | null;
  source?: string;
  taskId?: string | null;
}

export class PlanningIntakePatchDto extends PlanningStructureScopeDto {
  title?: string;
  description?: string | null;
  status?: (typeof PLANNING_INTAKE_STATUSES)[number];
  source?: string;
  taskId?: string | null;
}

export class PlanningTaskAssignmentDto extends PlanningStructureScopeDto {
  taskId!: string;
}

export interface PlanningStructurePublicApiOptions {
  featuresEnv?: string;
}

export class PlanningStructurePublicApiService {
  constructor(
    private readonly options: PlanningStructurePublicApiOptions | null = null,
    private readonly store: PlanningStructurePublicStore | null = null,
  ) {}

  async list(query: PlanningStructureScopeDto): Promise<{
    modules: PlanningModulePublicRow[];
    labels: PlanningLabelPublicRow[];
    intakeRequests: PlanningIntakePublicRow[];
  }> {
    return await this.requireStore().list(scope(query));
  }

  async listModules(query: PlanningStructureScopeDto): Promise<PlanningModulePublicRow[]> {
    // A missing project surfaces as a 404 so web routes can render
    // "Project not found"; an existing project with no modules is an empty list.
    return await this.requireResult(this.requireStore().listModules(scope(query)));
  }

  async getModule(params: PlanningStructureIdParamsDto, query: PlanningStructureScopeDto): Promise<PlanningModulePublicRow> {
    return await this.requireResult(this.requireStore().getModule({ ...scope(query), id: params.id }));
  }

  async listIntake(query: PlanningStructureScopeDto): Promise<PlanningIntakePublicRow[]> {
    return await this.requireResult(this.requireStore().listIntake(scope(query)));
  }

  async getIntake(params: PlanningStructureIdParamsDto, query: PlanningStructureScopeDto): Promise<PlanningIntakePublicRow> {
    return await this.requireResult(this.requireStore().getIntake({ ...scope(query), id: params.id }));
  }

  async createModule(body: PlanningModuleCreateDto): Promise<PlanningModulePublicRow> {
    return await this.requireResult(this.requireStore().createModule({ ...scope(body), ...body }));
  }

  async updateModule(params: PlanningStructureIdParamsDto, body: PlanningModulePatchDto): Promise<PlanningModulePublicRow> {
    return await this.requireResult(this.requireStore().updateModule({ ...scope(body), ...body, id: params.id }));
  }

  async deleteModule(params: PlanningStructureIdParamsDto, query: PlanningStructureScopeDto): Promise<void> {
    await this.requireResult(this.requireStore().deleteModule({ ...scope(query), id: params.id }));
  }

  async addModuleTask(params: PlanningStructureIdParamsDto, body: PlanningTaskAssignmentDto): Promise<PlanningTaskAssignmentPublicRow> {
    return await this.requireResult(this.requireStore().addModuleTask({ ...scope(body), id: params.id, taskId: body.taskId }));
  }

  async removeModuleTask(params: PlanningStructureTaskParamsDto, query: PlanningStructureScopeDto): Promise<PlanningTaskAssignmentPublicRow> {
    return await this.requireResult(this.requireStore().removeModuleTask({ ...scope(query), id: params.id, taskId: params.taskId }));
  }

  async createLabel(body: PlanningLabelCreateDto): Promise<PlanningLabelPublicRow> {
    return await this.requireResult(this.requireStore().createLabel({ ...scope(body), ...body }));
  }

  async updateLabel(params: PlanningStructureIdParamsDto, body: PlanningLabelPatchDto): Promise<PlanningLabelPublicRow> {
    return await this.requireResult(this.requireStore().updateLabel({ ...scope(body), ...body, id: params.id }));
  }

  async deleteLabel(params: PlanningStructureIdParamsDto, query: PlanningStructureScopeDto): Promise<void> {
    await this.requireResult(this.requireStore().deleteLabel({ ...scope(query), id: params.id }));
  }

  async addLabelTask(params: PlanningStructureIdParamsDto, body: PlanningTaskAssignmentDto): Promise<PlanningTaskAssignmentPublicRow> {
    return await this.requireResult(this.requireStore().addLabelTask({ ...scope(body), id: params.id, taskId: body.taskId }));
  }

  async removeLabelTask(params: PlanningStructureTaskParamsDto, query: PlanningStructureScopeDto): Promise<PlanningTaskAssignmentPublicRow> {
    return await this.requireResult(this.requireStore().removeLabelTask({ ...scope(query), id: params.id, taskId: params.taskId }));
  }

  async createIntake(body: PlanningIntakeCreateDto): Promise<PlanningIntakePublicRow> {
    return await this.requireResult(this.requireStore().createIntake({ ...scope(body), ...body }));
  }

  async updateIntake(params: PlanningStructureIdParamsDto, body: PlanningIntakePatchDto): Promise<PlanningIntakePublicRow> {
    return await this.requireResult(this.requireStore().updateIntake({ ...scope(body), ...body, id: params.id }));
  }

  async deleteIntake(params: PlanningStructureIdParamsDto, query: PlanningStructureScopeDto): Promise<void> {
    await this.requireResult(this.requireStore().deleteIntake({ ...scope(query), id: params.id }));
  }

  private requireStore(): PlanningStructurePublicStore {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    if (!this.store) {
      throw new InternalServerErrorException("Planning structure public API TypeORM store is not configured.");
    }
    return this.store;
  }

  private async requireResult<T>(promise: Promise<T | null>): Promise<T> {
    const result = await promise;
    if (!result) throw new NotFoundException({ error: "Planning structure target not found." });
    return result;
  }
}

export class PlanningStructurePublicApiController {
  constructor(private readonly structures: PlanningStructurePublicApiService) {}

  async list(query: PlanningStructureScopeDto) {
    return await this.structures.list(query);
  }

  async listModules(query: PlanningStructureScopeDto) {
    return await this.structures.listModules(query);
  }

  async getModule(params: PlanningStructureIdParamsDto, query: PlanningStructureScopeDto) {
    return await this.structures.getModule(params, query);
  }

  async listIntake(query: PlanningStructureScopeDto) {
    return await this.structures.listIntake(query);
  }

  async getIntake(params: PlanningStructureIdParamsDto, query: PlanningStructureScopeDto) {
    return await this.structures.getIntake(params, query);
  }

  async createModule(body: PlanningModuleCreateDto) {
    return await this.structures.createModule(body);
  }

  async updateModule(params: PlanningStructureIdParamsDto, body: PlanningModulePatchDto) {
    return await this.structures.updateModule(params, body);
  }

  async deleteModule(params: PlanningStructureIdParamsDto, query: PlanningStructureScopeDto): Promise<void> {
    await this.structures.deleteModule(params, query);
  }

  async addModuleTask(params: PlanningStructureIdParamsDto, body: PlanningTaskAssignmentDto) {
    return await this.structures.addModuleTask(params, body);
  }

  async removeModuleTask(params: PlanningStructureTaskParamsDto, query: PlanningStructureScopeDto) {
    return await this.structures.removeModuleTask(params, query);
  }

  async createLabel(body: PlanningLabelCreateDto) {
    return await this.structures.createLabel(body);
  }

  async updateLabel(params: PlanningStructureIdParamsDto, body: PlanningLabelPatchDto) {
    return await this.structures.updateLabel(params, body);
  }

  async deleteLabel(params: PlanningStructureIdParamsDto, query: PlanningStructureScopeDto): Promise<void> {
    await this.structures.deleteLabel(params, query);
  }

  async addLabelTask(params: PlanningStructureIdParamsDto, body: PlanningTaskAssignmentDto) {
    return await this.structures.addLabelTask(params, body);
  }

  async removeLabelTask(params: PlanningStructureTaskParamsDto, query: PlanningStructureScopeDto) {
    return await this.structures.removeLabelTask(params, query);
  }

  async createIntake(body: PlanningIntakeCreateDto) {
    return await this.structures.createIntake(body);
  }

  async updateIntake(params: PlanningStructureIdParamsDto, body: PlanningIntakePatchDto) {
    return await this.structures.updateIntake(params, body);
  }

  async deleteIntake(params: PlanningStructureIdParamsDto, query: PlanningStructureScopeDto): Promise<void> {
    await this.structures.deleteIntake(params, query);
  }
}

export class PlanningStructurePublicApiModule {
  static register(options: PlanningStructurePublicApiOptions): NestDynamicModule {
    return {
      module: PlanningStructurePublicApiModule,
      imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...WORK_MANAGEMENT_ENTITIES])],
      controllers: [PlanningStructurePublicApiController],
      providers: [
        { provide: PLANNING_STRUCTURE_PUBLIC_API_OPTIONS, useValue: options },
        PlanningStructurePublicStore,
        PlanningStructurePublicApiService,
      ],
      exports: [PlanningStructurePublicApiService],
    };
  }
}

function scope(input: PlanningStructureScopeDto): { orgId: string; projectId: string } {
  return { orgId: input.orgId, projectId: input.projectId ?? input.project_id ?? "" };
}

Inject(PLANNING_STRUCTURE_PUBLIC_API_OPTIONS)(PlanningStructurePublicApiService, undefined, 0);
Inject(PlanningStructurePublicStore)(PlanningStructurePublicApiService, undefined, 1);
Inject(DataSource)(PlanningStructurePublicStore, undefined, 0);
Inject(PlanningStructurePublicApiService)(PlanningStructurePublicApiController, undefined, 0);

for (const target of [PlanningStructureScopeDto, PlanningModuleCreateDto, PlanningModulePatchDto, PlanningLabelCreateDto, PlanningLabelPatchDto, PlanningIntakeCreateDto, PlanningIntakePatchDto, PlanningTaskAssignmentDto]) {
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
  IsOptional()(target.prototype, "project_id");
  IsString()(target.prototype, "project_id");
  MinLength(1)(target.prototype, "project_id");
  IsOptional()(target.prototype, "projectId");
  IsString()(target.prototype, "projectId");
  MinLength(1)(target.prototype, "projectId");
}
for (const target of [PlanningStructureIdParamsDto, PlanningStructureTaskParamsDto]) {
  IsString()(target.prototype, "id");
  MinLength(1)(target.prototype, "id");
}
IsString()(PlanningStructureTaskParamsDto.prototype, "taskId");
MinLength(1)(PlanningStructureTaskParamsDto.prototype, "taskId");
IsString()(PlanningTaskAssignmentDto.prototype, "taskId");
MinLength(1)(PlanningTaskAssignmentDto.prototype, "taskId");

for (const target of [PlanningModuleCreateDto, PlanningLabelCreateDto]) {
  IsString()(target.prototype, "name");
  MinLength(1)(target.prototype, "name");
}
for (const target of [PlanningModulePatchDto, PlanningLabelPatchDto]) {
  IsOptional()(target.prototype, "name");
  IsString()(target.prototype, "name");
  MinLength(1)(target.prototype, "name");
}
IsOptional()(PlanningModuleCreateDto.prototype, "status");
IsIn(PLANNING_MODULE_STATUSES)(PlanningModuleCreateDto.prototype, "status");
IsOptional()(PlanningModulePatchDto.prototype, "status");
IsIn(PLANNING_MODULE_STATUSES)(PlanningModulePatchDto.prototype, "status");
for (const target of [PlanningModuleCreateDto, PlanningModulePatchDto]) {
  IsOptional()(target.prototype, "leadUserId");
  IsString()(target.prototype, "leadUserId");
}
for (const target of [PlanningLabelCreateDto, PlanningLabelPatchDto]) {
  IsOptional()(target.prototype, "color");
  IsString()(target.prototype, "color");
}
IsString()(PlanningIntakeCreateDto.prototype, "title");
MinLength(1)(PlanningIntakeCreateDto.prototype, "title");
IsOptional()(PlanningIntakePatchDto.prototype, "title");
IsString()(PlanningIntakePatchDto.prototype, "title");
MinLength(1)(PlanningIntakePatchDto.prototype, "title");
for (const target of [PlanningIntakeCreateDto, PlanningIntakePatchDto]) {
  IsOptional()(target.prototype, "description");
  IsString()(target.prototype, "description");
  IsOptional()(target.prototype, "source");
  IsString()(target.prototype, "source");
  IsOptional()(target.prototype, "taskId");
  IsString()(target.prototype, "taskId");
}
IsOptional()(PlanningIntakePatchDto.prototype, "status");
IsIn(PLANNING_INTAKE_STATUSES)(PlanningIntakePatchDto.prototype, "status");

const routeDescriptors = {
  list: Object.getOwnPropertyDescriptor(PlanningStructurePublicApiController.prototype, "list"),
  listModules: Object.getOwnPropertyDescriptor(PlanningStructurePublicApiController.prototype, "listModules"),
  getModule: Object.getOwnPropertyDescriptor(PlanningStructurePublicApiController.prototype, "getModule"),
  listIntake: Object.getOwnPropertyDescriptor(PlanningStructurePublicApiController.prototype, "listIntake"),
  getIntake: Object.getOwnPropertyDescriptor(PlanningStructurePublicApiController.prototype, "getIntake"),
  createModule: Object.getOwnPropertyDescriptor(PlanningStructurePublicApiController.prototype, "createModule"),
  updateModule: Object.getOwnPropertyDescriptor(PlanningStructurePublicApiController.prototype, "updateModule"),
  deleteModule: Object.getOwnPropertyDescriptor(PlanningStructurePublicApiController.prototype, "deleteModule"),
  addModuleTask: Object.getOwnPropertyDescriptor(PlanningStructurePublicApiController.prototype, "addModuleTask"),
  removeModuleTask: Object.getOwnPropertyDescriptor(PlanningStructurePublicApiController.prototype, "removeModuleTask"),
  createLabel: Object.getOwnPropertyDescriptor(PlanningStructurePublicApiController.prototype, "createLabel"),
  updateLabel: Object.getOwnPropertyDescriptor(PlanningStructurePublicApiController.prototype, "updateLabel"),
  deleteLabel: Object.getOwnPropertyDescriptor(PlanningStructurePublicApiController.prototype, "deleteLabel"),
  addLabelTask: Object.getOwnPropertyDescriptor(PlanningStructurePublicApiController.prototype, "addLabelTask"),
  removeLabelTask: Object.getOwnPropertyDescriptor(PlanningStructurePublicApiController.prototype, "removeLabelTask"),
  createIntake: Object.getOwnPropertyDescriptor(PlanningStructurePublicApiController.prototype, "createIntake"),
  updateIntake: Object.getOwnPropertyDescriptor(PlanningStructurePublicApiController.prototype, "updateIntake"),
  deleteIntake: Object.getOwnPropertyDescriptor(PlanningStructurePublicApiController.prototype, "deleteIntake"),
};
if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("PlanningStructurePublicApiController route descriptors are missing");
}

Controller("api/v1/planning-structures")(PlanningStructurePublicApiController);
ApiTags("planning-structures")(PlanningStructurePublicApiController);

Get()(PlanningStructurePublicApiController.prototype, "list", routeDescriptors.list!);
Query()(PlanningStructurePublicApiController.prototype, "list", 0);
ApiOperation({ summary: "List manual planning structures" })(PlanningStructurePublicApiController.prototype, "list", routeDescriptors.list!);
ApiOkResponse({ description: "Planning structures" })(PlanningStructurePublicApiController.prototype, "list", routeDescriptors.list!);

Get("modules")(PlanningStructurePublicApiController.prototype, "listModules", routeDescriptors.listModules!);
Query()(PlanningStructurePublicApiController.prototype, "listModules", 0);
ApiOperation({ summary: "List modules for a project" })(PlanningStructurePublicApiController.prototype, "listModules", routeDescriptors.listModules!);
ApiOkResponse({ description: "Project modules" })(PlanningStructurePublicApiController.prototype, "listModules", routeDescriptors.listModules!);

Get("modules/:id")(PlanningStructurePublicApiController.prototype, "getModule", routeDescriptors.getModule!);
Param()(PlanningStructurePublicApiController.prototype, "getModule", 0);
Query()(PlanningStructurePublicApiController.prototype, "getModule", 1);
ApiOperation({ summary: "Get a module by ID" })(PlanningStructurePublicApiController.prototype, "getModule", routeDescriptors.getModule!);
ApiParam({ name: "id", required: true })(PlanningStructurePublicApiController.prototype, "getModule", routeDescriptors.getModule!);
ApiOkResponse({ description: "Project module" })(PlanningStructurePublicApiController.prototype, "getModule", routeDescriptors.getModule!);

Get("intake")(PlanningStructurePublicApiController.prototype, "listIntake", routeDescriptors.listIntake!);
Query()(PlanningStructurePublicApiController.prototype, "listIntake", 0);
ApiOperation({ summary: "List intake requests for a project" })(PlanningStructurePublicApiController.prototype, "listIntake", routeDescriptors.listIntake!);
ApiOkResponse({ description: "Project intake requests" })(PlanningStructurePublicApiController.prototype, "listIntake", routeDescriptors.listIntake!);

Get("intake/:id")(PlanningStructurePublicApiController.prototype, "getIntake", routeDescriptors.getIntake!);
Param()(PlanningStructurePublicApiController.prototype, "getIntake", 0);
Query()(PlanningStructurePublicApiController.prototype, "getIntake", 1);
ApiOperation({ summary: "Get an intake request by ID" })(PlanningStructurePublicApiController.prototype, "getIntake", routeDescriptors.getIntake!);
ApiParam({ name: "id", required: true })(PlanningStructurePublicApiController.prototype, "getIntake", routeDescriptors.getIntake!);
ApiOkResponse({ description: "Intake request" })(PlanningStructurePublicApiController.prototype, "getIntake", routeDescriptors.getIntake!);

Post("modules")(PlanningStructurePublicApiController.prototype, "createModule", routeDescriptors.createModule!);
Body()(PlanningStructurePublicApiController.prototype, "createModule", 0);
ApiOperation({ summary: "Create a module" })(PlanningStructurePublicApiController.prototype, "createModule", routeDescriptors.createModule!);
ApiCreatedResponse({ description: "Created module" })(PlanningStructurePublicApiController.prototype, "createModule", routeDescriptors.createModule!);

Patch("modules/:id")(PlanningStructurePublicApiController.prototype, "updateModule", routeDescriptors.updateModule!);
Param()(PlanningStructurePublicApiController.prototype, "updateModule", 0);
Body()(PlanningStructurePublicApiController.prototype, "updateModule", 1);
ApiParam({ name: "id", required: true })(PlanningStructurePublicApiController.prototype, "updateModule", routeDescriptors.updateModule!);

Delete("modules/:id")(PlanningStructurePublicApiController.prototype, "deleteModule", routeDescriptors.deleteModule!);
HttpCode(204)(PlanningStructurePublicApiController.prototype, "deleteModule", routeDescriptors.deleteModule!);
Param()(PlanningStructurePublicApiController.prototype, "deleteModule", 0);
Query()(PlanningStructurePublicApiController.prototype, "deleteModule", 1);
ApiNoContentResponse({ description: "Deleted module" })(PlanningStructurePublicApiController.prototype, "deleteModule", routeDescriptors.deleteModule!);

Post("modules/:id/tasks")(PlanningStructurePublicApiController.prototype, "addModuleTask", routeDescriptors.addModuleTask!);
Param()(PlanningStructurePublicApiController.prototype, "addModuleTask", 0);
Body()(PlanningStructurePublicApiController.prototype, "addModuleTask", 1);
ApiOkResponse({ description: "Assigned module task" })(PlanningStructurePublicApiController.prototype, "addModuleTask", routeDescriptors.addModuleTask!);

Delete("modules/:id/tasks/:taskId")(PlanningStructurePublicApiController.prototype, "removeModuleTask", routeDescriptors.removeModuleTask!);
Param()(PlanningStructurePublicApiController.prototype, "removeModuleTask", 0);
Query()(PlanningStructurePublicApiController.prototype, "removeModuleTask", 1);

Post("labels")(PlanningStructurePublicApiController.prototype, "createLabel", routeDescriptors.createLabel!);
Body()(PlanningStructurePublicApiController.prototype, "createLabel", 0);
ApiCreatedResponse({ description: "Created label" })(PlanningStructurePublicApiController.prototype, "createLabel", routeDescriptors.createLabel!);

Patch("labels/:id")(PlanningStructurePublicApiController.prototype, "updateLabel", routeDescriptors.updateLabel!);
Param()(PlanningStructurePublicApiController.prototype, "updateLabel", 0);
Body()(PlanningStructurePublicApiController.prototype, "updateLabel", 1);

Delete("labels/:id")(PlanningStructurePublicApiController.prototype, "deleteLabel", routeDescriptors.deleteLabel!);
HttpCode(204)(PlanningStructurePublicApiController.prototype, "deleteLabel", routeDescriptors.deleteLabel!);
Param()(PlanningStructurePublicApiController.prototype, "deleteLabel", 0);
Query()(PlanningStructurePublicApiController.prototype, "deleteLabel", 1);

Post("labels/:id/tasks")(PlanningStructurePublicApiController.prototype, "addLabelTask", routeDescriptors.addLabelTask!);
Param()(PlanningStructurePublicApiController.prototype, "addLabelTask", 0);
Body()(PlanningStructurePublicApiController.prototype, "addLabelTask", 1);

Delete("labels/:id/tasks/:taskId")(PlanningStructurePublicApiController.prototype, "removeLabelTask", routeDescriptors.removeLabelTask!);
Param()(PlanningStructurePublicApiController.prototype, "removeLabelTask", 0);
Query()(PlanningStructurePublicApiController.prototype, "removeLabelTask", 1);

Post("intake")(PlanningStructurePublicApiController.prototype, "createIntake", routeDescriptors.createIntake!);
Body()(PlanningStructurePublicApiController.prototype, "createIntake", 0);
ApiCreatedResponse({ description: "Created intake request" })(PlanningStructurePublicApiController.prototype, "createIntake", routeDescriptors.createIntake!);

Patch("intake/:id")(PlanningStructurePublicApiController.prototype, "updateIntake", routeDescriptors.updateIntake!);
Param()(PlanningStructurePublicApiController.prototype, "updateIntake", 0);
Body()(PlanningStructurePublicApiController.prototype, "updateIntake", 1);

Delete("intake/:id")(PlanningStructurePublicApiController.prototype, "deleteIntake", routeDescriptors.deleteIntake!);
HttpCode(204)(PlanningStructurePublicApiController.prototype, "deleteIntake", routeDescriptors.deleteIntake!);
Param()(PlanningStructurePublicApiController.prototype, "deleteIntake", 0);
Query()(PlanningStructurePublicApiController.prototype, "deleteIntake", 1);

Module({
  imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...WORK_MANAGEMENT_ENTITIES])],
  controllers: [PlanningStructurePublicApiController],
  providers: [
    { provide: PLANNING_STRUCTURE_PUBLIC_API_OPTIONS, useValue: null },
    PlanningStructurePublicStore,
    PlanningStructurePublicApiService,
  ],
  exports: [PlanningStructurePublicApiService],
})(PlanningStructurePublicApiModule);
