import "reflect-metadata";

import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
  Res,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsArray, IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { CsvValidationError } from "@work-management/application/tasks/csv.ts";
import { isFeatureEnabled } from "@feature-flags/application/env-features.ts";
import { TaskPublicStore } from "@work-management/infrastructure/database/task-public-store.ts";
import { WORK_MANAGEMENT_ENTITIES } from "@work-management/infrastructure/database/work-structure.entities.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

import { TaskListQueryDto, TaskRequestContextDto, TaskManualWorkbenchQueryDto, TaskIdParamsDto, TaskCreateBodyDto, TaskPatchBodyDto, TaskDependenciesBodyDto, TaskParentBodyDto, TaskCsvExportQueryDto, TaskCsvImportBodyDto, TASK_STATUSES } from "./dto/task.dto.ts";
import type { PublicTaskStatus } from "./dto/task.dto.ts";
export { TaskListQueryDto, TaskRequestContextDto, TaskManualWorkbenchQueryDto, TaskIdParamsDto, TaskCreateBodyDto, TaskPatchBodyDto, TaskDependenciesBodyDto, TaskParentBodyDto, TaskCsvExportQueryDto, TaskCsvImportBodyDto };
export type { PublicTaskStatus };

export const TASK_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.taskPublicApi.options");



export interface TaskPublicApplication {
  listTasks(input: {
    orgId: string;
    userId: string;
    projectId: string | null;
    includeDeleted?: boolean;
  }): Promise<unknown[]>;
  buildManualWorkbench?(input: {
    orgId: string;
    userId: string;
    projectId: string | null;
    traceId?: string;
    viewMode?: "board" | "list" | "table";
    filters?: {
      statuses?: string[];
      stateGroups?: Array<"backlog" | "unstarted" | "started" | "completed" | "cancelled">;
      labels?: string[];
      assigneeIds?: string[];
      cycleIds?: string[];
      moduleIds?: string[];
      taskTypes?: string[];
      priorities?: number[];
      search?: string;
    };
    projectCapabilities?: { estimateEnabled?: boolean };
  }): Promise<unknown>;
  createTask(input: {
    orgId: string;
    userId: string;
    projectId: string | null;
    title: string;
    description: string | null;
    descriptionText?: string;
    tiptapContent?: unknown;
    status?: PublicTaskStatus;
    priority?: number;
    points?: number;
    assigneeId?: string;
    traceId?: string;
  }): Promise<unknown>;
  getTask(input: {
    orgId: string;
    userId: string;
    projectId: string | null;
    id: string;
  }): Promise<unknown>;
  listTaskChildren?(input: {
    orgId: string;
    userId: string;
    projectId: string | null;
    id: string;
  }): Promise<unknown[] | null>;
  patchTask(input: {
    orgId: string;
    userId: string;
    projectId: string | null;
    id: string;
    title?: string;
    description?: string | null;
    descriptionText?: string;
    tiptapContent?: unknown;
    status?: PublicTaskStatus;
    priority?: number;
    points?: number;
    assigneeId?: string;
  }): Promise<unknown>;
  deleteTask(input: {
    orgId: string;
    userId: string;
    projectId: string | null;
    id: string;
  }): Promise<unknown>;
  setTaskDependencies?(input: {
    orgId: string;
    userId: string;
    projectId: string | null;
    id: string;
    blocks?: string[];
    blocked_by?: string[];
  }): Promise<unknown>;
  setTaskParent?(input: {
    orgId: string;
    userId: string;
    projectId: string | null;
    id: string;
    parentId?: string | null;
  }): Promise<unknown>;
}

export interface TaskCsvPublicApplication {
  exportTasks(input: { projectId: string }): Promise<string>;
  importTasks(input: { projectId: string; csv: string; columnMap?: Record<string, string> }): Promise<unknown>;
}

export interface TaskPublicApiOptions {
  application?: TaskPublicApplication;
  csvApplication?: TaskCsvPublicApplication;
  featuresEnv?: string;
}

