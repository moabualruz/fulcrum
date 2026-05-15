import "reflect-metadata";

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";
import { SprintPublicStore } from "@work-management/infrastructure/database/sprint-public-store.ts";
import { WORK_MANAGEMENT_ENTITIES } from "@work-management/infrastructure/database/work-structure.entities.ts";

import { SprintListQueryDto, SprintRequestContextDto, SprintIdParamsDto, SprintCreateBodyDto, SprintPatchBodyDto, SprintTaskParamsDto, SprintTaskBodyDto, SprintListResponseDto, SprintStatus } from "./dto/sprint.dto.ts";
export { SprintListQueryDto, SprintRequestContextDto, SprintIdParamsDto, SprintCreateBodyDto, SprintPatchBodyDto, SprintTaskParamsDto, SprintTaskBodyDto, SprintListResponseDto, SprintStatus };

export const SPRINT_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.sprintPublicApi.options");


export interface SprintPublicApplication {
  listSprints(input: { orgId: string; projectId: string }): Promise<SprintListResponseDto>;
  createSprint?(input: {
    orgId: string;
    projectId?: string;
    name: string;
    status?: SprintStatus;
  }): Promise<unknown>;
  getSprint?(input: { orgId: string; id: string }): Promise<unknown>;
  patchSprint?(input: {
    orgId: string;
    id: string;
    name?: string;
    status?: SprintStatus;
  }): Promise<unknown>;
  deleteSprint?(input: { orgId: string; id: string }): Promise<void>;
  addTask?(input: { orgId: string; id: string; taskId: string }): Promise<unknown>;
  removeTask?(input: { orgId: string; id: string; taskId: string }): Promise<unknown>;
}

export interface SprintPublicApiOptions {
  application?: SprintPublicApplication;
  featuresEnv?: string;
}

export class SprintPublicApiService {
  constructor(
    private readonly options: SprintPublicApiOptions | null = null,
    private readonly store: SprintPublicStore | null = null,
  ) {}

  async listSprints(query: SprintListQueryDto): Promise<SprintListResponseDto> {
    const application = this.requireApplication();
    return await application.listSprints({
      orgId: query.orgId,
      projectId: resolveProjectId(query),
    });
  }

  async createSprint(body: SprintCreateBodyDto): Promise<unknown> {
    const application = this.requireMethod("createSprint");
    return await application({
      orgId: body.orgId,
      projectId: body.projectId,
      name: body.name,
      status: body.status,
    });
  }

  async getSprint(params: SprintIdParamsDto, query: SprintRequestContextDto): Promise<unknown> {
    const application = this.requireMethod("getSprint");
    const result = await application({ orgId: query.orgId, id: params.id });
    if (!result) throw new NotFoundException({ error: "Sprint not found." });
    return result;
  }

  async patchSprint(params: SprintIdParamsDto, body: SprintPatchBodyDto): Promise<unknown> {
    const application = this.requireMethod("patchSprint");
    const result = await application({
      orgId: body.orgId,
      id: params.id,
      name: body.name,
      status: body.status,
    });
    if (!result) throw new NotFoundException({ error: "Sprint not found." });
    return result;
  }

  async deleteSprint(params: SprintIdParamsDto, query: SprintRequestContextDto): Promise<void> {
    const application = this.requireMethod("deleteSprint");
    await application({ orgId: query.orgId, id: params.id });
  }

  async addTask(params: SprintIdParamsDto, body: SprintTaskBodyDto): Promise<unknown> {
    const application = this.requireMethod("addTask");
    const result = await application({ orgId: body.orgId, id: params.id, taskId: body.taskId });
    if (!result) throw new NotFoundException({ error: "Sprint not found." });
    return result;
  }

  async removeTask(params: SprintTaskParamsDto, query: SprintRequestContextDto): Promise<unknown> {
    const application = this.requireMethod("removeTask");
    const result = await application({ orgId: query.orgId, id: params.id, taskId: params.taskId });
    if (!result) throw new NotFoundException({ error: "Sprint task assignment not found." });
    return result;
  }

