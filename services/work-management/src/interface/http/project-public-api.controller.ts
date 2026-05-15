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
import { IsIn, IsObject, IsOptional, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";
import {
  ProjectPublicStore,
  type ProjectPublicKind,
} from "@work-management/infrastructure/database/project-public-store.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export const PROJECT_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.projectPublicApi.options");

export interface ProjectPublicApplication {
  listProjects(input: { orgId: string }): Promise<{ data: unknown[] }>;
  createProject?(input: {
    orgId: string;
    kind?: ProjectPublicKind;
    name: string;
    slug?: string;
    repoPath?: string;
    template?: string;
  }): Promise<unknown>;
  getProject?(input: { orgId: string; id: string }): Promise<unknown>;
  patchProject?(input: {
    orgId: string;
    id: string;
    name?: string;
    memoryConfig?: Record<string, unknown>;
  }): Promise<unknown>;
  deleteProject?(input: { orgId: string; id: string }): Promise<void>;
  projectStats?(input: { orgId: string; id: string }): Promise<unknown>;
}

export interface ProjectPublicApiOptions {
  application?: ProjectPublicApplication;
  featuresEnv?: string;
}

export class ProjectListQueryDto {
  orgId!: string;
}

export class ProjectRequestContextDto {
  orgId!: string;
}

export class ProjectIdParamsDto {
  id!: string;
}

export class ProjectCreateBodyDto {
  orgId!: string;
  kind?: ProjectPublicKind;
  name!: string;
  slug?: string;
  repoPath?: string;
  template?: string;
}

export class ProjectPatchBodyDto {
  orgId!: string;
  name?: string;
  memory_config?: Record<string, unknown>;
}

export class ProjectPublicApiService {
  constructor(
    private readonly options: ProjectPublicApiOptions | null = null,
    private readonly store: ProjectPublicStore | null = null,
  ) {}

  async listProjects(query: ProjectListQueryDto): Promise<{ data: unknown[] }> {
    return await this.requireApplication().listProjects({ orgId: query.orgId });
  }

  async createProject(body: ProjectCreateBodyDto): Promise<unknown> {
    const application = this.requireMethod("createProject");
    return await application({
      orgId: body.orgId,
      kind: body.kind,
      name: body.name,
      slug: body.slug,
      repoPath: body.repoPath,
      template: body.template,
    });
  }

  async getProject(params: ProjectIdParamsDto, query: ProjectRequestContextDto): Promise<unknown> {
    const application = this.requireMethod("getProject");
    const result = await application({ orgId: query.orgId, id: params.id });
    if (!result) throw new NotFoundException({ error: "Project not found." });
    return result;
  }

  async patchProject(params: ProjectIdParamsDto, body: ProjectPatchBodyDto): Promise<unknown> {
    const application = this.requireMethod("patchProject");
    const result = await application({
      orgId: body.orgId,
      id: params.id,
      name: body.name,
      memoryConfig: body.memory_config,
    });
    if (!result) throw new NotFoundException({ error: "Project not found." });
    return result;
  }

  async deleteProject(params: ProjectIdParamsDto, query: ProjectRequestContextDto): Promise<void> {
    const application = this.requireMethod("deleteProject");
    await application({ orgId: query.orgId, id: params.id });
  }

  async projectStats(params: ProjectIdParamsDto, query: ProjectRequestContextDto): Promise<unknown> {
    const application = this.requireMethod("projectStats");
    const result = await application({ orgId: query.orgId, id: params.id });
    if (!result) throw new NotFoundException({ error: "Project not found." });
    return result;
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
Inject(DataSource)(ProjectPublicStore, undefined, 0);
Inject(ProjectPublicApiService)(ProjectPublicApiController, undefined, 0);

for (const property of ["orgId"] as const) {
  IsString()(ProjectListQueryDto.prototype, property);
  MinLength(1)(ProjectListQueryDto.prototype, property);
  IsString()(ProjectRequestContextDto.prototype, property);
  MinLength(1)(ProjectRequestContextDto.prototype, property);
  IsString()(ProjectCreateBodyDto.prototype, property);
  MinLength(1)(ProjectCreateBodyDto.prototype, property);
  IsString()(ProjectPatchBodyDto.prototype, property);
  MinLength(1)(ProjectPatchBodyDto.prototype, property);
}

IsString()(ProjectIdParamsDto.prototype, "id");
MinLength(1)(ProjectIdParamsDto.prototype, "id");

IsOptional()(ProjectCreateBodyDto.prototype, "kind");
IsIn(["workspace", "project", "subproject"])(ProjectCreateBodyDto.prototype, "kind");
IsString()(ProjectCreateBodyDto.prototype, "name");
MinLength(1)(ProjectCreateBodyDto.prototype, "name");

for (const property of ["slug", "repoPath", "template"] as const) {
  IsOptional()(ProjectCreateBodyDto.prototype, property);
  IsString()(ProjectCreateBodyDto.prototype, property);
  MinLength(1)(ProjectCreateBodyDto.prototype, property);
}

IsOptional()(ProjectPatchBodyDto.prototype, "name");
IsString()(ProjectPatchBodyDto.prototype, "name");
MinLength(1)(ProjectPatchBodyDto.prototype, "name");
IsOptional()(ProjectPatchBodyDto.prototype, "memory_config");
IsObject()(ProjectPatchBodyDto.prototype, "memory_config");

const listProjectsDescriptor = Object.getOwnPropertyDescriptor(ProjectPublicApiController.prototype, "listProjects");
const createProjectDescriptor = Object.getOwnPropertyDescriptor(ProjectPublicApiController.prototype, "createProject");
const getProjectDescriptor = Object.getOwnPropertyDescriptor(ProjectPublicApiController.prototype, "getProject");
const patchProjectDescriptor = Object.getOwnPropertyDescriptor(ProjectPublicApiController.prototype, "patchProject");
const deleteProjectDescriptor = Object.getOwnPropertyDescriptor(ProjectPublicApiController.prototype, "deleteProject");
const projectStatsDescriptor = Object.getOwnPropertyDescriptor(ProjectPublicApiController.prototype, "projectStats");

if (
  !listProjectsDescriptor ||
  !createProjectDescriptor ||
  !getProjectDescriptor ||
  !patchProjectDescriptor ||
  !deleteProjectDescriptor ||
  !projectStatsDescriptor
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
