import "reflect-metadata";

import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { IsArray, IsObject, IsOptional, IsString, MinLength } from "class-validator";

import {
  WorkflowAcceptanceCycleService,
  type WorkflowAcceptanceCycleInput,
  type WorkflowAcceptanceCycleResult,
} from "@workflow-coordination/application/workflow-acceptance-cycle.ts";
import {
  WorkflowCyclePersistenceService,
  type WorkflowCycleCycleInput,
  type WorkflowCycleTraceSummary,
} from "@workflow-coordination/application/workflow-cycle-persistence.service.ts";

import { WorkflowAcceptanceCycleRequestDto, WorkflowCycleCycleRequestDto, WorkflowCycleTraceParamsDto, WorkflowCyclePersistedResponseDto, WorkflowCycleTraceSummaryDto } from "./dto/workflow-cycle.dto.ts";
export { WorkflowAcceptanceCycleRequestDto, WorkflowCycleCycleRequestDto, WorkflowCycleTraceParamsDto, WorkflowCyclePersistedResponseDto, WorkflowCycleTraceSummaryDto };

type WorkflowCyclePersistencePort = Pick<
  WorkflowCyclePersistenceService,
  "loadTraceSummary" | "persistCycle"
>;

type WorkflowAcceptanceCyclePort = Pick<WorkflowAcceptanceCycleService, "runCycle">;

export class WorkflowCycleController {
  constructor(
    private readonly workflows: WorkflowCyclePersistencePort,
    private readonly acceptanceCycles: WorkflowAcceptanceCyclePort,
  ) {}

  async runAcceptanceCycle(
    body: WorkflowAcceptanceCycleRequestDto,
  ): Promise<WorkflowAcceptanceCycleResult> {
    return await this.acceptanceCycles.runCycle(body);
  }

  async persistCycle(
    body: WorkflowCycleCycleRequestDto,
  ): Promise<WorkflowCyclePersistedResponseDto> {
    await this.workflows.persistCycle(body);
    return {
      status: "persisted",
      traceId: body.project.traceId,
    };
  }

  async loadTraceSummary(
    params: WorkflowCycleTraceParamsDto,
  ): Promise<WorkflowCycleTraceSummary> {
    return await this.workflows.loadTraceSummary(params.traceId);
  }
}

for (const property of [
  "workspace",
  "project",
  "freeform",
  "guidedPlanning",
  "approvedPlan",
  "execution",
  "uat",
] as const) {
  IsObject()(WorkflowAcceptanceCycleRequestDto.prototype, property);
}

for (const property of [
  "workspace",
  "project",
  "freeformDoc",
  "planningTask",
  "executionTask",
  "plan",
  "prototype",
  "review",
  "uat",
  "generatedE2E",
] as const) {
  IsObject()(WorkflowCycleCycleRequestDto.prototype, property);
}

IsString()(WorkflowCycleTraceParamsDto.prototype, "traceId");
MinLength(1)(WorkflowCycleTraceParamsDto.prototype, "traceId");

IsString()(WorkflowCyclePersistedResponseDto.prototype, "status");
IsString()(WorkflowCyclePersistedResponseDto.prototype, "traceId");

for (const property of ["traceId", "workspaceId", "projectId"] as const) {
  IsString()(WorkflowCycleTraceSummaryDto.prototype, property);
}
for (const property of [
  "documentIds",
  "taskIds",
  "dependencyEdges",
  "planIds",
  "prototypeIds",
  "reviewSessionIds",
  "uatSessionIds",
  "generatedE2ETestIds",
  "artifactIds",
  "agentRunIds",
] as const) {
  IsArray()(WorkflowCycleTraceSummaryDto.prototype, property);
  IsOptional()(WorkflowCycleTraceSummaryDto.prototype, property);
}

const runAcceptanceCycleDescriptor = Object.getOwnPropertyDescriptor(
  WorkflowCycleController.prototype,
  "runAcceptanceCycle",
);
const persistCycleDescriptor = Object.getOwnPropertyDescriptor(
  WorkflowCycleController.prototype,
  "persistCycle",
);
const loadTraceSummaryDescriptor = Object.getOwnPropertyDescriptor(
  WorkflowCycleController.prototype,
  "loadTraceSummary",
);

if (!runAcceptanceCycleDescriptor || !persistCycleDescriptor || !loadTraceSummaryDescriptor) {
  throw new Error("WorkflowCycleController route descriptors are missing");
}

Inject(WorkflowCyclePersistenceService)(WorkflowCycleController, undefined, 0);
Inject(WorkflowAcceptanceCycleService)(WorkflowCycleController, undefined, 1);
Controller("workflows/cycles")(WorkflowCycleController);
ApiTags("workflow-cycles")(WorkflowCycleController);

Post("acceptance-cycle/run")(
  WorkflowCycleController.prototype,
  "runAcceptanceCycle",
  runAcceptanceCycleDescriptor,
);
Body()(WorkflowCycleController.prototype, "runAcceptanceCycle", 0);
ApiOperation({ summary: "Run the workflow acceptance cycle through server-owned services" })(
  WorkflowCycleController.prototype,
  "runAcceptanceCycle",
  runAcceptanceCycleDescriptor,
);
ApiBody({ type: WorkflowAcceptanceCycleRequestDto })(
  WorkflowCycleController.prototype,
  "runAcceptanceCycle",
  runAcceptanceCycleDescriptor,
);
ApiOkResponse({ description: "Workflow acceptance cycle result" })(
  WorkflowCycleController.prototype,
  "runAcceptanceCycle",
  runAcceptanceCycleDescriptor,
);

Post("cycles")(WorkflowCycleController.prototype, "persistCycle", persistCycleDescriptor);
Body()(WorkflowCycleController.prototype, "persistCycle", 0);
ApiOperation({ summary: "Persist a complete cycle workflow cycle" })(
  WorkflowCycleController.prototype,
  "persistCycle",
  persistCycleDescriptor,
);
ApiBody({ type: WorkflowCycleCycleRequestDto })(
  WorkflowCycleController.prototype,
  "persistCycle",
  persistCycleDescriptor,
);
ApiCreatedResponse({ type: WorkflowCyclePersistedResponseDto })(
  WorkflowCycleController.prototype,
  "persistCycle",
  persistCycleDescriptor,
);

Get("traces/:traceId")(
  WorkflowCycleController.prototype,
  "loadTraceSummary",
  loadTraceSummaryDescriptor,
);
Param()(WorkflowCycleController.prototype, "loadTraceSummary", 0);
ApiOperation({ summary: "Load cycle workflow trace summary" })(
  WorkflowCycleController.prototype,
  "loadTraceSummary",
  loadTraceSummaryDescriptor,
);
ApiParam({ name: "traceId", required: true })(
  WorkflowCycleController.prototype,
  "loadTraceSummary",
  loadTraceSummaryDescriptor,
);
ApiOkResponse({ type: WorkflowCycleTraceSummaryDto })(
  WorkflowCycleController.prototype,
  "loadTraceSummary",
  loadTraceSummaryDescriptor,
);
