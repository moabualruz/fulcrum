import "reflect-metadata";

import {
  Controller,
  Get,
  Inject,
  InternalServerErrorException,
  Module,
  NotFoundException,
  Param,
  Query,
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsOptional, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";
import { z } from "zod";

import { isFeatureEnabled } from "@feature-flags/application/env-features.ts";
import { AppNotFoundError } from "@platform-core/domain/errors.ts";
import { ReportPublicStore } from "@work-management/infrastructure/database/report-public-store.ts";
import { WORK_MANAGEMENT_ENTITIES } from "@work-management/infrastructure/database/work-structure.entities.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import type { ProjectReportsPage } from "@work-management/interface/project-reports.ts";

import { ReportBurndownQueryDto, ReportVelocityQueryDto, ReportResponseDto } from "./dto/report.dto.ts";
export { ReportBurndownQueryDto, ReportVelocityQueryDto, ReportResponseDto };

export const REPORT_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.reportPublicApi.options");

export interface ReportPublicApplication {
  projectPage?(input: { orgId: string; projectId: string; sprintId?: string }): Promise<ProjectReportsPage>;
  burndown(input: { orgId: string; projectId: string; sprintId?: string }): Promise<ReportResponseDto>;
  velocity(input: { orgId: string; projectId: string }): Promise<ReportResponseDto>;
}

export interface ReportPublicApiOptions {
  application?: ReportPublicApplication;
  featuresEnv?: string;
}

export class ReportPublicApiService {
  constructor(
    private readonly options: ReportPublicApiOptions | null = null,
    private readonly store: ReportPublicStore | null = null,
  ) {}

  async projectPage(params: unknown, query: unknown): Promise<ProjectReportsPage> {
    const parsedParams = ReportProjectParamsSchema.parse(params);
    const parsedQuery = ReportProjectPageQuerySchema.parse(query);
    const application = this.requireApplication();
    if (!application.projectPage) {
      throw new InternalServerErrorException("Report project page public API application facade is not configured.");
    }
    try {
      return await application.projectPage({
        orgId: parsedQuery.orgId,
        projectId: parsedParams.projectId,
        sprintId: parsedQuery.sprintId ?? parsedQuery.sprint_id,
      });
    } catch (err) {
      if (err instanceof AppNotFoundError) throw new NotFoundException({ error: err.message });
      throw err;
    }
  }

  async burndown(query: ReportBurndownQueryDto): Promise<ReportResponseDto> {
    return await this.requireApplication().burndown({
      orgId: query.orgId,
      projectId: resolveProjectId(query),
      sprintId: query.sprintId ?? query.sprint_id,
    });
  }

  async velocity(query: ReportVelocityQueryDto): Promise<ReportResponseDto> {
    return await this.requireApplication().velocity({
      orgId: query.orgId,
      projectId: resolveProjectId(query),
    });
  }

  private requireApplication(): ReportPublicApplication {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    const application = this.options?.application;
    if (application) return application;
    if (this.store) {
      return {
        projectPage: (input) => this.store!.projectPage(input),
        burndown: (input) => this.store!.burndown(input),
        velocity: (input) => this.store!.velocity(input),
      };
    }
    throw new InternalServerErrorException("Report public API application facade is not configured.");
  }
}

export class ReportPublicApiController {
  constructor(private readonly reports: ReportPublicApiService) {}

  async projectPage(params: unknown, query: unknown): Promise<ProjectReportsPage> {
    return await this.reports.projectPage(params, query);
  }

  async burndown(query: ReportBurndownQueryDto): Promise<ReportResponseDto> {
    return await this.reports.burndown(query);
  }

  async velocity(query: ReportVelocityQueryDto): Promise<ReportResponseDto> {
    return await this.reports.velocity(query);
  }
}

const ReportProjectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const ReportProjectPageQuerySchema = z.object({
  orgId: z.string().min(1),
  sprint_id: z.string().min(1).optional(),
  sprintId: z.string().min(1).optional(),
});

export class ReportPublicApiModule {
  static register(options: ReportPublicApiOptions): NestDynamicModule {
    return {
      module: ReportPublicApiModule,
      imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...WORK_MANAGEMENT_ENTITIES])],
      controllers: [ReportPublicApiController],
      providers: [
        { provide: REPORT_PUBLIC_API_OPTIONS, useValue: options },
        ReportPublicStore,
        ReportPublicApiService,
      ],
      exports: [ReportPublicApiService],
    };
  }
}