export interface HeaderWritableResponse {
  setHeader(name: string, value: string): void;
}

export class TaskPublicApiService {
  constructor(
    private readonly options: TaskPublicApiOptions | null = null,
    private readonly store: TaskPublicStore | null = null,
  ) {}

  async listTasks(query: TaskListQueryDto): Promise<unknown[]> {
    const tasks = await this.requireApplication().listTasks({
      orgId: query.orgId,
      userId: query.userId,
      projectId: resolveProjectId(query),
      includeDeleted: parseBoolean(query.include_deleted),
    });
    return Array.isArray(tasks) ? tasks.map(toJsonDates) : [];
  }

  async manualTaskWorkbench(query: TaskManualWorkbenchQueryDto): Promise<unknown> {
    const application = this.requireApplication();
    if (!application.buildManualWorkbench) {
      throw new ForbiddenException({ error: "Feature disabled", code: "FEATURE_DISABLED" });
    }
    return toJsonDates(await application.buildManualWorkbench({
      orgId: query.orgId,
      userId: query.userId,
      projectId: resolveProjectId(query),
      traceId: query.traceId,
      viewMode: query.viewMode,
      filters: {
        statuses: csvQuery(query.statuses),
        stateGroups: taskStateGroupQuery(query.stateGroups),
        labels: csvQuery(query.labels),
        assigneeIds: csvQuery(query.assigneeIds),
        cycleIds: csvQuery(query.cycleIds),
        moduleIds: csvQuery(query.moduleIds),
        taskTypes: csvQuery(query.taskTypes),
        priorities: numberCsvQuery(query.priorities),
        search: query.search,
      },
      projectCapabilities: {
        estimateEnabled: parseBoolean(
          query.projectCapabilitiesEstimateEnabled ?? query.project_capabilities_estimate_enabled,
        ) ?? false,
      },
    }));
  }

  async createTask(body: TaskCreateBodyDto): Promise<{ id: string; traceId?: string }> {
    const task = await this.requireApplication().createTask({
      orgId: body.orgId,
      userId: body.userId,
      projectId: resolveProjectId(body),
      title: body.title,
      description: body.description ?? null,
      descriptionText: body.descriptionText,
      tiptapContent: body.tiptapContent,
      status: body.status,
      priority: body.priority,
      points: body.points,
      assigneeId: body.assigneeId,
      traceId: body.traceId,
    });
    const id = extractId(task);
    if (!id) {
      throw new InternalServerErrorException("Task public API create facade returned no task ID.");
    }
    return { id, traceId: extractTraceId(task) ?? undefined };
  }

  async getTask(params: TaskIdParamsDto, query: TaskRequestContextDto): Promise<unknown> {
    const task = await this.requireApplication().getTask({
      orgId: query.orgId,
      userId: query.userId,
      projectId: resolveProjectId(query),
      id: params.id,
    });
    if (!task) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return toJsonDates(task);
  }

  async listTaskChildren(params: TaskIdParamsDto, query: TaskRequestContextDto): Promise<unknown[]> {
    const application = this.requireApplication();
    if (!application.listTaskChildren) {
      throw new ForbiddenException({ error: "Feature disabled", code: "FEATURE_DISABLED" });
    }
    const children = await application.listTaskChildren({
      orgId: query.orgId,
      userId: query.userId,
      projectId: resolveProjectId(query),
      id: params.id,
    });
    if (!children) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return Array.isArray(children) ? children.map(toJsonDates) : [];
  }

  async patchTask(params: TaskIdParamsDto, body: TaskPatchBodyDto): Promise<{ ok: true }> {
    const patch = taskPatch(body);
    if (Object.keys(patch).length === 0) {
      throw new UnprocessableEntityException({
        error: { code: "VALIDATION_ERROR", message: "At least one task field is required." },
      });
    }
    const task = await this.requireApplication().patchTask({
      orgId: body.orgId,
      userId: body.userId,
      projectId: resolveProjectId(body),
      id: params.id,
      ...patch,
    });
    if (!task) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return { ok: true };
  }

