import "reflect-metadata";

import { Body, Controller, Inject, Post } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsArray, IsIn, IsOptional, IsString, MinLength } from "class-validator";

import type { BuildApprovedPlanBreakdownInput } from "@planning-review/application/approved-plan-breakdown.ts";

import {
  PlanningPreviewService,
  type ApprovedPlanMaterializeInput,
  type ApprovedPlanMaterializeResult,
  type ApprovedPlanPreview,
  type PlanningFreeformPromptInput,
  type PlanningFreeformPromptResult,
  type PlanningFreeformStartInput,
  type PlanningFreeformStartResult,
  type PlanningGuidedAcpStartInput,
  type PlanningGuidedAcpStartResult,
  type PlanningContinuousUpdateInput,
  type PlanningContinuousUpdateResult,
  type PlanningTechnicalCycleInput,
  type PlanningTechnicalCycleResult,
  type PersistedPlanningArtifactExecutionRecord,
} from "@workflow-coordination/application/planning-preview.service.ts";

import { PlanningApprovedPlanRequestDto, PlanningMaterializeRequestDto, PlanningFreeformPromptRequestDto, PlanningFreeformStartRequestDto, PlanningGuidedAcpStartRequestDto, PlanningContinuousChangedDocDto, PlanningContinuousUpdateRequestDto, PlanningTechnicalTaskSeedDto, PlanningTechnicalCycleRequestDto, PlanningArtifactExecutionRequestDto } from "./dto/planning-preview.dto.ts";
export { PlanningApprovedPlanRequestDto, PlanningMaterializeRequestDto, PlanningFreeformPromptRequestDto, PlanningFreeformStartRequestDto, PlanningGuidedAcpStartRequestDto, PlanningContinuousChangedDocDto, PlanningContinuousUpdateRequestDto, PlanningTechnicalTaskSeedDto, PlanningTechnicalCycleRequestDto, PlanningArtifactExecutionRequestDto };

type PlanningPreviewPort = Pick<
  PlanningPreviewService,
  | "materializeApprovedPlan"
  | "buildFreeformDocsPlanningPrompt"
  | "generateTechnicalPlanningCycle"
  | "previewApprovedPlan"
  | "recordArtifactExecution"
  | "restartPlanningCycleFromUpdates"
  | "startFreeformWork"
  | "startGuidedAcpPlanning"
>;

export class PlanningPreviewController {
  constructor(private readonly planning: PlanningPreviewPort) {}

  async previewApprovedPlan(
    body: PlanningApprovedPlanRequestDto,
  ): Promise<ApprovedPlanPreview> {
    return await this.planning.previewApprovedPlan(body);
  }

  async materializeApprovedPlan(
    body: PlanningMaterializeRequestDto,
  ): Promise<ApprovedPlanMaterializeResult> {
    return await this.planning.materializeApprovedPlan(body);
  }

  async buildFreeformDocsPlanningPrompt(
    body: PlanningFreeformPromptRequestDto,
  ): Promise<PlanningFreeformPromptResult> {
    return await this.planning.buildFreeformDocsPlanningPrompt(body);
  }

  async generateTechnicalPlanningCycle(
    body: PlanningTechnicalCycleRequestDto,
  ): Promise<PlanningTechnicalCycleResult> {
    return await this.planning.generateTechnicalPlanningCycle(body);
  }

  async recordArtifactExecution(
    body: PlanningArtifactExecutionRequestDto,
  ): Promise<PersistedPlanningArtifactExecutionRecord> {
    return await this.planning.recordArtifactExecution(body);
  }

  async startFreeformWork(
    body: PlanningFreeformStartRequestDto,
  ): Promise<PlanningFreeformStartResult> {
    return await this.planning.startFreeformWork(body);
  }

  async startGuidedAcpPlanning(
    body: PlanningGuidedAcpStartRequestDto,
  ): Promise<PlanningGuidedAcpStartResult> {
    return await this.planning.startGuidedAcpPlanning(body);
  }

  async restartPlanningCycleFromUpdates(
    body: PlanningContinuousUpdateRequestDto,
  ): Promise<PlanningContinuousUpdateResult> {
    return await this.planning.restartPlanningCycleFromUpdates(body);
  }
}