  private requireApplication(): SprintPublicApplication {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    const application = this.options?.application;
    if (application) return application;
    if (this.store) {
      return {
        listSprints: (input) => this.store!.listSprints(input),
        createSprint: (input) => this.store!.createSprint(input),
        getSprint: (input) => this.store!.getSprint(input),
        patchSprint: (input) => this.store!.patchSprint(input),
        deleteSprint: (input) => this.store!.deleteSprint(input),
        addTask: (input) => this.store!.addTask(input),
        removeTask: (input) => this.store!.removeTask(input),
      };
    }
    throw new InternalServerErrorException("Sprint public API application facade is not configured.");
  }

  private requireMethod<Name extends keyof SprintPublicApplication>(
    name: Name,
  ): NonNullable<SprintPublicApplication[Name]> {
    const method = this.requireApplication()[name];
    if (!method) {
      throw new InternalServerErrorException(`Sprint public API ${String(name)} facade is not configured.`);
    }
    return method as NonNullable<SprintPublicApplication[Name]>;
  }
}

export class SprintPublicApiController {
  constructor(private readonly sprints: SprintPublicApiService) {}

  async listSprints(query: SprintListQueryDto): Promise<SprintListResponseDto> {
    return await this.sprints.listSprints(query);
  }

  async createSprint(body: SprintCreateBodyDto): Promise<unknown> {
    return await this.sprints.createSprint(body);
  }

  async getSprint(params: SprintIdParamsDto, query: SprintRequestContextDto): Promise<unknown> {
    return await this.sprints.getSprint(params, query);
  }

  async patchSprint(params: SprintIdParamsDto, body: SprintPatchBodyDto): Promise<unknown> {
    return await this.sprints.patchSprint(params, body);
  }

  async deleteSprint(params: SprintIdParamsDto, query: SprintRequestContextDto): Promise<void> {
    await this.sprints.deleteSprint(params, query);
  }

  async addTask(params: SprintIdParamsDto, body: SprintTaskBodyDto): Promise<unknown> {
    return await this.sprints.addTask(params, body);
  }

  async removeTask(params: SprintTaskParamsDto, query: SprintRequestContextDto): Promise<unknown> {
    return await this.sprints.removeTask(params, query);
  }
}

export class SprintPublicApiModule {
  static register(options: SprintPublicApiOptions): NestDynamicModule {
    return {
      module: SprintPublicApiModule,
      imports: [TypeOrmModule.forFeature(WORK_MANAGEMENT_ENTITIES)],
      controllers: [SprintPublicApiController],
      providers: [
        { provide: SPRINT_PUBLIC_API_OPTIONS, useValue: options },
        SprintPublicStore,
        SprintPublicApiService,
      ],
      exports: [SprintPublicApiService],
    };
  }
}

function resolveProjectId(query: SprintListQueryDto): string {
  return query.projectId ?? query.project_id ?? "";
}

Inject(SPRINT_PUBLIC_API_OPTIONS)(SprintPublicApiService, undefined, 0);
Inject(SprintPublicStore)(SprintPublicApiService, undefined, 1);
Inject(DataSource)(SprintPublicStore, undefined, 0);
Inject(SprintPublicApiService)(SprintPublicApiController, undefined, 0);

for (const property of ["orgId"] as const) {
  IsString()(SprintListQueryDto.prototype, property);
  MinLength(1)(SprintListQueryDto.prototype, property);
  IsString()(SprintRequestContextDto.prototype, property);
  MinLength(1)(SprintRequestContextDto.prototype, property);
  IsString()(SprintCreateBodyDto.prototype, property);
  MinLength(1)(SprintCreateBodyDto.prototype, property);
  IsString()(SprintPatchBodyDto.prototype, property);
  MinLength(1)(SprintPatchBodyDto.prototype, property);
  IsString()(SprintTaskBodyDto.prototype, property);
  MinLength(1)(SprintTaskBodyDto.prototype, property);
}