  async deleteTask(params: TaskIdParamsDto, query: TaskRequestContextDto): Promise<void> {
    const task = await this.requireApplication().deleteTask({
      orgId: query.orgId,
      userId: query.userId,
      projectId: resolveProjectId(query),
      id: params.id,
    });
    if (!task) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
  }

  async setTaskDependencies(params: TaskIdParamsDto, body: TaskDependenciesBodyDto): Promise<unknown> {
    const application = this.requireApplication();
    if (!application.setTaskDependencies) {
      throw new ForbiddenException({ error: "Feature disabled", code: "FEATURE_DISABLED" });
    }
    try {
      const task = await application.setTaskDependencies({
        orgId: body.orgId,
        userId: body.userId,
        projectId: resolveProjectId(body),
        id: params.id,
        blocks: normalizeStringList(body.blocks),
        blocked_by: normalizeStringList(body.blocked_by),
      });
      if (!task) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
      return toJsonDates(task);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new UnprocessableEntityException({
        error: {
          code: "VALIDATION_ERROR",
          message: error instanceof Error ? error.message : "Task dependencies were rejected.",
        },
      });
    }
  }

  async setTaskParent(params: TaskIdParamsDto, body: TaskParentBodyDto): Promise<unknown> {
    const application = this.requireApplication();
    if (!application.setTaskParent) {
      throw new ForbiddenException({ error: "Feature disabled", code: "FEATURE_DISABLED" });
    }
    try {
      const task = await application.setTaskParent({
        orgId: body.orgId,
        userId: body.userId,
        projectId: resolveProjectId(body),
        id: params.id,
        parentId: body.parentId ?? null,
      });
      if (!task) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
      return toJsonDates(task);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new UnprocessableEntityException({
        error: {
          code: "VALIDATION_ERROR",
          message: error instanceof Error ? error.message : "Task parent change was rejected.",
        },
      });
    }
  }

  async exportTasksCsv(query: TaskCsvExportQueryDto): Promise<string> {
    this.requireFeature("export-csv");
    return await this.requireCsvApplication().exportTasks({ projectId: query.projectId });
  }

  async importTasksCsv(body: TaskCsvImportBodyDto): Promise<unknown> {
    this.requireFeature("import-csv");
    try {
      return await this.requireCsvApplication().importTasks({
        projectId: body.projectId,
        csv: body.csv,
        columnMap: body.columnMap,
      });
    } catch (error) {
      if (error instanceof CsvValidationError) {
        throw new UnprocessableEntityException({
          error: { code: "VALIDATION_ERROR", columns: error.columns },
        });
      }
      throw error;
    }
  }

  private requireApplication(): TaskPublicApplication {
    this.requirePublicApiFeature();
    const application = this.options?.application;
    if (application) return application;
    if (this.store) {
      return {
        listTasks: (input) => this.store!.listTasks(input),
        buildManualWorkbench: (input) => this.store!.buildManualWorkbench(input),
        createTask: (input) => this.store!.createTask(input),
        getTask: (input) => this.store!.getTask(input),
        listTaskChildren: (input) => this.store!.listTaskChildren(input),
        patchTask: (input) => this.store!.patchTask(input),
        deleteTask: (input) => this.store!.deleteTask(input),
        setTaskDependencies: (input) => this.store!.setTaskDependencies(input),
        setTaskParent: (input) => this.store!.setTaskParent(input),
      };
    }
    throw new InternalServerErrorException("Application-backed REST task route is required.");
  }

  private requireCsvApplication(): TaskCsvPublicApplication {
    this.requirePublicApiFeature();
    const application = this.options?.csvApplication;
    if (application) return application;
    if (this.store) {
      return {
        exportTasks: (input) => this.store!.exportTasks(input),
        importTasks: (input) => this.store!.importTasks(input),
      };
    }
    throw new InternalServerErrorException("Task CSV public API application facade is not configured.");
  }