IsString()(PlanningApprovedPlanRequestDto.prototype, "planId");
MinLength(1)(PlanningApprovedPlanRequestDto.prototype, "planId");
IsString()(PlanningApprovedPlanRequestDto.prototype, "approvedPlanMarkdown");
MinLength(1)(PlanningApprovedPlanRequestDto.prototype, "approvedPlanMarkdown");
for (const property of ["traceId", "reviewId", "projectId", "cycleId", "moduleId"] as const) {
  IsString()(PlanningApprovedPlanRequestDto.prototype, property);
  IsOptional()(PlanningApprovedPlanRequestDto.prototype, property);
}
IsArray()(PlanningApprovedPlanRequestDto.prototype, "sourceDocRefs");
IsOptional()(PlanningApprovedPlanRequestDto.prototype, "sourceDocRefs");
for (const property of ["planId", "approvedPlanMarkdown", "projectId", "workspaceId", "workspaceSlug", "workspaceName", "projectSlug", "projectName"] as const) {
  IsString()(PlanningMaterializeRequestDto.prototype, property);
  MinLength(1)(PlanningMaterializeRequestDto.prototype, property);
}
for (const property of ["traceId", "reviewId", "cycleId", "moduleId"] as const) {
  IsString()(PlanningMaterializeRequestDto.prototype, property);
  IsOptional()(PlanningMaterializeRequestDto.prototype, property);
}
IsArray()(PlanningMaterializeRequestDto.prototype, "sourceDocRefs");
IsOptional()(PlanningMaterializeRequestDto.prototype, "sourceDocRefs");
for (const property of ["projectId", "userPrompt"] as const) {
  IsString()(PlanningFreeformPromptRequestDto.prototype, property);
  MinLength(1)(PlanningFreeformPromptRequestDto.prototype, property);
}
for (const property of ["traceId"] as const) {
  IsString()(PlanningFreeformPromptRequestDto.prototype, property);
  IsOptional()(PlanningFreeformPromptRequestDto.prototype, property);
}
IsArray()(PlanningFreeformPromptRequestDto.prototype, "selectedDocIds");
IsOptional()(PlanningFreeformPromptRequestDto.prototype, "selectedDocIds");
for (const target of [PlanningFreeformStartRequestDto, PlanningGuidedAcpStartRequestDto] as const) {
  for (const property of ["workspaceId", "workspaceSlug", "workspaceName", "projectId", "projectSlug", "projectName", "userPrompt"] as const) {
    IsString()(target.prototype, property);
    MinLength(1)(target.prototype, property);
  }
  for (const property of ["traceId", "modeId", "modelId"] as const) {
    IsString()(target.prototype, property);
    IsOptional()(target.prototype, property);
  }
}
for (const property of ["documentId", "parentId", "acpSessionId"] as const) {
  IsString()(PlanningFreeformStartRequestDto.prototype, property);
  IsOptional()(PlanningFreeformStartRequestDto.prototype, property);
}
for (const property of ["title", "bodyMd"] as const) {
  IsString()(PlanningFreeformStartRequestDto.prototype, property);
  MinLength(1)(PlanningFreeformStartRequestDto.prototype, property);
}
for (const property of ["acpSessionId", "agentName", "cwd"] as const) {
  IsString()(PlanningGuidedAcpStartRequestDto.prototype, property);
  MinLength(1)(PlanningGuidedAcpStartRequestDto.prototype, property);
}
IsString()(PlanningGuidedAcpStartRequestDto.prototype, "promptTemplateId");
IsOptional()(PlanningGuidedAcpStartRequestDto.prototype, "promptTemplateId");
IsString()(PlanningGuidedAcpStartRequestDto.prototype, "permissionMode");
IsOptional()(PlanningGuidedAcpStartRequestDto.prototype, "permissionMode");
IsArray()(PlanningGuidedAcpStartRequestDto.prototype, "selectedDocIds");
IsOptional()(PlanningGuidedAcpStartRequestDto.prototype, "selectedDocIds");
for (const property of ["workspaceId", "workspaceSlug", "workspaceName", "projectId", "projectSlug", "projectName", "trigger", "userPrompt"] as const) {
  IsString()(PlanningContinuousUpdateRequestDto.prototype, property);
  MinLength(1)(PlanningContinuousUpdateRequestDto.prototype, property);
}
IsIn(["manual_doc_edit", "acp_session_update"])(PlanningContinuousUpdateRequestDto.prototype, "trigger");
for (const property of ["traceId", "acpSessionId", "modeId", "modelId"] as const) {
  IsString()(PlanningContinuousUpdateRequestDto.prototype, property);
  IsOptional()(PlanningContinuousUpdateRequestDto.prototype, property);
}
for (const property of ["selectedDocIds", "targetTaskIds", "changedDocs"] as const) {
  IsArray()(PlanningContinuousUpdateRequestDto.prototype, property);
  IsOptional()(PlanningContinuousUpdateRequestDto.prototype, property);
}
for (const property of ["id", "title", "bodyMd"] as const) {
  IsString()(PlanningContinuousChangedDocDto.prototype, property);
  IsOptional()(PlanningContinuousChangedDocDto.prototype, property);
}
for (const property of ["projectId", "source", "userPrompt"] as const) {
  IsString()(PlanningTechnicalCycleRequestDto.prototype, property);
  MinLength(1)(PlanningTechnicalCycleRequestDto.prototype, property);
}
IsIn(["freeform_docs", "guided_acp", "continuous_update"])(PlanningTechnicalCycleRequestDto.prototype, "source");
for (const property of ["traceId", "planId", "reviewId"] as const) {
  IsString()(PlanningTechnicalCycleRequestDto.prototype, property);
  IsOptional()(PlanningTechnicalCycleRequestDto.prototype, property);
}
for (const property of ["selectedDocIds", "prototypePaths", "boilerplatePaths", "successCriteria", "taskSeeds"] as const) {
  IsArray()(PlanningTechnicalCycleRequestDto.prototype, property);
  IsOptional()(PlanningTechnicalCycleRequestDto.prototype, property);
}
for (const property of ["planId", "artifactPath", "status"] as const) {
  IsString()(PlanningArtifactExecutionRequestDto.prototype, property);
  MinLength(1)(PlanningArtifactExecutionRequestDto.prototype, property);
}
IsIn(["ready", "passed", "failed", "blocked"])(PlanningArtifactExecutionRequestDto.prototype, "status");
for (const property of ["prototypeId", "artifactId", "traceId", "command", "urlPath", "summary", "outputRef", "executedAt"] as const) {
  IsString()(PlanningArtifactExecutionRequestDto.prototype, property);
  IsOptional()(PlanningArtifactExecutionRequestDto.prototype, property);
}
for (const property of ["args", "checks"] as const) {
  IsArray()(PlanningArtifactExecutionRequestDto.prototype, property);
  IsOptional()(PlanningArtifactExecutionRequestDto.prototype, property);
}
for (const property of ["clientKey", "title"] as const) {
  IsString()(PlanningTechnicalTaskSeedDto.prototype, property);
  MinLength(1)(PlanningTechnicalTaskSeedDto.prototype, property);
}
IsArray()(PlanningTechnicalTaskSeedDto.prototype, "dependsOn");
IsOptional()(PlanningTechnicalTaskSeedDto.prototype, "dependsOn");
IsString()(PlanningTechnicalTaskSeedDto.prototype, "success");
IsOptional()(PlanningTechnicalTaskSeedDto.prototype, "success");