function resolveProjectId(query: ReportBurndownQueryDto | ReportVelocityQueryDto): string {
  return query.projectId ?? query.project_id ?? "";
}

Inject(REPORT_PUBLIC_API_OPTIONS)(ReportPublicApiService, undefined, 0);
Inject(ReportPublicStore)(ReportPublicApiService, undefined, 1);
Inject(DataSource)(ReportPublicStore, undefined, 0);
Inject(ReportPublicApiService)(ReportPublicApiController, undefined, 0);

for (const dto of [ReportBurndownQueryDto, ReportVelocityQueryDto] as const) {
  IsString()(dto.prototype, "orgId");
  MinLength(1)(dto.prototype, "orgId");
  for (const property of ["project_id", "projectId"] as const) {
    IsOptional()(dto.prototype, property);
    IsString()(dto.prototype, property);
    MinLength(1)(dto.prototype, property);
  }
}

for (const property of ["sprint_id", "sprintId"] as const) {
  IsOptional()(ReportBurndownQueryDto.prototype, property);
  IsString()(ReportBurndownQueryDto.prototype, property);
  MinLength(1)(ReportBurndownQueryDto.prototype, property);
}

const projectPageDescriptor = Object.getOwnPropertyDescriptor(ReportPublicApiController.prototype, "projectPage");
const burndownDescriptor = Object.getOwnPropertyDescriptor(ReportPublicApiController.prototype, "burndown");
const velocityDescriptor = Object.getOwnPropertyDescriptor(ReportPublicApiController.prototype, "velocity");

if (!projectPageDescriptor || !burndownDescriptor || !velocityDescriptor) {
  throw new Error("ReportPublicApiController route descriptors are missing");
}

Controller("api/v1/reports")(ReportPublicApiController);
ApiTags("reports")(ReportPublicApiController);

Get("projects/:projectId")(ReportPublicApiController.prototype, "projectPage", projectPageDescriptor);
Param()(ReportPublicApiController.prototype, "projectPage", 0);
Query()(ReportPublicApiController.prototype, "projectPage", 1);
ApiOperation({ summary: "Project reports page data" })(
  ReportPublicApiController.prototype,
  "projectPage",
  projectPageDescriptor,
);
ApiOkResponse({ description: "Project reports page data" })(
  ReportPublicApiController.prototype,
  "projectPage",
  projectPageDescriptor,
);

Get("burndown")(ReportPublicApiController.prototype, "burndown", burndownDescriptor);
Query()(ReportPublicApiController.prototype, "burndown", 0);
ApiOperation({ summary: "Burndown chart data" })(
  ReportPublicApiController.prototype,
  "burndown",
  burndownDescriptor,
);
ApiOkResponse({ type: ReportResponseDto })(
  ReportPublicApiController.prototype,
  "burndown",
  burndownDescriptor,
);

Get("velocity")(ReportPublicApiController.prototype, "velocity", velocityDescriptor);
Query()(ReportPublicApiController.prototype, "velocity", 0);
ApiOperation({ summary: "Sprint velocity report" })(
  ReportPublicApiController.prototype,
  "velocity",
  velocityDescriptor,
);
ApiOkResponse({ type: ReportResponseDto })(
  ReportPublicApiController.prototype,
  "velocity",
  velocityDescriptor,
);

Module({
  imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...WORK_MANAGEMENT_ENTITIES])],
  controllers: [ReportPublicApiController],
  providers: [
    { provide: REPORT_PUBLIC_API_OPTIONS, useValue: null },
    ReportPublicStore,
    ReportPublicApiService,
  ],
  exports: [ReportPublicApiService],
})(ReportPublicApiModule);
