import "reflect-metadata";

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Module,
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
import { z } from "zod";

import {
  createProjectStatus,
  deleteProjectStatus,
  listProjectStatuses,
  updateProjectStatus,
  type ProjectStatusRow,
} from "@work-management/interface/project-statuses.ts";
import { WORK_MANAGEMENT_ENTITIES } from "@work-management/infrastructure/database/work-structure.entities.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES, FulcrumProjectEntity } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export const PROJECT_STATUS_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.projectStatusPublicApi.options");

const ProjectStatusParamsSchema = z.object({
  id: z.string().min(1),
});

const ProjectStatusIdParamsSchema = ProjectStatusParamsSchema.extend({
  statusId: z.string().min(1),
});

const ProjectStatusQuerySchema = z.object({
  orgId: z.string().min(1),
});

const ProjectStatusCreateBodySchema = ProjectStatusQuerySchema.extend({
  name: z.string().min(1),
  color: z.string().min(1).optional(),
  isFinal: z.boolean().optional(),
});

const ProjectStatusPatchBodySchema = ProjectStatusQuerySchema.extend({
  name: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  sortOrder: z.number().optional(),
  isFinal: z.boolean().optional(),
});

export interface ProjectStatusPublicApiOptions {
  featuresEnv?: string;
}

export class ProjectStatusPublicApiService {
  constructor(
    private readonly options: ProjectStatusPublicApiOptions | null = null,
    private readonly dataSource: DataSource,
  ) {}

  async list(params: unknown, query: unknown): Promise<ProjectStatusRow[]> {
    void this.options;
    const parsedParams = ProjectStatusParamsSchema.parse(params);
    const parsedQuery = ProjectStatusQuerySchema.parse(query);
    const projectId = (await this.resolveProjectId(parsedParams.id, parsedQuery.orgId)) ?? parsedParams.id;
    return await listProjectStatuses(this.dataSource.manager, projectId);
  }

  async create(params: unknown, body: unknown): Promise<{ id: string }> {
    const parsedParams = ProjectStatusParamsSchema.parse(params);
    const parsedBody = ProjectStatusCreateBodySchema.parse(body);
    const projectId = (await this.resolveProjectId(parsedParams.id, parsedBody.orgId)) ?? parsedParams.id;
    return await createProjectStatus(this.dataSource.manager, {
      orgId: parsedBody.orgId,
      projectId,
      name: parsedBody.name,
      color: parsedBody.color,
      isFinal: parsedBody.isFinal,
    });
  }

  /** Resolve a slug-or-UUID project identifier to the canonical UUID. */
  private async resolveProjectId(projectId: string, orgId: string): Promise<string | null> {
    const repo = this.dataSource.getRepository(FulcrumProjectEntity);
    const byId = await repo.findOneBy({ id: projectId, workspaceId: orgId });
    if (byId) return byId.id;
    const bySlug = await repo.findOneBy({ slug: projectId, workspaceId: orgId });
    return bySlug?.id ?? null;
  }

  async update(params: unknown, body: unknown): Promise<{ ok: true }> {
    const parsedParams = ProjectStatusIdParamsSchema.parse(params);
    const parsedBody = ProjectStatusPatchBodySchema.parse(body);
    return await updateProjectStatus(this.dataSource.manager, {
      id: parsedParams.statusId,
      name: parsedBody.name,
      color: parsedBody.color,
      sortOrder: parsedBody.sortOrder,
      isFinal: parsedBody.isFinal,
    });
  }

  async delete(params: unknown, query: unknown): Promise<{ ok: true }> {
    const parsedParams = ProjectStatusIdParamsSchema.parse(params);
    ProjectStatusQuerySchema.parse(query);
    return await deleteProjectStatus(this.dataSource.manager, parsedParams.statusId);
  }
}

export class ProjectStatusPublicApiController {
  constructor(private readonly statuses: ProjectStatusPublicApiService) {}

  async list(params: unknown, query: unknown): Promise<ProjectStatusRow[]> {
    return await this.statuses.list(params, query);
  }

  async create(params: unknown, body: unknown): Promise<{ id: string }> {
    return await this.statuses.create(params, body);
  }

  async update(params: unknown, body: unknown): Promise<{ ok: true }> {
    return await this.statuses.update(params, body);
  }

  async delete(params: unknown, query: unknown): Promise<void> {
    await this.statuses.delete(params, query);
  }
}

