import "reflect-metadata";

import { BadRequestException, Body, Controller, Delete, Get, Inject, InternalServerErrorException, Module, NotFoundException, Param, Post, Query } from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";
import {
  FULCRUM_TASK_RECURRENCE_ENTITIES,
  type TaskRecurrenceTrigger,
} from "@work-management/infrastructure/database/task-recurrence.entities.ts";
import {
  TaskRecurrenceNotFoundError,
  TaskRecurrenceStore,
  TaskRecurrenceValidationError,
  type TaskRecurrencePublicRow,
} from "@work-management/infrastructure/database/task-recurrence-store.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

import { TaskRecurrenceListQueryDto, TaskRecurrenceCreateDto, TaskRecurrenceDeleteParamsDto, TaskRecurrenceDeleteQueryDto } from "./dto/task-recurrence.dto.ts";
export { TaskRecurrenceListQueryDto, TaskRecurrenceCreateDto, TaskRecurrenceDeleteParamsDto, TaskRecurrenceDeleteQueryDto };

export const TASK_RECURRENCE_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.taskRecurrencePublicApi.options");

export interface TaskRecurrencePublicApiOptions {
  featuresEnv?: string;
}

export class TaskRecurrencePublicApiService {
  constructor(
    private readonly options: TaskRecurrencePublicApiOptions | null = null,
    private readonly store: TaskRecurrenceStore | null = null,
  ) {}

  async list(input: TaskRecurrenceListQueryDto): Promise<TaskRecurrencePublicRow[]> {
    return await this.mapStoreErrors(() => this.requireStore().list(input));
  }

  async create(input: TaskRecurrenceCreateDto): Promise<TaskRecurrencePublicRow> {
    return await this.mapStoreErrors(() => this.requireStore().create(input));
  }

  async delete(params: TaskRecurrenceDeleteParamsDto, input: TaskRecurrenceDeleteQueryDto): Promise<{ ok: true }> {
    await this.mapStoreErrors(async () => {
      if (!(await this.requireStore().delete({ orgId: input.orgId, ruleId: params.ruleId }))) {
        throw new TaskRecurrenceNotFoundError(`Recurrence rule ${params.ruleId} not found.`);
      }
    });
    return { ok: true };
  }

  private async mapStoreErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof TaskRecurrenceNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof TaskRecurrenceValidationError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private requireStore(): TaskRecurrenceStore {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    if (!this.store) {
      throw new InternalServerErrorException("Task recurrence public API TypeORM store is not configured.");
    }
    return this.store;
  }
}

export class TaskRecurrencePublicApiController {
  constructor(private readonly recurrence: TaskRecurrencePublicApiService) {}

  async list(query: TaskRecurrenceListQueryDto): Promise<TaskRecurrencePublicRow[]> {
    return await this.recurrence.list(query);
  }

  async create(body: TaskRecurrenceCreateDto): Promise<TaskRecurrencePublicRow> {
    return await this.recurrence.create(body);
  }

  async delete(params: TaskRecurrenceDeleteParamsDto, query: TaskRecurrenceDeleteQueryDto): Promise<{ ok: true }> {
    return await this.recurrence.delete(params, query);
  }
}

export class TaskRecurrencePublicApiModule {
  static register(options: TaskRecurrencePublicApiOptions): NestDynamicModule {
    return {
      module: TaskRecurrencePublicApiModule,
      imports: [TypeOrmModule.forFeature([
        ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
        ...FULCRUM_TASK_RECURRENCE_ENTITIES,
      ])],
      controllers: [TaskRecurrencePublicApiController],
      providers: [
        { provide: TASK_RECURRENCE_PUBLIC_API_OPTIONS, useValue: options },
        TaskRecurrenceStore,
        TaskRecurrencePublicApiService,
      ],
      exports: [TaskRecurrencePublicApiService],
    };
  }
}

Inject(TASK_RECURRENCE_PUBLIC_API_OPTIONS)(TaskRecurrencePublicApiService, undefined, 0);
Inject(TaskRecurrenceStore)(TaskRecurrencePublicApiService, undefined, 1);
Inject(DataSource)(TaskRecurrenceStore, undefined, 0);
Inject(TaskRecurrencePublicApiService)(TaskRecurrencePublicApiController, undefined, 0);