  private requirePublicApiFeature(): void {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
  }

  private requireFeature(feature: "export-csv" | "import-csv"): void {
    this.requirePublicApiFeature();
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled(feature, env)) {
      throw new ForbiddenException({ error: "Feature disabled", code: "FEATURE_DISABLED" });
    }
  }
}

export class TaskPublicApiController {
  constructor(private readonly tasks: TaskPublicApiService) {}

  async listTasks(query: TaskListQueryDto): Promise<unknown[]> {
    return await this.tasks.listTasks(query);
  }

  async manualTaskWorkbench(query: TaskManualWorkbenchQueryDto): Promise<unknown> {
    return await this.tasks.manualTaskWorkbench(query);
  }

  async createTask(body: TaskCreateBodyDto): Promise<{ id: string; traceId?: string }> {
    return await this.tasks.createTask(body);
  }

  async getTask(params: TaskIdParamsDto, query: TaskRequestContextDto): Promise<unknown> {
    return await this.tasks.getTask(params, query);
  }

  async listTaskChildren(params: TaskIdParamsDto, query: TaskRequestContextDto): Promise<unknown[]> {
    return await this.tasks.listTaskChildren(params, query);
  }

  async patchTask(params: TaskIdParamsDto, body: TaskPatchBodyDto): Promise<{ ok: true }> {
    return await this.tasks.patchTask(params, body);
  }

  async deleteTask(params: TaskIdParamsDto, query: TaskRequestContextDto): Promise<void> {
    await this.tasks.deleteTask(params, query);
  }

  async setTaskDependencies(params: TaskIdParamsDto, body: TaskDependenciesBodyDto): Promise<unknown> {
    return await this.tasks.setTaskDependencies(params, body);
  }

  async setTaskParent(params: TaskIdParamsDto, body: TaskParentBodyDto): Promise<unknown> {
    return await this.tasks.setTaskParent(params, body);
  }

  async exportTasksCsv(
    query: TaskCsvExportQueryDto,
    response?: HeaderWritableResponse,
  ): Promise<string> {
    const csv = await this.tasks.exportTasksCsv(query);
    response?.setHeader("content-type", "text/csv; charset=utf-8");
    response?.setHeader("content-disposition", 'attachment; filename="tasks.csv"');
    return csv;
  }

  async importTasksCsv(body: TaskCsvImportBodyDto): Promise<unknown> {
    return await this.tasks.importTasksCsv(body);
  }
}

export class TaskPublicApiModule {
  static register(options: TaskPublicApiOptions): NestDynamicModule {
    return {
      module: TaskPublicApiModule,
      imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...WORK_MANAGEMENT_ENTITIES])],
      controllers: [TaskPublicApiController],
      providers: [
        { provide: TASK_PUBLIC_API_OPTIONS, useValue: options },
        TaskPublicStore,
        TaskPublicApiService,
      ],
      exports: [TaskPublicApiService],
    };
  }
}

function resolveProjectId(input: { projectId?: string | null; project_id?: string | null }): string | null {
  return input.projectId ?? input.project_id ?? null;
}

function parseBoolean(value: boolean | string | undefined): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function csvQuery(value: string | undefined): string[] | undefined {
  const values = value?.split(",").map((part) => part.trim()).filter(Boolean);
  return values && values.length > 0 ? values : undefined;
}

function numberCsvQuery(value: string | undefined): number[] | undefined {
  const values = csvQuery(value)?.map((part) => Number.parseInt(part, 10)).filter(Number.isInteger);
  return values && values.length > 0 ? values : undefined;
}

function taskStateGroupQuery(value: string | undefined) {
  return csvQuery(value)?.filter((part): part is "backlog" | "unstarted" | "started" | "completed" | "cancelled" =>
    ["backlog", "unstarted", "started", "completed", "cancelled"].includes(part)
  );
}