export class ProjectStatusPublicApiModule {
  static register(options: ProjectStatusPublicApiOptions): NestDynamicModule {
    return {
      module: ProjectStatusPublicApiModule,
      imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...WORK_MANAGEMENT_ENTITIES])],
      controllers: [ProjectStatusPublicApiController],
      providers: [
        { provide: PROJECT_STATUS_PUBLIC_API_OPTIONS, useValue: options },
        ProjectStatusPublicApiService,
      ],
      exports: [ProjectStatusPublicApiService],
    };
  }
}

Inject(PROJECT_STATUS_PUBLIC_API_OPTIONS)(ProjectStatusPublicApiService, undefined, 0);
Inject(DataSource)(ProjectStatusPublicApiService, undefined, 1);
Inject(ProjectStatusPublicApiService)(ProjectStatusPublicApiController, undefined, 0);

const listDescriptor = Object.getOwnPropertyDescriptor(ProjectStatusPublicApiController.prototype, "list");
const createDescriptor = Object.getOwnPropertyDescriptor(ProjectStatusPublicApiController.prototype, "create");
const updateDescriptor = Object.getOwnPropertyDescriptor(ProjectStatusPublicApiController.prototype, "update");
const deleteDescriptor = Object.getOwnPropertyDescriptor(ProjectStatusPublicApiController.prototype, "delete");

if (!listDescriptor || !createDescriptor || !updateDescriptor || !deleteDescriptor) {
  throw new Error("ProjectStatusPublicApiController route descriptors are missing");
}

Controller("api/v1/projects/:id/statuses")(ProjectStatusPublicApiController);
ApiTags("project-statuses")(ProjectStatusPublicApiController);

Get()(ProjectStatusPublicApiController.prototype, "list", listDescriptor);
Param()(ProjectStatusPublicApiController.prototype, "list", 0);
Query()(ProjectStatusPublicApiController.prototype, "list", 1);
ApiParam({ name: "id", required: true })(ProjectStatusPublicApiController.prototype, "list", listDescriptor);
ApiOperation({ summary: "List project statuses" })(ProjectStatusPublicApiController.prototype, "list", listDescriptor);
ApiOkResponse({ description: "Project statuses" })(ProjectStatusPublicApiController.prototype, "list", listDescriptor);

Post()(ProjectStatusPublicApiController.prototype, "create", createDescriptor);
Param()(ProjectStatusPublicApiController.prototype, "create", 0);
Body()(ProjectStatusPublicApiController.prototype, "create", 1);
ApiParam({ name: "id", required: true })(ProjectStatusPublicApiController.prototype, "create", createDescriptor);
ApiOperation({ summary: "Create a project status" })(ProjectStatusPublicApiController.prototype, "create", createDescriptor);
ApiCreatedResponse({ description: "Created project status" })(ProjectStatusPublicApiController.prototype, "create", createDescriptor);

Patch(":statusId")(ProjectStatusPublicApiController.prototype, "update", updateDescriptor);
Param()(ProjectStatusPublicApiController.prototype, "update", 0);
Body()(ProjectStatusPublicApiController.prototype, "update", 1);
ApiParam({ name: "id", required: true })(ProjectStatusPublicApiController.prototype, "update", updateDescriptor);
ApiParam({ name: "statusId", required: true })(ProjectStatusPublicApiController.prototype, "update", updateDescriptor);
ApiOperation({ summary: "Update a project status" })(ProjectStatusPublicApiController.prototype, "update", updateDescriptor);
ApiOkResponse({ description: "Updated project status" })(ProjectStatusPublicApiController.prototype, "update", updateDescriptor);

Delete(":statusId")(ProjectStatusPublicApiController.prototype, "delete", deleteDescriptor);
HttpCode(204)(ProjectStatusPublicApiController.prototype, "delete", deleteDescriptor);
Param()(ProjectStatusPublicApiController.prototype, "delete", 0);
Query()(ProjectStatusPublicApiController.prototype, "delete", 1);
ApiParam({ name: "id", required: true })(ProjectStatusPublicApiController.prototype, "delete", deleteDescriptor);
ApiParam({ name: "statusId", required: true })(ProjectStatusPublicApiController.prototype, "delete", deleteDescriptor);
ApiOperation({ summary: "Delete a project status" })(ProjectStatusPublicApiController.prototype, "delete", deleteDescriptor);
ApiNoContentResponse({ description: "Project status deleted" })(ProjectStatusPublicApiController.prototype, "delete", deleteDescriptor);

Module({
  imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...WORK_MANAGEMENT_ENTITIES])],
  controllers: [ProjectStatusPublicApiController],
  providers: [
    { provide: PROJECT_STATUS_PUBLIC_API_OPTIONS, useValue: null },
    ProjectStatusPublicApiService,
  ],
  exports: [ProjectStatusPublicApiService],
})(ProjectStatusPublicApiModule);