for (const property of ["project_id", "projectId"] as const) {
  IsOptional()(SprintListQueryDto.prototype, property);
  IsString()(SprintListQueryDto.prototype, property);
  MinLength(1)(SprintListQueryDto.prototype, property);
}

IsString()(SprintIdParamsDto.prototype, "id");
MinLength(1)(SprintIdParamsDto.prototype, "id");
IsString()(SprintTaskParamsDto.prototype, "id");
MinLength(1)(SprintTaskParamsDto.prototype, "id");
IsString()(SprintTaskParamsDto.prototype, "taskId");
MinLength(1)(SprintTaskParamsDto.prototype, "taskId");

IsOptional()(SprintCreateBodyDto.prototype, "projectId");
IsString()(SprintCreateBodyDto.prototype, "projectId");
MinLength(1)(SprintCreateBodyDto.prototype, "projectId");
IsString()(SprintCreateBodyDto.prototype, "name");
MinLength(1)(SprintCreateBodyDto.prototype, "name");
IsOptional()(SprintCreateBodyDto.prototype, "status");
IsIn(["planning", "active", "completed", "cancelled"])(SprintCreateBodyDto.prototype, "status");

IsOptional()(SprintPatchBodyDto.prototype, "name");
IsString()(SprintPatchBodyDto.prototype, "name");
MinLength(1)(SprintPatchBodyDto.prototype, "name");
IsOptional()(SprintPatchBodyDto.prototype, "status");
IsIn(["planning", "active", "completed", "cancelled"])(SprintPatchBodyDto.prototype, "status");
IsString()(SprintTaskBodyDto.prototype, "taskId");
MinLength(1)(SprintTaskBodyDto.prototype, "taskId");

const listSprintsDescriptor = Object.getOwnPropertyDescriptor(SprintPublicApiController.prototype, "listSprints");
const createSprintDescriptor = Object.getOwnPropertyDescriptor(SprintPublicApiController.prototype, "createSprint");
const getSprintDescriptor = Object.getOwnPropertyDescriptor(SprintPublicApiController.prototype, "getSprint");
const patchSprintDescriptor = Object.getOwnPropertyDescriptor(SprintPublicApiController.prototype, "patchSprint");
const deleteSprintDescriptor = Object.getOwnPropertyDescriptor(SprintPublicApiController.prototype, "deleteSprint");
const addTaskDescriptor = Object.getOwnPropertyDescriptor(SprintPublicApiController.prototype, "addTask");
const removeTaskDescriptor = Object.getOwnPropertyDescriptor(SprintPublicApiController.prototype, "removeTask");

if (
  !listSprintsDescriptor ||
  !createSprintDescriptor ||
  !getSprintDescriptor ||
  !patchSprintDescriptor ||
  !deleteSprintDescriptor ||
  !addTaskDescriptor ||
  !removeTaskDescriptor
) {
  throw new Error("SprintPublicApiController route descriptors are missing");
}

Controller("api/v1/sprints")(SprintPublicApiController);
ApiTags("sprints")(SprintPublicApiController);

Get()(SprintPublicApiController.prototype, "listSprints", listSprintsDescriptor);
Query()(SprintPublicApiController.prototype, "listSprints", 0);
ApiOperation({ summary: "List sprints for a project" })(
  SprintPublicApiController.prototype,
  "listSprints",
  listSprintsDescriptor,
);
ApiOkResponse({ type: SprintListResponseDto })(
  SprintPublicApiController.prototype,
  "listSprints",
  listSprintsDescriptor,
);

Post()(SprintPublicApiController.prototype, "createSprint", createSprintDescriptor);
Body()(SprintPublicApiController.prototype, "createSprint", 0);
ApiOperation({ summary: "Create a sprint" })(
  SprintPublicApiController.prototype,
  "createSprint",
  createSprintDescriptor,
);
ApiCreatedResponse({ description: "Created sprint" })(
  SprintPublicApiController.prototype,
  "createSprint",
  createSprintDescriptor,
);

