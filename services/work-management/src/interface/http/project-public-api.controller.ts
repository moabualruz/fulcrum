import "reflect-metadata";

import {
  Body,
  BadRequestException,
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
import { DataSource } from "typeorm";
import type { z } from "zod";

import { isFeatureEnabled } from "@feature-flags/application/env-features.ts";
import { loadDashboard } from "@work-management/application/dashboard/queries.ts";
import {
  ProjectPublicStore,
  type ProjectPublicKind,
} from "@work-management/infrastructure/database/project-public-store.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

import {
  ProjectCreateBodyDto,
  ProjectCreateBodySchema,
  ProjectIdParamsDto,
  ProjectIdParamsSchema,
  ProjectListQueryDto,
  ProjectListQuerySchema,
  ProjectPatchBodyDto,
  ProjectPatchBodySchema,
  ProjectRequestContextDto,
  ProjectRequestContextSchema,
} from "./dto/project.dto.ts";
export {
  ProjectCreateBodyDto,
  ProjectCreateBodySchema,
  ProjectIdParamsDto,
  ProjectIdParamsSchema,
  ProjectListQueryDto,
  ProjectListQuerySchema,
  ProjectPatchBodyDto,
  ProjectPatchBodySchema,
  ProjectRequestContextDto,
  ProjectRequestContextSchema,
};

export const PROJECT_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.projectPublicApi.options");

export interface ProjectPublicApplication {
  listProjects(input: { orgId: string }): Promise<{ data: unknown[] }>;
  createProject?(input: {
    orgId: string;
    kind?: ProjectPublicKind;
    name: string;
    slug?: string;
    description?: string | null;
    status?: string;
    ownerId?: string | null;
    traceId?: string;
    repoPath?: string;
    template?: string;
  }): Promise<unknown>;
  getProject?(input: { orgId: string; id: string }): Promise<unknown>;
  patchProject?(input: {
    orgId: string;
    id: string;
    name?: string;
    description?: string | null;
    status?: string;
    ownerId?: string | null;
    memoryConfig?: Record<string, unknown>;
  }): Promise<unknown>;
  deleteProject?(input: { orgId: string; id: string }): Promise<void>;
  projectStats?(input: { orgId: string; id: string }): Promise<unknown>;
  projectOverview?(input: { orgId: string; id: string }): Promise<unknown>;
}

export interface ProjectPublicApiOptions {
  application?: ProjectPublicApplication;
  featuresEnv?: string;
}

export class ProjectPublicApiService {
  constructor(
    private readonly options: ProjectPublicApiOptions | null = null,
    private readonly store: ProjectPublicStore | null = null,
    private readonly dataSource: DataSource | null = null,
  ) {}

  async listProjects(query: ProjectListQueryDto): Promise<{ data: unknown[] }> {
    const parsed = parseProjectInput(ProjectListQuerySchema, query);
    return await this.requireApplication().listProjects({ orgId: parsed.orgId });
  }

  async createProject(body: ProjectCreateBodyDto): Promise<unknown> {
    const parsed = parseProjectInput(ProjectCreateBodySchema, body);
    const application = this.requireMethod("createProject");
    return await application({
      orgId: parsed.orgId,
      kind: parsed.kind,
      name: parsed.name,
      slug: parsed.slug,
      description: parsed.description,
      status: parsed.status,
      ownerId: parsed.ownerId,
      traceId: parsed.traceId,
      repoPath: parsed.repoPath,
      template: parsed.template,
    });
  }

  async getProject(params: ProjectIdParamsDto, query: ProjectRequestContextDto): Promise<unknown> {
    const parsedParams = parseProjectInput(ProjectIdParamsSchema, params);
    const parsedQuery = parseProjectInput(ProjectRequestContextSchema, query);
    const application = this.requireMethod("getProject");
    const result = await application({ orgId: parsedQuery.orgId, id: parsedParams.id });
    if (!result) throw new NotFoundException({ error: "Project not found." });
    return result;
  }

  async patchProject(params: ProjectIdParamsDto, body: ProjectPatchBodyDto): Promise<unknown> {
    const parsedParams = parseProjectInput(ProjectIdParamsSchema, params);
    const parsedBody = parseProjectInput(ProjectPatchBodySchema, body);
    const application = this.requireMethod("patchProject");
    const result = await application({
      orgId: parsedBody.orgId,
      id: parsedParams.id,
      name: parsedBody.name,
      description: parsedBody.description,
      status: parsedBody.status,
      ownerId: parsedBody.ownerId,
      memoryConfig: parsedBody.memory_config,
    });
    if (!result) throw new NotFoundException({ error: "Project not found." });
    return result;
  }

  async deleteProject(params: ProjectIdParamsDto, query: ProjectRequestContextDto): Promise<void> {
    const parsedParams = parseProjectInput(ProjectIdParamsSchema, params);
    const parsedQuery = parseProjectInput(ProjectRequestContextSchema, query);
    const application = this.requireMethod("deleteProject");
    await application({ orgId: parsedQuery.orgId, id: parsedParams.id });
  }

  async projectStats(params: ProjectIdParamsDto, query: ProjectRequestContextDto): Promise<unknown> {
    const parsedParams = parseProjectInput(ProjectIdParamsSchema, params);
    const parsedQuery = parseProjectInput(ProjectRequestContextSchema, query);
    const application = this.requireMethod("projectStats");
    const result = await application({ orgId: parsedQuery.orgId, id: parsedParams.id });
    if (!result) throw new NotFoundException({ error: "Project not found." });
    return result;
  }

  async projectOverview(params: ProjectIdParamsDto, query: ProjectRequestContextDto): Promise<unknown> {
    const parsedParams = parseProjectInput(ProjectIdParamsSchema, params);
    const parsedQuery = parseProjectInput(ProjectRequestContextSchema, query);
    const application = this.requireMethod("projectOverview");
    const result = await application({ orgId: parsedQuery.orgId, id: parsedParams.id });
    if (!result) throw new NotFoundException({ error: "Project not found." });
    return result;
  }

  async dashboard(query: ProjectDashboardQueryDto): Promise<unknown> {
    this.requireApplication();
    const dataSource = this.requireDataSource();
    return await loadDashboard(dataSource.manager, query.orgId, query.projectId ?? query.project_id ?? null);
  }

  private requireApplication(): ProjectPublicApplication {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    const application = this.options?.application;
    if (application) return application;
    if (this.store) {
      return {
        listProjects: (input) => this.store!.listProjects(input),
        createProject: (input) => this.store!.createProject(input),
        getProject: (input) => this.store!.getProject(input),
        patchProject: (input) => this.store!.patchProject(input),
        deleteProject: (input) => this.store!.deleteProject(input),
        projectStats: (input) => this.store!.projectStats(input),
        projectOverview: (input) => this.store!.projectOverview(input),
      };
    }
    throw new InternalServerErrorException("Project public API application facade is not configured.");
  }

  private requireMethod<Name extends keyof ProjectPublicApplication>(
    name: Name,
  ): NonNullable<ProjectPublicApplication[Name]> {
    const method = this.requireApplication()[name];
    if (!method) {
      throw new InternalServerErrorException(`Project public API ${String(name)} facade is not configured.`);
    }
    return method as NonNullable<ProjectPublicApplication[Name]>;
  }

  private requireDataSource(): DataSource {
    if (!this.dataSource) {
      throw new InternalServerErrorException("Project public API data source is not configured.");
    }
    return this.dataSource;
  }
}

export class ProjectDashboardQueryDto extends ProjectRequestContextDto {
  projectId?: string | null;
  project_id?: string | null;
}

export class ProjectPublicApiController {
  constructor(private readonly projects: ProjectPublicApiService) {}

  async listProjects(query: ProjectListQueryDto): Promise<{ data: unknown[] }> {
    return await this.projects.listProjects(query);
  }

  async createProject(body: ProjectCreateBodyDto): Promise<unknown> {
    return await this.projects.createProject(body);
  }

  async getProject(params: ProjectIdParamsDto, query: ProjectRequestContextDto): Promise<unknown> {
    return await this.projects.getProject(params, query);
  }

  async patchProject(params: ProjectIdParamsDto, body: ProjectPatchBodyDto): Promise<unknown> {
    return await this.projects.patchProject(params, body);
  }

  async deleteProject(params: ProjectIdParamsDto, query: ProjectRequestContextDto): Promise<void> {
    await this.projects.deleteProject(params, query);
  }

  async projectStats(params: ProjectIdParamsDto, query: ProjectRequestContextDto): Promise<unknown> {
    return await this.projects.projectStats(params, query);
  }

  async projectOverview(params: ProjectIdParamsDto, query: ProjectRequestContextDto): Promise<unknown> {
    return await this.projects.projectOverview(params, query);
  }

  async dashboard(query: ProjectDashboardQueryDto): Promise<unknown> {
    return await this.projects.dashboard(query);
  }
}

export class ProjectPublicApiModule {
  static register(options: ProjectPublicApiOptions): NestDynamicModule {
    return {
      module: ProjectPublicApiModule,
      imports: [TypeOrmModule.forFeature(FULCRUM_WORKFLOW_SPINE_ENTITIES)],
      controllers: [ProjectPublicApiController],
      providers: [
        { provide: PROJECT_PUBLIC_API_OPTIONS, useValue: options },
        ProjectPublicStore,
        ProjectPublicApiService,
      ],
      exports: [ProjectPublicApiService],
    };
  }
}

Inject(PROJECT_PUBLIC_API_OPTIONS)(ProjectPublicApiService, undefined, 0);
Inject(ProjectPublicStore)(ProjectPublicApiService, undefined, 1);
Inject(DataSource)(ProjectPublicApiService, undefined, 2);
Inject(DataSource)(ProjectPublicStore, undefined, 0);
Inject(ProjectPublicApiService)(ProjectPublicApiController, undefined, 0);

function parseProjectInput<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new BadRequestException({
    error: "Invalid project request.",
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

const listProjectsDescriptor = Object.getOwnPropertyDescriptor(ProjectPublicApiController.prototype, "listProjects");
const createProjectDescriptor = Object.getOwnPropertyDescriptor(ProjectPublicApiController.prototype, "createProject");
const getProjectDescriptor = Object.getOwnPropertyDescriptor(ProjectPublicApiController.prototype, "getProject");
const patchProjectDescriptor = Object.getOwnPropertyDescriptor(ProjectPublicApiController.prototype, "patchProject");
const deleteProjectDescriptor = Object.getOwnPropertyDescriptor(ProjectPublicApiController.prototype, "deleteProject");
const projectStatsDescriptor = Object.getOwnPropertyDescriptor(ProjectPublicApiController.prototype, "projectStats");
const projectOverviewDescriptor = Object.getOwnPropertyDescriptor(ProjectPublicApiController.prototype, "projectOverview");
const dashboardDescriptor = Object.getOwnPropertyDescriptor(ProjectPublicApiController.prototype, "dashboard");

if (
  !listProjectsDescriptor ||
  !createProjectDescriptor ||
  !getProjectDescriptor ||
  !patchProjectDescriptor ||
  !deleteProjectDescriptor ||
  !projectStatsDescriptor ||
  !projectOverviewDescriptor ||
  !dashboardDescriptor
) {
  throw new Error("ProjectPublicApiController route descriptors are missing");
}

Controller("api/v1/projects")(ProjectPublicApiController);
ApiTags("projects")(ProjectPublicApiController);

Get()(ProjectPublicApiController.prototype, "listProjects", listProjectsDescriptor);
Query()(ProjectPublicApiController.prototype, "listProjects", 0);
ApiOperation({ summary: "List projects for a workspace" })(
  ProjectPublicApiController.prototype,
  "listProjects",
  listProjectsDescriptor,
);
ApiOkResponse({ description: "Project list" })(
  ProjectPublicApiController.prototype,
  "listProjects",
  listProjectsDescriptor,
);

Get("dashboard")(ProjectPublicApiController.prototype, "dashboard", dashboardDescriptor);
Query()(ProjectPublicApiController.prototype, "dashboard", 0);
ApiOperation({ summary: "Load workspace dashboard" })(
  ProjectPublicApiController.prototype,
  "dashboard",
  dashboardDescriptor,
);
ApiOkResponse({ description: "Workspace dashboard" })(
  ProjectPublicApiController.prototype,
  "dashboard",
  dashboardDescriptor,
);

Post()(ProjectPublicApiController.prototype, "createProject", createProjectDescriptor);
Body()(ProjectPublicApiController.prototype, "createProject", 0);
ApiOperation({ summary: "Create a project" })(
  ProjectPublicApiController.prototype,
  "createProject",
  createProjectDescriptor,
);
ApiCreatedResponse({ description: "Created project" })(
  ProjectPublicApiController.prototype,
  "createProject",
  createProjectDescriptor,
);

Get(":id")(ProjectPublicApiController.prototype, "getProject", getProjectDescriptor);
Param()(ProjectPublicApiController.prototype, "getProject", 0);
Query()(ProjectPublicApiController.prototype, "getProject", 1);
ApiOperation({ summary: "Get a project by ID" })(
  ProjectPublicApiController.prototype,
  "getProject",
  getProjectDescriptor,
);
ApiParam({ name: "id", required: true })(
  ProjectPublicApiController.prototype,
  "getProject",
  getProjectDescriptor,
);
ApiOkResponse({ description: "Project" })(
  ProjectPublicApiController.prototype,
  "getProject",
  getProjectDescriptor,
);

Patch(":id")(ProjectPublicApiController.prototype, "patchProject", patchProjectDescriptor);
Param()(ProjectPublicApiController.prototype, "patchProject", 0);
Body()(ProjectPublicApiController.prototype, "patchProject", 1);
ApiOperation({ summary: "Update a project" })(
  ProjectPublicApiController.prototype,
  "patchProject",
  patchProjectDescriptor,
);
ApiParam({ name: "id", required: true })(
  ProjectPublicApiController.prototype,
  "patchProject",
  patchProjectDescriptor,
);
ApiOkResponse({ description: "Updated project" })(
  ProjectPublicApiController.prototype,
  "patchProject",
  patchProjectDescriptor,
);

Delete(":id")(ProjectPublicApiController.prototype, "deleteProject", deleteProjectDescriptor);
HttpCode(204)(ProjectPublicApiController.prototype, "deleteProject", deleteProjectDescriptor);
Param()(ProjectPublicApiController.prototype, "deleteProject", 0);
Query()(ProjectPublicApiController.prototype, "deleteProject", 1);
ApiOperation({ summary: "Delete a project" })(
  ProjectPublicApiController.prototype,
  "deleteProject",
  deleteProjectDescriptor,
);
ApiParam({ name: "id", required: true })(
  ProjectPublicApiController.prototype,
  "deleteProject",
  deleteProjectDescriptor,
);
ApiNoContentResponse({ description: "Deleted" })(
  ProjectPublicApiController.prototype,
  "deleteProject",
  deleteProjectDescriptor,
);

Get(":id/stats")(ProjectPublicApiController.prototype, "projectStats", projectStatsDescriptor);
Param()(ProjectPublicApiController.prototype, "projectStats", 0);
Query()(ProjectPublicApiController.prototype, "projectStats", 1);
ApiOperation({ summary: "Get project work stats" })(
  ProjectPublicApiController.prototype,
  "projectStats",
  projectStatsDescriptor,
);
ApiParam({ name: "id", required: true })(
  ProjectPublicApiController.prototype,
  "projectStats",
  projectStatsDescriptor,
);
ApiOkResponse({ description: "Project stats" })(
  ProjectPublicApiController.prototype,
  "projectStats",
  projectStatsDescriptor,
);

Get(":id/overview")(ProjectPublicApiController.prototype, "projectOverview", projectOverviewDescriptor);
Param()(ProjectPublicApiController.prototype, "projectOverview", 0);
Query()(ProjectPublicApiController.prototype, "projectOverview", 1);
ApiOperation({ summary: "Get the project detail read-model" })(
  ProjectPublicApiController.prototype,
  "projectOverview",
  projectOverviewDescriptor,
);
ApiParam({ name: "id", required: true })(
  ProjectPublicApiController.prototype,
  "projectOverview",
  projectOverviewDescriptor,
);
ApiOkResponse({ description: "Project overview" })(
  ProjectPublicApiController.prototype,
  "projectOverview",
  projectOverviewDescriptor,
);

Module({
  imports: [TypeOrmModule.forFeature(FULCRUM_WORKFLOW_SPINE_ENTITIES)],
  controllers: [ProjectPublicApiController],
  providers: [
    { provide: PROJECT_PUBLIC_API_OPTIONS, useValue: null },
    ProjectPublicStore,
    ProjectPublicApiService,
  ],
  exports: [ProjectPublicApiService],
})(ProjectPublicApiModule);
