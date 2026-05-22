import "reflect-metadata";

import {
  Body,
  BadRequestException,
  Controller,
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
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import type { z } from "zod";

import { isFeatureEnabled } from "@feature-flags/application/env-features.ts";
import {
  ProjectTimelineStore,
  type ProjectCalendarReadModel,
  type ProjectGanttReadModel,
} from "@work-management/infrastructure/database/project-timeline-store.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

import {
  ProjectTimelineContextDto,
  ProjectTimelineContextSchema,
  ProjectTimelineIdParamsDto,
  ProjectTimelineIdParamsSchema,
  ProjectTimelineRescheduleBodyDto,
  ProjectTimelineRescheduleBodySchema,
} from "./dto/project-timeline.dto.ts";
export {
  ProjectTimelineContextDto,
  ProjectTimelineContextSchema,
  ProjectTimelineIdParamsDto,
  ProjectTimelineIdParamsSchema,
  ProjectTimelineRescheduleBodyDto,
  ProjectTimelineRescheduleBodySchema,
};

export const PROJECT_TIMELINE_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.projectTimelinePublicApi.options");

export interface ProjectTimelineApplication {
  loadCalendar(input: { orgId: string; id: string }): Promise<ProjectCalendarReadModel>;
  loadGantt(input: { orgId: string; id: string }): Promise<ProjectGanttReadModel>;
  reschedule(input: {
    orgId: string;
    id: string;
    taskId: string;
    startDate?: string | null;
    dueDate?: string | null;
  }): Promise<{ ok: true }>;
}

export interface ProjectTimelinePublicApiOptions {
  application?: ProjectTimelineApplication;
  featuresEnv?: string;
}

export class ProjectTimelinePublicApiService {
  constructor(
    private readonly options: ProjectTimelinePublicApiOptions | null = null,
    private readonly store: ProjectTimelineStore | null = null,
  ) {}

  async calendar(
    params: ProjectTimelineIdParamsDto,
    query: ProjectTimelineContextDto,
  ): Promise<ProjectCalendarReadModel> {
    const parsedParams = parseTimelineInput(ProjectTimelineIdParamsSchema, params);
    const parsedQuery = parseTimelineInput(ProjectTimelineContextSchema, query);
    return await this.requireApplication().loadCalendar({ orgId: parsedQuery.orgId, id: parsedParams.id });
  }

  async gantt(
    params: ProjectTimelineIdParamsDto,
    query: ProjectTimelineContextDto,
  ): Promise<ProjectGanttReadModel> {
    const parsedParams = parseTimelineInput(ProjectTimelineIdParamsSchema, params);
    const parsedQuery = parseTimelineInput(ProjectTimelineContextSchema, query);
    return await this.requireApplication().loadGantt({ orgId: parsedQuery.orgId, id: parsedParams.id });
  }

  async reschedule(
    params: ProjectTimelineIdParamsDto,
    body: ProjectTimelineRescheduleBodyDto,
  ): Promise<{ ok: true }> {
    const parsedParams = parseTimelineInput(ProjectTimelineIdParamsSchema, params);
    const parsedBody = parseTimelineInput(ProjectTimelineRescheduleBodySchema, body);
    return await this.requireApplication().reschedule({
      orgId: parsedBody.orgId,
      id: parsedParams.id,
      taskId: parsedBody.taskId,
      startDate: parsedBody.startDate,
      dueDate: parsedBody.dueDate,
    });
  }

  private requireApplication(): ProjectTimelineApplication {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    const application = this.options?.application;
    if (application) return application;
    if (this.store) {
      return {
        loadCalendar: (input) => this.store!.loadCalendar(input),
        loadGantt: (input) => this.store!.loadGantt(input),
        reschedule: (input) => this.store!.reschedule(input),
      };
    }
    throw new InternalServerErrorException("Project timeline public API application facade is not configured.");
  }
}

export class ProjectTimelinePublicApiController {
  constructor(private readonly timeline: ProjectTimelinePublicApiService) {}

  async calendar(
    params: ProjectTimelineIdParamsDto,
    query: ProjectTimelineContextDto,
  ): Promise<ProjectCalendarReadModel> {
    return await this.timeline.calendar(params, query);
  }

  async gantt(
    params: ProjectTimelineIdParamsDto,
    query: ProjectTimelineContextDto,
  ): Promise<ProjectGanttReadModel> {
    return await this.timeline.gantt(params, query);
  }

  async reschedule(
    params: ProjectTimelineIdParamsDto,
    body: ProjectTimelineRescheduleBodyDto,
  ): Promise<{ ok: true }> {
    return await this.timeline.reschedule(params, body);
  }
}

export class ProjectTimelinePublicApiModule {
  static register(options: ProjectTimelinePublicApiOptions): NestDynamicModule {
    return {
      module: ProjectTimelinePublicApiModule,
      imports: [TypeOrmModule.forFeature(FULCRUM_WORKFLOW_SPINE_ENTITIES)],
      controllers: [ProjectTimelinePublicApiController],
      providers: [
        { provide: PROJECT_TIMELINE_PUBLIC_API_OPTIONS, useValue: options },
        ProjectTimelineStore,
        ProjectTimelinePublicApiService,
      ],
      exports: [ProjectTimelinePublicApiService],
    };
  }
}

Inject(PROJECT_TIMELINE_PUBLIC_API_OPTIONS)(ProjectTimelinePublicApiService, undefined, 0);
Inject(ProjectTimelineStore)(ProjectTimelinePublicApiService, undefined, 1);
Inject(DataSource)(ProjectTimelineStore, undefined, 0);
Inject(ProjectTimelinePublicApiService)(ProjectTimelinePublicApiController, undefined, 0);

function parseTimelineInput<Schema extends z.ZodType>(schema: Schema, value: unknown): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new BadRequestException({
    error: "Invalid project timeline request.",
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

const calendarDescriptor = Object.getOwnPropertyDescriptor(
  ProjectTimelinePublicApiController.prototype,
  "calendar",
);
const ganttDescriptor = Object.getOwnPropertyDescriptor(ProjectTimelinePublicApiController.prototype, "gantt");
const rescheduleDescriptor = Object.getOwnPropertyDescriptor(
  ProjectTimelinePublicApiController.prototype,
  "reschedule",
);

if (!calendarDescriptor || !ganttDescriptor || !rescheduleDescriptor) {
  throw new Error("ProjectTimelinePublicApiController route descriptors are missing");
}

// A distinct base path from `ProjectPublicApiModule` ("api/v1/projects") avoids
// route collision: timeline read-models hang off "api/v1/project-timeline/:id".
Controller("api/v1/project-timeline")(ProjectTimelinePublicApiController);
ApiTags("project-timeline")(ProjectTimelinePublicApiController);

Get(":id/calendar")(ProjectTimelinePublicApiController.prototype, "calendar", calendarDescriptor);
Param()(ProjectTimelinePublicApiController.prototype, "calendar", 0);
Query()(ProjectTimelinePublicApiController.prototype, "calendar", 1);
ApiOperation({ summary: "Get the project calendar read-model" })(
  ProjectTimelinePublicApiController.prototype,
  "calendar",
  calendarDescriptor,
);
ApiParam({ name: "id", required: true })(
  ProjectTimelinePublicApiController.prototype,
  "calendar",
  calendarDescriptor,
);
ApiOkResponse({ description: "Project calendar" })(
  ProjectTimelinePublicApiController.prototype,
  "calendar",
  calendarDescriptor,
);

Get(":id/gantt")(ProjectTimelinePublicApiController.prototype, "gantt", ganttDescriptor);
Param()(ProjectTimelinePublicApiController.prototype, "gantt", 0);
Query()(ProjectTimelinePublicApiController.prototype, "gantt", 1);
ApiOperation({ summary: "Get the project gantt read-model" })(
  ProjectTimelinePublicApiController.prototype,
  "gantt",
  ganttDescriptor,
);
ApiParam({ name: "id", required: true })(
  ProjectTimelinePublicApiController.prototype,
  "gantt",
  ganttDescriptor,
);
ApiOkResponse({ description: "Project gantt" })(
  ProjectTimelinePublicApiController.prototype,
  "gantt",
  ganttDescriptor,
);

Post(":id/reschedule")(ProjectTimelinePublicApiController.prototype, "reschedule", rescheduleDescriptor);
Param()(ProjectTimelinePublicApiController.prototype, "reschedule", 0);
Body()(ProjectTimelinePublicApiController.prototype, "reschedule", 1);
ApiOperation({ summary: "Reschedule a project task" })(
  ProjectTimelinePublicApiController.prototype,
  "reschedule",
  rescheduleDescriptor,
);
ApiParam({ name: "id", required: true })(
  ProjectTimelinePublicApiController.prototype,
  "reschedule",
  rescheduleDescriptor,
);
ApiOkResponse({ description: "Rescheduled" })(
  ProjectTimelinePublicApiController.prototype,
  "reschedule",
  rescheduleDescriptor,
);

Module({
  imports: [TypeOrmModule.forFeature(FULCRUM_WORKFLOW_SPINE_ENTITIES)],
  controllers: [ProjectTimelinePublicApiController],
  providers: [
    { provide: PROJECT_TIMELINE_PUBLIC_API_OPTIONS, useValue: null },
    ProjectTimelineStore,
    ProjectTimelinePublicApiService,
  ],
  exports: [ProjectTimelinePublicApiService],
})(ProjectTimelinePublicApiModule);