Get(":id")(SprintPublicApiController.prototype, "getSprint", getSprintDescriptor);
Param()(SprintPublicApiController.prototype, "getSprint", 0);
Query()(SprintPublicApiController.prototype, "getSprint", 1);
ApiOperation({ summary: "Get a sprint by ID" })(
  SprintPublicApiController.prototype,
  "getSprint",
  getSprintDescriptor,
);
ApiParam({ name: "id", required: true })(
  SprintPublicApiController.prototype,
  "getSprint",
  getSprintDescriptor,
);
ApiOkResponse({ description: "Sprint" })(SprintPublicApiController.prototype, "getSprint", getSprintDescriptor);

Patch(":id")(SprintPublicApiController.prototype, "patchSprint", patchSprintDescriptor);
Param()(SprintPublicApiController.prototype, "patchSprint", 0);
Body()(SprintPublicApiController.prototype, "patchSprint", 1);
ApiOperation({ summary: "Update a sprint" })(
  SprintPublicApiController.prototype,
  "patchSprint",
  patchSprintDescriptor,
);
ApiParam({ name: "id", required: true })(
  SprintPublicApiController.prototype,
  "patchSprint",
  patchSprintDescriptor,
);
ApiOkResponse({ description: "Updated sprint" })(
  SprintPublicApiController.prototype,
  "patchSprint",
  patchSprintDescriptor,
);

Delete(":id")(SprintPublicApiController.prototype, "deleteSprint", deleteSprintDescriptor);
HttpCode(204)(SprintPublicApiController.prototype, "deleteSprint", deleteSprintDescriptor);
Param()(SprintPublicApiController.prototype, "deleteSprint", 0);
Query()(SprintPublicApiController.prototype, "deleteSprint", 1);
ApiOperation({ summary: "Delete a sprint" })(
  SprintPublicApiController.prototype,
  "deleteSprint",
  deleteSprintDescriptor,
);
ApiParam({ name: "id", required: true })(
  SprintPublicApiController.prototype,
  "deleteSprint",
  deleteSprintDescriptor,
);
ApiNoContentResponse({ description: "Deleted" })(
  SprintPublicApiController.prototype,
  "deleteSprint",
  deleteSprintDescriptor,
);

Post(":id/tasks")(SprintPublicApiController.prototype, "addTask", addTaskDescriptor);
Param()(SprintPublicApiController.prototype, "addTask", 0);
Body()(SprintPublicApiController.prototype, "addTask", 1);
ApiOperation({ summary: "Add a task to a sprint" })(
  SprintPublicApiController.prototype,
  "addTask",
  addTaskDescriptor,
);
ApiParam({ name: "id", required: true })(
  SprintPublicApiController.prototype,
  "addTask",
  addTaskDescriptor,
);
ApiCreatedResponse({ description: "Sprint task assignment" })(
  SprintPublicApiController.prototype,
  "addTask",
  addTaskDescriptor,
);

Delete(":id/tasks/:taskId")(SprintPublicApiController.prototype, "removeTask", removeTaskDescriptor);
Param()(SprintPublicApiController.prototype, "removeTask", 0);
Query()(SprintPublicApiController.prototype, "removeTask", 1);
ApiOperation({ summary: "Remove a task from a sprint" })(
  SprintPublicApiController.prototype,
  "removeTask",
  removeTaskDescriptor,
);
ApiParam({ name: "id", required: true })(
  SprintPublicApiController.prototype,
  "removeTask",
  removeTaskDescriptor,
);
ApiParam({ name: "taskId", required: true })(
  SprintPublicApiController.prototype,
  "removeTask",
  removeTaskDescriptor,
);
ApiOkResponse({ description: "Removed sprint task assignment" })(
  SprintPublicApiController.prototype,
  "removeTask",
  removeTaskDescriptor,
);

Module({
  imports: [TypeOrmModule.forFeature(WORK_MANAGEMENT_ENTITIES)],
  controllers: [SprintPublicApiController],
  providers: [
    { provide: SPRINT_PUBLIC_API_OPTIONS, useValue: null },
    SprintPublicStore,
    SprintPublicApiService,
  ],
  exports: [SprintPublicApiService],
})(SprintPublicApiModule);