const previewApprovedPlanDescriptor = Object.getOwnPropertyDescriptor(
  PlanningPreviewController.prototype,
  "previewApprovedPlan",
);
const materializeApprovedPlanDescriptor = Object.getOwnPropertyDescriptor(
  PlanningPreviewController.prototype,
  "materializeApprovedPlan",
);
const buildFreeformDocsPlanningPromptDescriptor = Object.getOwnPropertyDescriptor(
  PlanningPreviewController.prototype,
  "buildFreeformDocsPlanningPrompt",
);
const generateTechnicalPlanningCycleDescriptor = Object.getOwnPropertyDescriptor(
  PlanningPreviewController.prototype,
  "generateTechnicalPlanningCycle",
);
const recordArtifactExecutionDescriptor = Object.getOwnPropertyDescriptor(
  PlanningPreviewController.prototype,
  "recordArtifactExecution",
);
const startFreeformWorkDescriptor = Object.getOwnPropertyDescriptor(
  PlanningPreviewController.prototype,
  "startFreeformWork",
);
const startGuidedAcpPlanningDescriptor = Object.getOwnPropertyDescriptor(
  PlanningPreviewController.prototype,
  "startGuidedAcpPlanning",
);
const restartPlanningCycleFromUpdatesDescriptor = Object.getOwnPropertyDescriptor(
  PlanningPreviewController.prototype,
  "restartPlanningCycleFromUpdates",
);

