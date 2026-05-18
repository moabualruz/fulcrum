import "reflect-metadata";

import {
  Controller,
  Get,
  Inject,
  InternalServerErrorException,
  Module,
  NotFoundException,
  Query,
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsOptional, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { isFeatureEnabled } from "@feature-flags/application/env-features.ts";
import { ReportPublicStore } from "@work-management/infrastructure/database/report-public-store.ts";
import { WORK_MANAGEMENT_ENTITIES } from "@work-management/infrastructure/database/work-structure.entities.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

import { ReportBurndownQueryDto, ReportVelocityQueryDto, ReportResponseDto } from "./dto/report.dto.ts";
export { ReportBurndownQueryDto, ReportVelocityQueryDto, ReportResponseDto };

export const REPORT_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.reportPublicApi.options");

export interface ReportPublicApplication {
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
        burndown: (input) => this.store!.burndown(input),
        velocity: (input) => this.store!.velocity(input),
      };
    }
    throw new InternalServerErrorException("Report public API application facade is not configured.");
  }
}

export class ReportPublicApiController {
  constructor(private readonly reports: ReportPublicApiService) {}

  async burndown(query: ReportBurndownQueryDto): Promise<ReportResponseDto> {
    return await this.reports.burndown(query);
  }

  async velocity(query: ReportVelocityQueryDto): Promise<ReportResponseDto> {
    return await this.reports.velocity(query);
  }
}

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

const burndownDescriptor = Object.getOwnPropertyDescriptor(ReportPublicApiController.prototype, "burndown");
const velocityDescriptor = Object.getOwnPropertyDescriptor(ReportPublicApiController.prototype, "velocity");

if (!burndownDescriptor || !velocityDescriptor) {
  throw new Error("ReportPublicApiController route descriptors are missing");
}

Controller("api/v1/reports")(ReportPublicApiController);
ApiTags("reports")(ReportPublicApiController);

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
