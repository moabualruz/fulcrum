import "reflect-metadata";

import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

import {
  ExperimentStore,
  experimentStore,
  type AssignmentCounts,
  type Experiment,
  type ExperimentAssignment,
  type MetricsResult,
} from "@feature-flags/application/experiments.ts";
import { isFeatureEnabled } from "@feature-flags/application/env-features.ts";

import {
  FeatureExperimentAssignmentDto,
  FeatureExperimentConversionDto,
  FeatureExperimentCreateDto,
  FeatureExperimentMetricsQueryDto,
  FeatureExperimentParamsDto,
} from "../dto/feature-experiment.dto.ts";
export {
  FeatureExperimentAssignmentDto,
  FeatureExperimentConversionDto,
  FeatureExperimentCreateDto,
  FeatureExperimentMetricsQueryDto,
  FeatureExperimentParamsDto,
};

export const FEATURE_EXPERIMENT_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.featureExperimentPublicApi.options");

export interface FeatureExperimentPublicApiOptions {
  featuresEnv?: string;
  store?: ExperimentStore;
}

export class FeatureExperimentPublicApiService {
  constructor(private readonly options: FeatureExperimentPublicApiOptions | null = null) {}

  list(): Experiment[] {
    return this.requireStore().list();
  }

  create(input: FeatureExperimentCreateDto): Experiment {
    return this.requireStore().create({
      name: input.name,
      description: input.description,
      variants: input.variants,
      rolloutPercent: input.rolloutPercent,
    });
  }

  assignments(params: FeatureExperimentParamsDto): AssignmentCounts {
    this.requireExperiment(params.experimentId);
    return this.requireStore().assignments(params.experimentId);
  }

  assign(params: FeatureExperimentParamsDto, body: FeatureExperimentAssignmentDto): ExperimentAssignment | null {
    this.requireExperiment(params.experimentId);
    return this.requireStore().assign(params.experimentId, body.userId);
  }

  recordConversion(
    params: FeatureExperimentParamsDto,
    body: FeatureExperimentConversionDto,
  ): { ok: true } {
    this.requireExperiment(params.experimentId);
    this.requireStore().recordConversion(params.experimentId, body.userId, body.conversionKind);
    return { ok: true };
  }

  metrics(params: FeatureExperimentParamsDto, query: FeatureExperimentMetricsQueryDto): MetricsResult {
    this.requireExperiment(params.experimentId);
    return this.requireStore().metrics(params.experimentId, query.conversionKind);
  }

  private requireExperiment(experimentId: string): Experiment {
    const experiment = this.requireStore().get(experimentId);
    if (!experiment) throw new NotFoundException({ error: "experiment not found" });
    return experiment;
  }

  private requireStore(): ExperimentStore {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env) || !isFeatureEnabled("experiments", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    return this.options?.store ?? experimentStore;
  }
}

export class FeatureExperimentPublicApiController {
  constructor(private readonly experiments: FeatureExperimentPublicApiService) {}

  async list(): Promise<Experiment[]> {
    return this.experiments.list();
  }

  async create(body: FeatureExperimentCreateDto): Promise<Experiment> {
    return this.experiments.create(body);
  }

  async assignments(params: FeatureExperimentParamsDto): Promise<AssignmentCounts> {
    return this.experiments.assignments(params);
  }

  async assign(
    params: FeatureExperimentParamsDto,
    body: FeatureExperimentAssignmentDto,
  ): Promise<ExperimentAssignment | null> {
    return this.experiments.assign(params, body);
  }

  async recordConversion(
    params: FeatureExperimentParamsDto,
    body: FeatureExperimentConversionDto,
  ): Promise<{ ok: true }> {
    return this.experiments.recordConversion(params, body);
  }

  async metrics(
    params: FeatureExperimentParamsDto,
    query: FeatureExperimentMetricsQueryDto,
  ): Promise<MetricsResult> {
    return this.experiments.metrics(params, query);
  }
}