if (!previewApprovedPlanDescriptor || !materializeApprovedPlanDescriptor || !buildFreeformDocsPlanningPromptDescriptor || !generateTechnicalPlanningCycleDescriptor || !recordArtifactExecutionDescriptor || !startFreeformWorkDescriptor || !startGuidedAcpPlanningDescriptor || !restartPlanningCycleFromUpdatesDescriptor) {
  throw new Error("PlanningPreviewController route descriptor is missing");
}

Inject(PlanningPreviewService)(PlanningPreviewController, undefined, 0);
Controller("workflows/planning")(PlanningPreviewController);
ApiTags("planning-preview")(PlanningPreviewController);

Post("approved-plan/preview")(
  PlanningPreviewController.prototype,
  "previewApprovedPlan",
  previewApprovedPlanDescriptor,
);
Body()(PlanningPreviewController.prototype, "previewApprovedPlan", 0);
ApiOperation({ summary: "Preview an approved plan breakdown through the cycle planning model" })(
  PlanningPreviewController.prototype,
  "previewApprovedPlan",
  previewApprovedPlanDescriptor,
);
ApiBody({ type: PlanningApprovedPlanRequestDto })(
  PlanningPreviewController.prototype,
  "previewApprovedPlan",
  previewApprovedPlanDescriptor,
);
ApiOkResponse({ description: "Workflow approved-plan preview" })(
  PlanningPreviewController.prototype,
  "previewApprovedPlan",
  previewApprovedPlanDescriptor,
);

Post("approved-plan/materialize")(
  PlanningPreviewController.prototype,
  "materializeApprovedPlan",
  materializeApprovedPlanDescriptor,
);
Body()(PlanningPreviewController.prototype, "materializeApprovedPlan", 0);
ApiOperation({ summary: "Materialize an approved plan through the cycle TypeORM planning model" })(
  PlanningPreviewController.prototype,
  "materializeApprovedPlan",
  materializeApprovedPlanDescriptor,
);
ApiBody({ type: PlanningMaterializeRequestDto })(
  PlanningPreviewController.prototype,
  "materializeApprovedPlan",
  materializeApprovedPlanDescriptor,
);
ApiOkResponse({ description: "Workflow approved-plan materialization" })(
  PlanningPreviewController.prototype,
  "materializeApprovedPlan",
  materializeApprovedPlanDescriptor,
);

Post("freeform/prompt")(
  PlanningPreviewController.prototype,
  "buildFreeformDocsPlanningPrompt",
  buildFreeformDocsPlanningPromptDescriptor,
);
Body()(PlanningPreviewController.prototype, "buildFreeformDocsPlanningPrompt", 0);
ApiOperation({ summary: "Build an ACP planning prompt from persisted freeform docs" })(
  PlanningPreviewController.prototype,
  "buildFreeformDocsPlanningPrompt",
  buildFreeformDocsPlanningPromptDescriptor,
);
ApiBody({ type: PlanningFreeformPromptRequestDto })(
  PlanningPreviewController.prototype,
  "buildFreeformDocsPlanningPrompt",
  buildFreeformDocsPlanningPromptDescriptor,
);
ApiOkResponse({ description: "Freeform planning prompt" })(
  PlanningPreviewController.prototype,
  "buildFreeformDocsPlanningPrompt",
  buildFreeformDocsPlanningPromptDescriptor,
);