function extractId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const id = (value as Record<string, unknown>)["id"];
  return typeof id === "string" && id.length > 0 ? id : null;
}

function extractTraceId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const traceId = (value as Record<string, unknown>)["traceId"];
  return typeof traceId === "string" && traceId.length > 0 ? traceId : null;
}

function toJsonDates(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function taskPatch(body: TaskPatchBodyDto): Partial<TaskPatchBodyDto> {
  const patch: Partial<TaskPatchBodyDto> = {};
  for (const key of [
    "title",
    "description",
    "descriptionText",
    "tiptapContent",
    "status",
    "priority",
    "points",
    "assigneeId",
  ] as const) {
    if (body[key] !== undefined) {
      patch[key] = body[key] as never;
    }
  }
  return patch;
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

Inject(TASK_PUBLIC_API_OPTIONS)(TaskPublicApiService, undefined, 0);
Inject(TaskPublicStore)(TaskPublicApiService, undefined, 1);
Inject(DataSource)(TaskPublicStore, undefined, 0);
Inject(TaskPublicApiService)(TaskPublicApiController, undefined, 0);

for (const property of ["orgId", "userId"] as const) {
  IsUUID()(TaskListQueryDto.prototype, property);
  IsUUID()(TaskManualWorkbenchQueryDto.prototype, property);
  IsUUID()(TaskRequestContextDto.prototype, property);
  IsUUID()(TaskCreateBodyDto.prototype, property);
  IsUUID()(TaskPatchBodyDto.prototype, property);
  IsUUID()(TaskDependenciesBodyDto.prototype, property);
  IsUUID()(TaskParentBodyDto.prototype, property);
}

for (const dto of [
  TaskListQueryDto,
  TaskManualWorkbenchQueryDto,
  TaskRequestContextDto,
  TaskCreateBodyDto,
  TaskPatchBodyDto,
  TaskDependenciesBodyDto,
  TaskParentBodyDto,
] as const) {
  for (const property of ["project_id", "projectId"] as const) {
    IsOptional()(dto.prototype, property);
    IsString()(dto.prototype, property);
    MinLength(1)(dto.prototype, property);
  }
}

IsOptional()(TaskListQueryDto.prototype, "include_deleted");

for (const property of [
  "traceId",
  "statuses",
  "stateGroups",
  "labels",
  "assigneeIds",
  "cycleIds",
  "moduleIds",
  "taskTypes",
  "priorities",
  "search",
] as const) {
  IsOptional()(TaskManualWorkbenchQueryDto.prototype, property);
  IsString()(TaskManualWorkbenchQueryDto.prototype, property);
}
IsOptional()(TaskManualWorkbenchQueryDto.prototype, "viewMode");
IsIn(["board", "list", "table"])(TaskManualWorkbenchQueryDto.prototype, "viewMode");
IsOptional()(TaskManualWorkbenchQueryDto.prototype, "project_capabilities_estimate_enabled");
IsOptional()(TaskManualWorkbenchQueryDto.prototype, "projectCapabilitiesEstimateEnabled");

IsString()(TaskIdParamsDto.prototype, "id");
MinLength(1)(TaskIdParamsDto.prototype, "id");

IsString()(TaskCreateBodyDto.prototype, "title");
MinLength(1)(TaskCreateBodyDto.prototype, "title");
IsOptional()(TaskCreateBodyDto.prototype, "description");
IsString()(TaskCreateBodyDto.prototype, "description");
IsOptional()(TaskCreateBodyDto.prototype, "descriptionText");
IsString()(TaskCreateBodyDto.prototype, "descriptionText");
IsOptional()(TaskCreateBodyDto.prototype, "status");
IsIn(TASK_STATUSES)(TaskCreateBodyDto.prototype, "status");
IsOptional()(TaskCreateBodyDto.prototype, "assigneeId");
IsString()(TaskCreateBodyDto.prototype, "assigneeId");
MinLength(1)(TaskCreateBodyDto.prototype, "assigneeId");
IsOptional()(TaskCreateBodyDto.prototype, "traceId");
IsString()(TaskCreateBodyDto.prototype, "traceId");
MinLength(1)(TaskCreateBodyDto.prototype, "traceId");

for (const property of ["title", "descriptionText", "assigneeId"] as const) {
  IsOptional()(TaskPatchBodyDto.prototype, property);
  IsString()(TaskPatchBodyDto.prototype, property);
  MinLength(1)(TaskPatchBodyDto.prototype, property);
}
IsOptional()(TaskPatchBodyDto.prototype, "description");
IsString()(TaskPatchBodyDto.prototype, "description");
IsOptional()(TaskPatchBodyDto.prototype, "status");
IsIn(TASK_STATUSES)(TaskPatchBodyDto.prototype, "status");

for (const property of ["blocks", "blocked_by"] as const) {
  IsOptional()(TaskDependenciesBodyDto.prototype, property);
  IsArray()(TaskDependenciesBodyDto.prototype, property);
  IsString({ each: true })(TaskDependenciesBodyDto.prototype, property);
  MinLength(1, { each: true })(TaskDependenciesBodyDto.prototype, property);
}

IsOptional()(TaskParentBodyDto.prototype, "parentId");
IsString()(TaskParentBodyDto.prototype, "parentId");
MinLength(1)(TaskParentBodyDto.prototype, "parentId");

IsIn(["tasks"])(TaskCsvExportQueryDto.prototype, "entity");
IsUUID()(TaskCsvExportQueryDto.prototype, "projectId");
IsIn(["tasks"])(TaskCsvImportBodyDto.prototype, "entity");
IsUUID()(TaskCsvImportBodyDto.prototype, "projectId");
IsString()(TaskCsvImportBodyDto.prototype, "csv");
MinLength(1)(TaskCsvImportBodyDto.prototype, "csv");
IsOptional()(TaskCsvImportBodyDto.prototype, "columnMap");

const listTasksDescriptor = Object.getOwnPropertyDescriptor(TaskPublicApiController.prototype, "listTasks");
const manualTaskWorkbenchDescriptor = Object.getOwnPropertyDescriptor(TaskPublicApiController.prototype, "manualTaskWorkbench");
const createTaskDescriptor = Object.getOwnPropertyDescriptor(TaskPublicApiController.prototype, "createTask");
const getTaskDescriptor = Object.getOwnPropertyDescriptor(TaskPublicApiController.prototype, "getTask");
const listTaskChildrenDescriptor = Object.getOwnPropertyDescriptor(TaskPublicApiController.prototype, "listTaskChildren");
const patchTaskDescriptor = Object.getOwnPropertyDescriptor(TaskPublicApiController.prototype, "patchTask");
const deleteTaskDescriptor = Object.getOwnPropertyDescriptor(TaskPublicApiController.prototype, "deleteTask");
const setTaskDependenciesDescriptor = Object.getOwnPropertyDescriptor(TaskPublicApiController.prototype, "setTaskDependencies");
const setTaskParentDescriptor = Object.getOwnPropertyDescriptor(TaskPublicApiController.prototype, "setTaskParent");
const exportTasksCsvDescriptor = Object.getOwnPropertyDescriptor(TaskPublicApiController.prototype, "exportTasksCsv");
const importTasksCsvDescriptor = Object.getOwnPropertyDescriptor(TaskPublicApiController.prototype, "importTasksCsv");

if (
  !listTasksDescriptor ||
  !manualTaskWorkbenchDescriptor ||
  !createTaskDescriptor ||
  !getTaskDescriptor ||
  !listTaskChildrenDescriptor ||
  !patchTaskDescriptor ||
  !deleteTaskDescriptor ||
  !setTaskDependenciesDescriptor ||
  !setTaskParentDescriptor ||
  !exportTasksCsvDescriptor ||
  !importTasksCsvDescriptor
) {
  throw new Error("TaskPublicApiController route descriptors are missing");
}

Controller("api/v1")(TaskPublicApiController);
ApiTags("tasks")(TaskPublicApiController);
ApiForbiddenResponse({ description: "Task public API feature is disabled or caller lacks permission" })(TaskPublicApiController);

Get("tasks")(TaskPublicApiController.prototype, "listTasks", listTasksDescriptor);
Query()(TaskPublicApiController.prototype, "listTasks", 0);
ApiOperation({ summary: "List tasks" })(TaskPublicApiController.prototype, "listTasks", listTasksDescriptor);
ApiOkResponse({ description: "Task list" })(TaskPublicApiController.prototype, "listTasks", listTasksDescriptor);

Get("tasks/manual-workbench")(
  TaskPublicApiController.prototype,
  "manualTaskWorkbench",
  manualTaskWorkbenchDescriptor,
);
Query()(TaskPublicApiController.prototype, "manualTaskWorkbench", 0);
ApiOperation({ summary: "Build manual task workbench" })(
  TaskPublicApiController.prototype,
  "manualTaskWorkbench",
  manualTaskWorkbenchDescriptor,
);
ApiOkResponse({ description: "Manual task workbench" })(
  TaskPublicApiController.prototype,
  "manualTaskWorkbench",
  manualTaskWorkbenchDescriptor,
);

Post("tasks")(TaskPublicApiController.prototype, "createTask", createTaskDescriptor);
Body()(TaskPublicApiController.prototype, "createTask", 0);
ApiOperation({ summary: "Create a task" })(TaskPublicApiController.prototype, "createTask", createTaskDescriptor);
ApiCreatedResponse({ description: "Created task" })(
  TaskPublicApiController.prototype,
  "createTask",
  createTaskDescriptor,
);

Get("tasks/:id")(TaskPublicApiController.prototype, "getTask", getTaskDescriptor);
Param()(TaskPublicApiController.prototype, "getTask", 0);
Query()(TaskPublicApiController.prototype, "getTask", 1);
ApiOperation({ summary: "Get a task by ID" })(TaskPublicApiController.prototype, "getTask", getTaskDescriptor);
ApiParam({ name: "id", required: true })(TaskPublicApiController.prototype, "getTask", getTaskDescriptor);
ApiOkResponse({ description: "Task" })(TaskPublicApiController.prototype, "getTask", getTaskDescriptor);

Get("tasks/:id/children")(
  TaskPublicApiController.prototype,
  "listTaskChildren",
  listTaskChildrenDescriptor,
);
Param()(TaskPublicApiController.prototype, "listTaskChildren", 0);
Query()(TaskPublicApiController.prototype, "listTaskChildren", 1);
ApiOperation({ summary: "List direct child tasks" })(
  TaskPublicApiController.prototype,
  "listTaskChildren",
  listTaskChildrenDescriptor,
);
ApiParam({ name: "id", required: true })(
  TaskPublicApiController.prototype,
  "listTaskChildren",
  listTaskChildrenDescriptor,
);
ApiOkResponse({ description: "Task children" })(
  TaskPublicApiController.prototype,
  "listTaskChildren",
  listTaskChildrenDescriptor,
);

Patch("tasks/:id")(TaskPublicApiController.prototype, "patchTask", patchTaskDescriptor);
Param()(TaskPublicApiController.prototype, "patchTask", 0);
Body()(TaskPublicApiController.prototype, "patchTask", 1);
ApiOperation({ summary: "Update a task" })(TaskPublicApiController.prototype, "patchTask", patchTaskDescriptor);
ApiParam({ name: "id", required: true })(TaskPublicApiController.prototype, "patchTask", patchTaskDescriptor);
ApiOkResponse({ description: "Updated task" })(TaskPublicApiController.prototype, "patchTask", patchTaskDescriptor);

Delete("tasks/:id")(TaskPublicApiController.prototype, "deleteTask", deleteTaskDescriptor);
HttpCode(204)(TaskPublicApiController.prototype, "deleteTask", deleteTaskDescriptor);
Param()(TaskPublicApiController.prototype, "deleteTask", 0);
Query()(TaskPublicApiController.prototype, "deleteTask", 1);
ApiOperation({ summary: "Delete a task" })(TaskPublicApiController.prototype, "deleteTask", deleteTaskDescriptor);
ApiParam({ name: "id", required: true })(TaskPublicApiController.prototype, "deleteTask", deleteTaskDescriptor);
ApiNoContentResponse({ description: "Deleted" })(
  TaskPublicApiController.prototype,
  "deleteTask",
  deleteTaskDescriptor,
);

Patch("tasks/:id/dependencies")(
  TaskPublicApiController.prototype,
  "setTaskDependencies",
  setTaskDependenciesDescriptor,
);
Param()(TaskPublicApiController.prototype, "setTaskDependencies", 0);
Body()(TaskPublicApiController.prototype, "setTaskDependencies", 1);
ApiOperation({ summary: "Replace task dependency edges" })(
  TaskPublicApiController.prototype,
  "setTaskDependencies",
  setTaskDependenciesDescriptor,
);
ApiParam({ name: "id", required: true })(
  TaskPublicApiController.prototype,
  "setTaskDependencies",
  setTaskDependenciesDescriptor,
);
ApiOkResponse({ description: "Updated task dependencies" })(
  TaskPublicApiController.prototype,
  "setTaskDependencies",
  setTaskDependenciesDescriptor,
);

Patch("tasks/:id/parent")(
  TaskPublicApiController.prototype,
  "setTaskParent",
  setTaskParentDescriptor,
);
Param()(TaskPublicApiController.prototype, "setTaskParent", 0);
Body()(TaskPublicApiController.prototype, "setTaskParent", 1);
ApiOperation({ summary: "Replace task parent" })(
  TaskPublicApiController.prototype,
  "setTaskParent",
  setTaskParentDescriptor,
);
ApiParam({ name: "id", required: true })(
  TaskPublicApiController.prototype,
  "setTaskParent",
  setTaskParentDescriptor,
);
ApiOkResponse({ description: "Updated task parent" })(
  TaskPublicApiController.prototype,
  "setTaskParent",
  setTaskParentDescriptor,
);

Get("connectors/export-csv")(TaskPublicApiController.prototype, "exportTasksCsv", exportTasksCsvDescriptor);
Query()(TaskPublicApiController.prototype, "exportTasksCsv", 0);
Res({ passthrough: true })(TaskPublicApiController.prototype, "exportTasksCsv", 1);
ApiOperation({ summary: "Export tasks to CSV" })(
  TaskPublicApiController.prototype,
  "exportTasksCsv",
  exportTasksCsvDescriptor,
);
ApiOkResponse({ description: "Task CSV" })(
  TaskPublicApiController.prototype,
  "exportTasksCsv",
  exportTasksCsvDescriptor,
);

Post("connectors/import-csv")(TaskPublicApiController.prototype, "importTasksCsv", importTasksCsvDescriptor);
Body()(TaskPublicApiController.prototype, "importTasksCsv", 0);
ApiOperation({ summary: "Import tasks from CSV" })(
  TaskPublicApiController.prototype,
  "importTasksCsv",
  importTasksCsvDescriptor,
);
ApiOkResponse({ description: "Import result" })(
  TaskPublicApiController.prototype,
  "importTasksCsv",
  importTasksCsvDescriptor,
);

Module({
  imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...WORK_MANAGEMENT_ENTITIES])],
  controllers: [TaskPublicApiController],
  providers: [
    { provide: TASK_PUBLIC_API_OPTIONS, useValue: null },
    TaskPublicStore,
    TaskPublicApiService,
  ],
  exports: [TaskPublicApiService],
})(TaskPublicApiModule);