export class FeatureExperimentPublicApiModule {
  static register(options: FeatureExperimentPublicApiOptions): NestDynamicModule {
    return {
      module: FeatureExperimentPublicApiModule,
      controllers: [FeatureExperimentPublicApiController],
      providers: [
        { provide: FEATURE_EXPERIMENT_PUBLIC_API_OPTIONS, useValue: options },
        FeatureExperimentPublicApiService,
      ],
      exports: [FeatureExperimentPublicApiService],
    };
  }
}

Inject(FEATURE_EXPERIMENT_PUBLIC_API_OPTIONS)(FeatureExperimentPublicApiService, undefined, 0);
Inject(FeatureExperimentPublicApiService)(FeatureExperimentPublicApiController, undefined, 0);

IsString()(FeatureExperimentCreateDto.prototype, "name");
MinLength(1)(FeatureExperimentCreateDto.prototype, "name");
IsOptional()(FeatureExperimentCreateDto.prototype, "description");
IsString()(FeatureExperimentCreateDto.prototype, "description");
IsArray()(FeatureExperimentCreateDto.prototype, "variants");
ArrayMinSize(2)(FeatureExperimentCreateDto.prototype, "variants");
IsString({ each: true })(FeatureExperimentCreateDto.prototype, "variants");
MinLength(1, { each: true })(FeatureExperimentCreateDto.prototype, "variants");
IsOptional()(FeatureExperimentCreateDto.prototype, "rolloutPercent");
IsInt()(FeatureExperimentCreateDto.prototype, "rolloutPercent");
Min(0)(FeatureExperimentCreateDto.prototype, "rolloutPercent");
Max(100)(FeatureExperimentCreateDto.prototype, "rolloutPercent");

IsString()(FeatureExperimentParamsDto.prototype, "experimentId");
MinLength(1)(FeatureExperimentParamsDto.prototype, "experimentId");
IsString()(FeatureExperimentMetricsQueryDto.prototype, "conversionKind");
MinLength(1)(FeatureExperimentMetricsQueryDto.prototype, "conversionKind");
IsString()(FeatureExperimentAssignmentDto.prototype, "userId");
MinLength(1)(FeatureExperimentAssignmentDto.prototype, "userId");
IsString()(FeatureExperimentConversionDto.prototype, "userId");
MinLength(1)(FeatureExperimentConversionDto.prototype, "userId");
IsString()(FeatureExperimentConversionDto.prototype, "conversionKind");
MinLength(1)(FeatureExperimentConversionDto.prototype, "conversionKind");

const listDescriptor = Object.getOwnPropertyDescriptor(FeatureExperimentPublicApiController.prototype, "list");
const createDescriptor = Object.getOwnPropertyDescriptor(FeatureExperimentPublicApiController.prototype, "create");
const assignmentsDescriptor = Object.getOwnPropertyDescriptor(
  FeatureExperimentPublicApiController.prototype,
  "assignments",
);
const assignDescriptor = Object.getOwnPropertyDescriptor(FeatureExperimentPublicApiController.prototype, "assign");
const recordConversionDescriptor = Object.getOwnPropertyDescriptor(
  FeatureExperimentPublicApiController.prototype,
  "recordConversion",
);
const metricsDescriptor = Object.getOwnPropertyDescriptor(FeatureExperimentPublicApiController.prototype, "metrics");

if (
  !listDescriptor ||
  !createDescriptor ||
  !assignmentsDescriptor ||
  !assignDescriptor ||
  !recordConversionDescriptor ||
  !metricsDescriptor
) {
  throw new Error("FeatureExperimentPublicApiController route descriptors are missing");
}

Controller("api/v1/feature-flags/experiments")(FeatureExperimentPublicApiController);
ApiTags("feature-experiments")(FeatureExperimentPublicApiController);