Post("technical-cycle/generate")(
  PlanningPreviewController.prototype,
  "generateTechnicalPlanningCycle",
  generateTechnicalPlanningCycleDescriptor,
);
Body()(PlanningPreviewController.prototype, "generateTechnicalPlanningCycle", 0);
ApiOperation({ summary: "Generate a reviewable technical planning cycle from docs" })(
  PlanningPreviewController.prototype,
  "generateTechnicalPlanningCycle",
  generateTechnicalPlanningCycleDescriptor,
);
ApiBody({ type: PlanningTechnicalCycleRequestDto })(
  PlanningPreviewController.prototype,
  "generateTechnicalPlanningCycle",
  generateTechnicalPlanningCycleDescriptor,
);
ApiOkResponse({ description: "Generated technical planning cycle" })(
  PlanningPreviewController.prototype,
  "generateTechnicalPlanningCycle",
  generateTechnicalPlanningCycleDescriptor,
);

Post("artifact-execution/record")(
  PlanningPreviewController.prototype,
  "recordArtifactExecution",
  recordArtifactExecutionDescriptor,
);
Body()(PlanningPreviewController.prototype, "recordArtifactExecution", 0);
ApiOperation({ summary: "Record a reviewable artifact execution result for a planning prototype" })(
  PlanningPreviewController.prototype,
  "recordArtifactExecution",
  recordArtifactExecutionDescriptor,
);
ApiBody({ type: PlanningArtifactExecutionRequestDto })(
  PlanningPreviewController.prototype,
  "recordArtifactExecution",
  recordArtifactExecutionDescriptor,
);
ApiOkResponse({ description: "Persisted planning artifact execution record" })(
  PlanningPreviewController.prototype,
  "recordArtifactExecution",
  recordArtifactExecutionDescriptor,
);

Post("freeform/start")(
  PlanningPreviewController.prototype,
  "startFreeformWork",
  startFreeformWorkDescriptor,
);
Body()(PlanningPreviewController.prototype, "startFreeformWork", 0);
ApiOperation({ summary: "Start cycle planning from a freeform freeform document" })(
  PlanningPreviewController.prototype,
  "startFreeformWork",
  startFreeformWorkDescriptor,
);
ApiBody({ type: PlanningFreeformStartRequestDto })(
  PlanningPreviewController.prototype,
  "startFreeformWork",
  startFreeformWorkDescriptor,
);
ApiOkResponse({ description: "Workflow freeform planning start" })(
  PlanningPreviewController.prototype,
  "startFreeformWork",
  startFreeformWorkDescriptor,
);

Post("guided-acp/start")(
  PlanningPreviewController.prototype,
  "startGuidedAcpPlanning",
  startGuidedAcpPlanningDescriptor,
);
Body()(PlanningPreviewController.prototype, "startGuidedAcpPlanning", 0);
ApiOperation({ summary: "Start cycle guided ACP planning from selected docs" })(
  PlanningPreviewController.prototype,
  "startGuidedAcpPlanning",
  startGuidedAcpPlanningDescriptor,
);
ApiBody({ type: PlanningGuidedAcpStartRequestDto })(
  PlanningPreviewController.prototype,
  "startGuidedAcpPlanning",
  startGuidedAcpPlanningDescriptor,
);
ApiOkResponse({ description: "Guided ACP planning session start" })(
  PlanningPreviewController.prototype,
  "startGuidedAcpPlanning",
  startGuidedAcpPlanningDescriptor,
);

Post("continuous-update/restart")(
  PlanningPreviewController.prototype,
  "restartPlanningCycleFromUpdates",
  restartPlanningCycleFromUpdatesDescriptor,
);
Body()(PlanningPreviewController.prototype, "restartPlanningCycleFromUpdates", 0);
ApiOperation({ summary: "Restart cycle planning from continuous document and agent-session updates" })(
  PlanningPreviewController.prototype,
  "restartPlanningCycleFromUpdates",
  restartPlanningCycleFromUpdatesDescriptor,
);
ApiBody({ type: PlanningContinuousUpdateRequestDto })(
  PlanningPreviewController.prototype,
  "restartPlanningCycleFromUpdates",
  restartPlanningCycleFromUpdatesDescriptor,
);
ApiOkResponse({ description: "Workflow continuous-update replanning start" })(
  PlanningPreviewController.prototype,
  "restartPlanningCycleFromUpdates",
  restartPlanningCycleFromUpdatesDescriptor,
);