for (const target of [TaskRecurrenceListQueryDto, TaskRecurrenceCreateDto] as const) {
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
  IsString()(target.prototype, "taskId");
  MinLength(1)(target.prototype, "taskId");
}
IsIn(["schedule", "on_complete"])(TaskRecurrenceCreateDto.prototype, "triggerType");
IsOptional()(TaskRecurrenceCreateDto.prototype, "cronExpression");
IsString()(TaskRecurrenceCreateDto.prototype, "cronExpression");
IsOptional()(TaskRecurrenceCreateDto.prototype, "includeSubtasks");
IsBoolean()(TaskRecurrenceCreateDto.prototype, "includeSubtasks");
for (const key of ["intervalDays", "maxOccurrences"] as const) {
  IsOptional()(TaskRecurrenceCreateDto.prototype, key);
  Type(() => Number)(TaskRecurrenceCreateDto.prototype, key);
  IsNumber()(TaskRecurrenceCreateDto.prototype, key);
  Min(1)(TaskRecurrenceCreateDto.prototype, key);
}
IsOptional()(TaskRecurrenceCreateDto.prototype, "timezone");
IsString()(TaskRecurrenceCreateDto.prototype, "timezone");
IsString()(TaskRecurrenceDeleteParamsDto.prototype, "ruleId");
MinLength(1)(TaskRecurrenceDeleteParamsDto.prototype, "ruleId");
IsString()(TaskRecurrenceDeleteQueryDto.prototype, "orgId");
MinLength(1)(TaskRecurrenceDeleteQueryDto.prototype, "orgId");

const routeDescriptors = {
  list: Object.getOwnPropertyDescriptor(TaskRecurrencePublicApiController.prototype, "list"),
  create: Object.getOwnPropertyDescriptor(TaskRecurrencePublicApiController.prototype, "create"),
  delete: Object.getOwnPropertyDescriptor(TaskRecurrencePublicApiController.prototype, "delete"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("TaskRecurrencePublicApiController route descriptors are missing");
}

const listDescriptor = routeDescriptors.list!;
const createDescriptor = routeDescriptors.create!;
const deleteDescriptor = routeDescriptors.delete!;

Controller("api/v1/recurrence")(TaskRecurrencePublicApiController);
ApiTags("recurrence")(TaskRecurrencePublicApiController);

Get("")(TaskRecurrencePublicApiController.prototype, "list", listDescriptor);
Query()(TaskRecurrencePublicApiController.prototype, "list", 0);
ApiQuery({ type: TaskRecurrenceListQueryDto })(TaskRecurrencePublicApiController.prototype, "list", listDescriptor);
ApiOperation({ summary: "List recurrence rules" })(TaskRecurrencePublicApiController.prototype, "list", listDescriptor);
ApiOkResponse({ description: "Recurrence rules" })(TaskRecurrencePublicApiController.prototype, "list", listDescriptor);

Post("")(TaskRecurrencePublicApiController.prototype, "create", createDescriptor);
Body()(TaskRecurrencePublicApiController.prototype, "create", 0);
ApiBody({ type: TaskRecurrenceCreateDto })(TaskRecurrencePublicApiController.prototype, "create", createDescriptor);
ApiOperation({ summary: "Create recurrence rule" })(TaskRecurrencePublicApiController.prototype, "create", createDescriptor);
ApiOkResponse({ description: "Recurrence rule created" })(TaskRecurrencePublicApiController.prototype, "create", createDescriptor);

Delete(":ruleId")(TaskRecurrencePublicApiController.prototype, "delete", deleteDescriptor);
Param()(TaskRecurrencePublicApiController.prototype, "delete", 0);
Query()(TaskRecurrencePublicApiController.prototype, "delete", 1);
ApiParam({ name: "ruleId" })(TaskRecurrencePublicApiController.prototype, "delete", deleteDescriptor);
ApiQuery({ type: TaskRecurrenceDeleteQueryDto })(TaskRecurrencePublicApiController.prototype, "delete", deleteDescriptor);
ApiOperation({ summary: "Delete recurrence rule" })(TaskRecurrencePublicApiController.prototype, "delete", deleteDescriptor);
ApiOkResponse({ description: "Recurrence rule deleted" })(TaskRecurrencePublicApiController.prototype, "delete", deleteDescriptor);

Module({
  imports: [TypeOrmModule.forFeature([
    ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
    ...FULCRUM_TASK_RECURRENCE_ENTITIES,
  ])],
  controllers: [TaskRecurrencePublicApiController],
  providers: [
    { provide: TASK_RECURRENCE_PUBLIC_API_OPTIONS, useValue: null },
    TaskRecurrenceStore,
    TaskRecurrencePublicApiService,
  ],
  exports: [TaskRecurrencePublicApiService],
})(TaskRecurrencePublicApiModule);