Get()(FeatureExperimentPublicApiController.prototype, "list", listDescriptor);
ApiOperation({ summary: "List feature experiments" })(
  FeatureExperimentPublicApiController.prototype,
  "list",
  listDescriptor,
);
ApiOkResponse({ description: "Feature experiments" })(
  FeatureExperimentPublicApiController.prototype,
  "list",
  listDescriptor,
);

Post()(FeatureExperimentPublicApiController.prototype, "create", createDescriptor);
Body()(FeatureExperimentPublicApiController.prototype, "create", 0);
ApiBody({ type: FeatureExperimentCreateDto })(FeatureExperimentPublicApiController.prototype, "create", createDescriptor);
ApiOperation({ summary: "Create feature experiment" })(
  FeatureExperimentPublicApiController.prototype,
  "create",
  createDescriptor,
);
ApiCreatedResponse({ description: "Created feature experiment" })(
  FeatureExperimentPublicApiController.prototype,
  "create",
  createDescriptor,
);

Get(":experimentId/assignments")(
  FeatureExperimentPublicApiController.prototype,
  "assignments",
  assignmentsDescriptor,
);
Param()(FeatureExperimentPublicApiController.prototype, "assignments", 0);
ApiParam({ name: "experimentId" })(
  FeatureExperimentPublicApiController.prototype,
  "assignments",
  assignmentsDescriptor,
);
ApiOperation({ summary: "Get feature experiment assignments" })(
  FeatureExperimentPublicApiController.prototype,
  "assignments",
  assignmentsDescriptor,
);

Post(":experimentId/assignments")(
  FeatureExperimentPublicApiController.prototype,
  "assign",
  assignDescriptor,
);
Param()(FeatureExperimentPublicApiController.prototype, "assign", 0);
Body()(FeatureExperimentPublicApiController.prototype, "assign", 1);
ApiParam({ name: "experimentId" })(
  FeatureExperimentPublicApiController.prototype,
  "assign",
  assignDescriptor,
);
ApiBody({ type: FeatureExperimentAssignmentDto })(
  FeatureExperimentPublicApiController.prototype,
  "assign",
  assignDescriptor,
);
ApiOperation({ summary: "Enroll user in a feature experiment" })(
  FeatureExperimentPublicApiController.prototype,
  "assign",
  assignDescriptor,
);

Post(":experimentId/conversions")(
  FeatureExperimentPublicApiController.prototype,
  "recordConversion",
  recordConversionDescriptor,
);
Param()(FeatureExperimentPublicApiController.prototype, "recordConversion", 0);
Body()(FeatureExperimentPublicApiController.prototype, "recordConversion", 1);
ApiParam({ name: "experimentId" })(
  FeatureExperimentPublicApiController.prototype,
  "recordConversion",
  recordConversionDescriptor,
);
ApiBody({ type: FeatureExperimentConversionDto })(
  FeatureExperimentPublicApiController.prototype,
  "recordConversion",
  recordConversionDescriptor,
);
ApiOperation({ summary: "Record feature experiment conversion" })(
  FeatureExperimentPublicApiController.prototype,
  "recordConversion",
  recordConversionDescriptor,
);

Get(":experimentId/metrics")(FeatureExperimentPublicApiController.prototype, "metrics", metricsDescriptor);
Param()(FeatureExperimentPublicApiController.prototype, "metrics", 0);
Query()(FeatureExperimentPublicApiController.prototype, "metrics", 1);
ApiParam({ name: "experimentId" })(FeatureExperimentPublicApiController.prototype, "metrics", metricsDescriptor);
ApiOperation({ summary: "Get feature experiment metrics" })(
  FeatureExperimentPublicApiController.prototype,
  "metrics",
  metricsDescriptor,
);

Module({
  controllers: [FeatureExperimentPublicApiController],
  providers: [
    { provide: FEATURE_EXPERIMENT_PUBLIC_API_OPTIONS, useValue: null },
    FeatureExperimentPublicApiService,
  ],
  exports: [FeatureExperimentPublicApiService],
})(FeatureExperimentPublicApiModule);
