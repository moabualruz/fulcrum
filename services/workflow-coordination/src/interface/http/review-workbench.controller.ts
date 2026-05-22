import "reflect-metadata";

import { Body, Controller, Inject, Post } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString } from "class-validator";

import type { ReviewWorkbenchInput } from "@planning-review/application/reviews/review-workbench.ts";

import {
  type ConfiguredUatCodeReviewDecision,
  type ConfiguredUatCodeReviewDecisionInput,
  type FinalQaFeedbackGate,
  type FinalQaFeedbackGateInput,
  type FinalQaReport,
  type FinalQaReportInput,
  type GeneratedE2eRegressionRun,
  type GeneratedE2eRegressionRunInput,
  type GeneratedE2eRunHistory,
  type GeneratedE2eRunHistoryInput,
  type ReviewWorkbenchSession,
  type ReviewWorkbenchSessionAnnotationInput,
  type ReviewWorkbenchSessionLoadInput,
  type ReviewWorkbenchSessionSaveInput,
  type UatCodeReviewDecision,
  type UatCodeReviewDecisionInput,
  type UatCodeReviewHandoff,
  type UatCodeReviewHandoffInput,
  ReviewWorkbenchService,
  type ReviewWorkbenchPreview,
} from "@workflow-coordination/application/review-workbench.service.ts";

import {
  ConfiguredUatCodeReviewDecisionRequestDto,
  FinalQaFeedbackGateRequestDto,
  FinalQaReportRequestDto,
  GeneratedE2eRegressionRunRequestDto,
  GeneratedE2eRunHistoryRequestDto,
  ReviewWorkbenchRequestDto,
  ReviewWorkbenchSessionAnnotateRequestDto,
  ReviewWorkbenchSessionLoadRequestDto,
  ReviewWorkbenchSessionSaveRequestDto,
  UatCodeReviewDecisionRequestDto,
  UatCodeReviewHandoffRequestDto,
} from "./dto/review-workbench.dto.ts";
export {
  ConfiguredUatCodeReviewDecisionRequestDto,
  FinalQaFeedbackGateRequestDto,
  FinalQaReportRequestDto,
  GeneratedE2eRegressionRunRequestDto,
  GeneratedE2eRunHistoryRequestDto,
  ReviewWorkbenchRequestDto,
  ReviewWorkbenchSessionAnnotateRequestDto,
  ReviewWorkbenchSessionLoadRequestDto,
  ReviewWorkbenchSessionSaveRequestDto,
  UatCodeReviewDecisionRequestDto,
  UatCodeReviewHandoffRequestDto,
};

type ReviewWorkbenchPort = Pick<
  ReviewWorkbenchService,
  | "previewWorkbench"
  | "saveReviewWorkbenchSession"
  | "loadReviewWorkbenchSession"
  | "appendReviewWorkbenchAnnotation"
  | "buildFinalQaReport"
  | "buildFinalQaFeedbackGate"
  | "buildUatCodeReviewHandoff"
  | "recordUatCodeReviewDecision"
  | "applyConfiguredUatCodeReviewDecision"
  | "runGeneratedE2eRegressionTests"
> & {
  listGeneratedE2eRuns?: ReviewWorkbenchService["listGeneratedE2eRuns"];
};

export class ReviewWorkbenchController {
  constructor(private readonly review: ReviewWorkbenchPort) {}

  async previewWorkbench(
    body: ReviewWorkbenchRequestDto,
  ): Promise<ReviewWorkbenchPreview> {
    return await this.review.previewWorkbench(body);
  }

  async saveReviewWorkbenchSession(
    body: ReviewWorkbenchSessionSaveRequestDto,
  ): Promise<ReviewWorkbenchSession> {
    return await this.review.saveReviewWorkbenchSession(body);
  }

  async loadReviewWorkbenchSession(
    body: ReviewWorkbenchSessionLoadRequestDto,
  ): Promise<ReviewWorkbenchSession> {
    return await this.review.loadReviewWorkbenchSession(body);
  }

  async appendReviewWorkbenchAnnotation(
    body: ReviewWorkbenchSessionAnnotateRequestDto,
  ): Promise<ReviewWorkbenchSession> {
    return await this.review.appendReviewWorkbenchAnnotation(body);
  }

  async buildFinalQaReport(
    body: FinalQaReportRequestDto,
  ): Promise<FinalQaReport> {
    return await this.review.buildFinalQaReport(body);
  }

  async buildFinalQaFeedbackGate(
    body: FinalQaFeedbackGateRequestDto,
  ): Promise<FinalQaFeedbackGate> {
    return await this.review.buildFinalQaFeedbackGate(body);
  }

  async buildUatCodeReviewHandoff(
    body: UatCodeReviewHandoffRequestDto,
  ): Promise<UatCodeReviewHandoff> {
    return await this.review.buildUatCodeReviewHandoff(body);
  }

  async recordUatCodeReviewDecision(
    body: UatCodeReviewDecisionRequestDto,
  ): Promise<UatCodeReviewDecision> {
    return await this.review.recordUatCodeReviewDecision(body);
  }

  async applyConfiguredUatCodeReviewDecision(
    body: ConfiguredUatCodeReviewDecisionRequestDto,
  ): Promise<ConfiguredUatCodeReviewDecision> {
    return await this.review.applyConfiguredUatCodeReviewDecision(body);
  }

  async runGeneratedE2eRegressionTests(
    body: GeneratedE2eRegressionRunRequestDto,
  ): Promise<GeneratedE2eRegressionRun> {
    return await this.review.runGeneratedE2eRegressionTests(body);
  }

  async listGeneratedE2eRuns(
    body: GeneratedE2eRunHistoryInput,
  ): Promise<GeneratedE2eRunHistory> {
    if (!this.review.listGeneratedE2eRuns) {
      throw new Error("Review workbench service does not expose generated E2E run history.");
    }
    return await this.review.listGeneratedE2eRuns(body);
  }
}

for (const property of ["projectId", "traceId", "reviewId", "selectedFilePath", "searchQuery", "activeSearchMatchId", "currentPrUrl"] as const) {
  IsString()(ReviewWorkbenchRequestDto.prototype, property);
  IsOptional()(ReviewWorkbenchRequestDto.prototype, property);
}
for (const property of ["files", "annotations"] as const) {
  IsArray()(ReviewWorkbenchRequestDto.prototype, property);
}
for (const property of ["viewedFilePaths", "editorAnnotations"] as const) {
  IsArray()(ReviewWorkbenchRequestDto.prototype, property);
  IsOptional()(ReviewWorkbenchRequestDto.prototype, property);
}
for (const property of ["liveLog", "currentPrMeta"] as const) {
  IsObject()(ReviewWorkbenchRequestDto.prototype, property);
  IsOptional()(ReviewWorkbenchRequestDto.prototype, property);
}
IsOptional()(ReviewWorkbenchRequestDto.prototype, "hideViewedFiles");

for (const property of ["workspaceId", "workspaceSlug", "workspaceName", "projectId", "projectSlug", "projectName"] as const) {
  IsString()(ReviewWorkbenchSessionSaveRequestDto.prototype, property);
  IsNotEmpty()(ReviewWorkbenchSessionSaveRequestDto.prototype, property);
  IsString()(ReviewWorkbenchSessionLoadRequestDto.prototype, property);
  IsNotEmpty()(ReviewWorkbenchSessionLoadRequestDto.prototype, property);
  IsString()(ReviewWorkbenchSessionAnnotateRequestDto.prototype, property);
  IsNotEmpty()(ReviewWorkbenchSessionAnnotateRequestDto.prototype, property);
}
for (const property of ["traceId", "reviewId", "reviewType", "title", "selectedFilePath", "searchQuery", "activeSearchMatchId", "currentPrUrl"] as const) {
  IsString()(ReviewWorkbenchSessionSaveRequestDto.prototype, property);
  IsOptional()(ReviewWorkbenchSessionSaveRequestDto.prototype, property);
}
for (const property of ["traceId", "reviewId", "selectedFilePath", "searchQuery", "activeSearchMatchId"] as const) {
  IsString()(ReviewWorkbenchSessionLoadRequestDto.prototype, property);
  IsOptional()(ReviewWorkbenchSessionLoadRequestDto.prototype, property);
}
for (const property of ["files", "annotations"] as const) {
  IsArray()(ReviewWorkbenchSessionSaveRequestDto.prototype, property);
}
for (const property of ["viewedFilePaths", "editorAnnotations"] as const) {
  IsArray()(ReviewWorkbenchSessionSaveRequestDto.prototype, property);
  IsOptional()(ReviewWorkbenchSessionSaveRequestDto.prototype, property);
}
for (const property of ["viewedFilePaths"] as const) {
  IsArray()(ReviewWorkbenchSessionLoadRequestDto.prototype, property);
  IsOptional()(ReviewWorkbenchSessionLoadRequestDto.prototype, property);
}
for (const property of ["traceId", "reviewId", "annotationId", "type", "scope", "side", "text", "suggestedCode", "originalCode", "severity", "conventionalLabel", "author", "source", "selectedFilePath", "searchQuery", "activeSearchMatchId"] as const) {
  IsString()(ReviewWorkbenchSessionAnnotateRequestDto.prototype, property);
  IsOptional()(ReviewWorkbenchSessionAnnotateRequestDto.prototype, property);
}
IsString()(ReviewWorkbenchSessionAnnotateRequestDto.prototype, "filePath");
IsNotEmpty()(ReviewWorkbenchSessionAnnotateRequestDto.prototype, "filePath");
for (const property of ["lineStart", "lineEnd"] as const) {
  IsNumber()(ReviewWorkbenchSessionAnnotateRequestDto.prototype, property);
  IsNotEmpty()(ReviewWorkbenchSessionAnnotateRequestDto.prototype, property);
}
IsArray()(ReviewWorkbenchSessionAnnotateRequestDto.prototype, "decorations");
IsOptional()(ReviewWorkbenchSessionAnnotateRequestDto.prototype, "decorations");
IsArray()(ReviewWorkbenchSessionAnnotateRequestDto.prototype, "viewedFilePaths");
IsOptional()(ReviewWorkbenchSessionAnnotateRequestDto.prototype, "viewedFilePaths");
IsNumber()(ReviewWorkbenchSessionAnnotateRequestDto.prototype, "createdAt");
IsOptional()(ReviewWorkbenchSessionAnnotateRequestDto.prototype, "createdAt");
for (const property of ["liveLog", "currentPrMeta"] as const) {
  IsObject()(ReviewWorkbenchSessionSaveRequestDto.prototype, property);
  IsOptional()(ReviewWorkbenchSessionSaveRequestDto.prototype, property);
}
IsOptional()(ReviewWorkbenchSessionSaveRequestDto.prototype, "hideViewedFiles");
IsOptional()(ReviewWorkbenchSessionLoadRequestDto.prototype, "hideViewedFiles");
IsOptional()(ReviewWorkbenchSessionAnnotateRequestDto.prototype, "hideViewedFiles");

for (const property of ["workspaceId", "workspaceSlug", "workspaceName", "projectId", "projectSlug", "projectName"] as const) {
  IsString()(FinalQaReportRequestDto.prototype, property);
  IsNotEmpty()(FinalQaReportRequestDto.prototype, property);
}
for (const property of ["traceId"] as const) {
  IsString()(FinalQaReportRequestDto.prototype, property);
  IsOptional()(FinalQaReportRequestDto.prototype, property);
}
IsArray()(FinalQaReportRequestDto.prototype, "taskIds");
IsOptional()(FinalQaReportRequestDto.prototype, "taskIds");

for (const property of ["workspaceId", "workspaceSlug", "workspaceName", "projectId", "projectSlug", "projectName"] as const) {
  IsString()(FinalQaFeedbackGateRequestDto.prototype, property);
  IsNotEmpty()(FinalQaFeedbackGateRequestDto.prototype, property);
}
for (const property of ["traceId", "workerId", "reviewerAgent", "feedbackAgent", "feedbackModel", "cwd"] as const) {
  IsString()(FinalQaFeedbackGateRequestDto.prototype, property);
  IsOptional()(FinalQaFeedbackGateRequestDto.prototype, property);
}
IsNumber()(FinalQaFeedbackGateRequestDto.prototype, "maxIterations");
IsOptional()(FinalQaFeedbackGateRequestDto.prototype, "maxIterations");
IsArray()(FinalQaFeedbackGateRequestDto.prototype, "taskIds");
IsOptional()(FinalQaFeedbackGateRequestDto.prototype, "taskIds");
IsArray()(FinalQaFeedbackGateRequestDto.prototype, "copyToWorktree");
IsOptional()(FinalQaFeedbackGateRequestDto.prototype, "copyToWorktree");

for (const property of ["workspaceId", "workspaceSlug", "workspaceName", "projectId", "projectSlug", "projectName"] as const) {
  IsString()(UatCodeReviewHandoffRequestDto.prototype, property);
  IsNotEmpty()(UatCodeReviewHandoffRequestDto.prototype, property);
}
for (const property of ["traceId"] as const) {
  IsString()(UatCodeReviewHandoffRequestDto.prototype, property);
  IsOptional()(UatCodeReviewHandoffRequestDto.prototype, property);
}
IsArray()(UatCodeReviewHandoffRequestDto.prototype, "taskIds");
IsOptional()(UatCodeReviewHandoffRequestDto.prototype, "taskIds");

for (const property of ["workspaceId", "workspaceSlug", "workspaceName", "projectId", "projectSlug", "projectName", "decision", "reviewType"] as const) {
  IsString()(UatCodeReviewDecisionRequestDto.prototype, property);
  IsNotEmpty()(UatCodeReviewDecisionRequestDto.prototype, property);
}
for (const property of ["traceId", "feedbackText", "feedbackAgent", "feedbackModel", "e2eRunner"] as const) {
  IsString()(UatCodeReviewDecisionRequestDto.prototype, property);
  IsOptional()(UatCodeReviewDecisionRequestDto.prototype, property);
}
IsArray()(UatCodeReviewDecisionRequestDto.prototype, "taskIds");
IsOptional()(UatCodeReviewDecisionRequestDto.prototype, "taskIds");

for (const property of ["workspaceId", "workspaceSlug", "workspaceName", "projectId", "projectSlug", "projectName"] as const) {
  IsString()(ConfiguredUatCodeReviewDecisionRequestDto.prototype, property);
  IsNotEmpty()(ConfiguredUatCodeReviewDecisionRequestDto.prototype, property);
  IsString()(GeneratedE2eRegressionRunRequestDto.prototype, property);
  IsNotEmpty()(GeneratedE2eRegressionRunRequestDto.prototype, property);
}
for (const property of ["traceId"] as const) {
  IsString()(ConfiguredUatCodeReviewDecisionRequestDto.prototype, property);
  IsOptional()(ConfiguredUatCodeReviewDecisionRequestDto.prototype, property);
  IsString()(GeneratedE2eRegressionRunRequestDto.prototype, property);
  IsOptional()(GeneratedE2eRegressionRunRequestDto.prototype, property);
}
for (const property of ["runner"] as const) {
  IsString()(GeneratedE2eRegressionRunRequestDto.prototype, property);
  IsOptional()(GeneratedE2eRegressionRunRequestDto.prototype, property);
}
IsArray()(ConfiguredUatCodeReviewDecisionRequestDto.prototype, "taskIds");
IsOptional()(ConfiguredUatCodeReviewDecisionRequestDto.prototype, "taskIds");
IsArray()(GeneratedE2eRegressionRunRequestDto.prototype, "taskIds");
IsOptional()(GeneratedE2eRegressionRunRequestDto.prototype, "taskIds");
IsOptional()(GeneratedE2eRegressionRunRequestDto.prototype, "planOnly");

const previewWorkbenchDescriptor = Object.getOwnPropertyDescriptor(
  ReviewWorkbenchController.prototype,
  "previewWorkbench",
);
const saveReviewWorkbenchSessionDescriptor = Object.getOwnPropertyDescriptor(
  ReviewWorkbenchController.prototype,
  "saveReviewWorkbenchSession",
);
const loadReviewWorkbenchSessionDescriptor = Object.getOwnPropertyDescriptor(
  ReviewWorkbenchController.prototype,
  "loadReviewWorkbenchSession",
);
const appendReviewWorkbenchAnnotationDescriptor = Object.getOwnPropertyDescriptor(
  ReviewWorkbenchController.prototype,
  "appendReviewWorkbenchAnnotation",
);
const buildFinalQaReportDescriptor = Object.getOwnPropertyDescriptor(
  ReviewWorkbenchController.prototype,
  "buildFinalQaReport",
);
const buildFinalQaFeedbackGateDescriptor = Object.getOwnPropertyDescriptor(
  ReviewWorkbenchController.prototype,
  "buildFinalQaFeedbackGate",
);
const buildUatCodeReviewHandoffDescriptor = Object.getOwnPropertyDescriptor(
  ReviewWorkbenchController.prototype,
  "buildUatCodeReviewHandoff",
);
const recordUatCodeReviewDecisionDescriptor = Object.getOwnPropertyDescriptor(
  ReviewWorkbenchController.prototype,
  "recordUatCodeReviewDecision",
);
const applyConfiguredUatCodeReviewDecisionDescriptor = Object.getOwnPropertyDescriptor(
  ReviewWorkbenchController.prototype,
  "applyConfiguredUatCodeReviewDecision",
);
const runGeneratedE2eRegressionTestsDescriptor = Object.getOwnPropertyDescriptor(
  ReviewWorkbenchController.prototype,
  "runGeneratedE2eRegressionTests",
);
const listGeneratedE2eRunsDescriptor = Object.getOwnPropertyDescriptor(
  ReviewWorkbenchController.prototype,
  "listGeneratedE2eRuns",
);

if (
  !previewWorkbenchDescriptor ||
  !saveReviewWorkbenchSessionDescriptor ||
  !loadReviewWorkbenchSessionDescriptor ||
  !appendReviewWorkbenchAnnotationDescriptor ||
  !buildFinalQaReportDescriptor ||
  !buildFinalQaFeedbackGateDescriptor ||
  !buildUatCodeReviewHandoffDescriptor ||
  !recordUatCodeReviewDecisionDescriptor ||
  !applyConfiguredUatCodeReviewDecisionDescriptor ||
  !runGeneratedE2eRegressionTestsDescriptor ||
  !listGeneratedE2eRunsDescriptor
) {
  throw new Error("ReviewWorkbenchController route descriptor is missing");
}

Inject(ReviewWorkbenchService)(ReviewWorkbenchController, undefined, 0);
Controller("workflows/review")(ReviewWorkbenchController);
ApiTags("review-workbench")(ReviewWorkbenchController);

Post("workbench/preview")(ReviewWorkbenchController.prototype, "previewWorkbench", previewWorkbenchDescriptor);
Body()(ReviewWorkbenchController.prototype, "previewWorkbench", 0);
ApiOperation({ summary: "Preview a review-driven review workbench model" })(
  ReviewWorkbenchController.prototype,
  "previewWorkbench",
  previewWorkbenchDescriptor,
);
ApiBody({ type: ReviewWorkbenchRequestDto })(
  ReviewWorkbenchController.prototype,
  "previewWorkbench",
  previewWorkbenchDescriptor,
);
ApiOkResponse({ description: "Workflow review workbench preview" })(
  ReviewWorkbenchController.prototype,
  "previewWorkbench",
  previewWorkbenchDescriptor,
);

Post("workbench/session/save")(
  ReviewWorkbenchController.prototype,
  "saveReviewWorkbenchSession",
  saveReviewWorkbenchSessionDescriptor,
);
Body()(ReviewWorkbenchController.prototype, "saveReviewWorkbenchSession", 0);
ApiOperation({ summary: "Save a review-driven review workbench session" })(
  ReviewWorkbenchController.prototype,
  "saveReviewWorkbenchSession",
  saveReviewWorkbenchSessionDescriptor,
);
ApiBody({ type: ReviewWorkbenchSessionSaveRequestDto })(
  ReviewWorkbenchController.prototype,
  "saveReviewWorkbenchSession",
  saveReviewWorkbenchSessionDescriptor,
);
ApiOkResponse({ description: "Saved review workbench session state" })(
  ReviewWorkbenchController.prototype,
  "saveReviewWorkbenchSession",
  saveReviewWorkbenchSessionDescriptor,
);

Post("workbench/session/load")(
  ReviewWorkbenchController.prototype,
  "loadReviewWorkbenchSession",
  loadReviewWorkbenchSessionDescriptor,
);
Body()(ReviewWorkbenchController.prototype, "loadReviewWorkbenchSession", 0);
ApiOperation({ summary: "Load a review-driven review workbench session" })(
  ReviewWorkbenchController.prototype,
  "loadReviewWorkbenchSession",
  loadReviewWorkbenchSessionDescriptor,
);
ApiBody({ type: ReviewWorkbenchSessionLoadRequestDto })(
  ReviewWorkbenchController.prototype,
  "loadReviewWorkbenchSession",
  loadReviewWorkbenchSessionDescriptor,
);
ApiOkResponse({ description: "Loaded review workbench session state" })(
  ReviewWorkbenchController.prototype,
  "loadReviewWorkbenchSession",
  loadReviewWorkbenchSessionDescriptor,
);

Post("workbench/session/annotate")(
  ReviewWorkbenchController.prototype,
  "appendReviewWorkbenchAnnotation",
  appendReviewWorkbenchAnnotationDescriptor,
);
Body()(ReviewWorkbenchController.prototype, "appendReviewWorkbenchAnnotation", 0);
ApiOperation({ summary: "Append a review-driven inline annotation to a review workbench session" })(
  ReviewWorkbenchController.prototype,
  "appendReviewWorkbenchAnnotation",
  appendReviewWorkbenchAnnotationDescriptor,
);
ApiBody({ type: ReviewWorkbenchSessionAnnotateRequestDto })(
  ReviewWorkbenchController.prototype,
  "appendReviewWorkbenchAnnotation",
  appendReviewWorkbenchAnnotationDescriptor,
);
ApiOkResponse({ description: "Annotated review workbench session state" })(
  ReviewWorkbenchController.prototype,
  "appendReviewWorkbenchAnnotation",
  appendReviewWorkbenchAnnotationDescriptor,
);

Post("final-qa/report")(ReviewWorkbenchController.prototype, "buildFinalQaReport", buildFinalQaReportDescriptor);
Body()(ReviewWorkbenchController.prototype, "buildFinalQaReport", 0);
ApiOperation({ summary: "Build a task review-derived final QA report" })(
  ReviewWorkbenchController.prototype,
  "buildFinalQaReport",
  buildFinalQaReportDescriptor,
);
ApiBody({ type: FinalQaReportRequestDto })(
  ReviewWorkbenchController.prototype,
  "buildFinalQaReport",
  buildFinalQaReportDescriptor,
);
ApiOkResponse({ description: "Final QA report and UAT/code review readiness state" })(
  ReviewWorkbenchController.prototype,
  "buildFinalQaReport",
  buildFinalQaReportDescriptor,
);

Post("final-qa/feedback-gate")(
  ReviewWorkbenchController.prototype,
  "buildFinalQaFeedbackGate",
  buildFinalQaFeedbackGateDescriptor,
);
Body()(ReviewWorkbenchController.prototype, "buildFinalQaFeedbackGate", 0);
ApiOperation({ summary: "Run final QA and automated feedback until user handoff is truthful" })(
  ReviewWorkbenchController.prototype,
  "buildFinalQaFeedbackGate",
  buildFinalQaFeedbackGateDescriptor,
);
ApiBody({ type: FinalQaFeedbackGateRequestDto })(
  ReviewWorkbenchController.prototype,
  "buildFinalQaFeedbackGate",
  buildFinalQaFeedbackGateDescriptor,
);
ApiOkResponse({ description: "Final QA feedback gate result and post-loop report" })(
  ReviewWorkbenchController.prototype,
  "buildFinalQaFeedbackGate",
  buildFinalQaFeedbackGateDescriptor,
);

Post("uat-code-review/handoff")(
  ReviewWorkbenchController.prototype,
  "buildUatCodeReviewHandoff",
  buildUatCodeReviewHandoffDescriptor,
);
Body()(ReviewWorkbenchController.prototype, "buildUatCodeReviewHandoff", 0);
ApiOperation({ summary: "Build a review-driven UAT/code-review handoff" })(
  ReviewWorkbenchController.prototype,
  "buildUatCodeReviewHandoff",
  buildUatCodeReviewHandoffDescriptor,
);
ApiBody({ type: UatCodeReviewHandoffRequestDto })(
  ReviewWorkbenchController.prototype,
  "buildUatCodeReviewHandoff",
  buildUatCodeReviewHandoffDescriptor,
);
ApiOkResponse({ description: "UAT/code-review prompt, sessions, and decision options" })(
  ReviewWorkbenchController.prototype,
  "buildUatCodeReviewHandoff",
  buildUatCodeReviewHandoffDescriptor,
);

Post("uat-code-review/decision/record")(
  ReviewWorkbenchController.prototype,
  "recordUatCodeReviewDecision",
  recordUatCodeReviewDecisionDescriptor,
);
Body()(ReviewWorkbenchController.prototype, "recordUatCodeReviewDecision", 0);
ApiOperation({ summary: "Record a review-driven UAT/code-review decision" })(
  ReviewWorkbenchController.prototype,
  "recordUatCodeReviewDecision",
  recordUatCodeReviewDecisionDescriptor,
);
ApiBody({ type: UatCodeReviewDecisionRequestDto })(
  ReviewWorkbenchController.prototype,
  "recordUatCodeReviewDecision",
  recordUatCodeReviewDecisionDescriptor,
);
ApiOkResponse({ description: "Recorded UAT/code-review decision, feedback runs, or generated E2E rows" })(
  ReviewWorkbenchController.prototype,
  "recordUatCodeReviewDecision",
  recordUatCodeReviewDecisionDescriptor,
);

Post("uat-code-review/decision/apply-configured")(
  ReviewWorkbenchController.prototype,
  "applyConfiguredUatCodeReviewDecision",
  applyConfiguredUatCodeReviewDecisionDescriptor,
);
Body()(ReviewWorkbenchController.prototype, "applyConfiguredUatCodeReviewDecision", 0);
ApiOperation({ summary: "Apply configured review-driven UAT/code-review auto-decision" })(
  ReviewWorkbenchController.prototype,
  "applyConfiguredUatCodeReviewDecision",
  applyConfiguredUatCodeReviewDecisionDescriptor,
);
ApiBody({ type: ConfiguredUatCodeReviewDecisionRequestDto })(
  ReviewWorkbenchController.prototype,
  "applyConfiguredUatCodeReviewDecision",
  applyConfiguredUatCodeReviewDecisionDescriptor,
);
ApiOkResponse({ description: "Applied configured UAT/code-review decision or skipped state" })(
  ReviewWorkbenchController.prototype,
  "applyConfiguredUatCodeReviewDecision",
  applyConfiguredUatCodeReviewDecisionDescriptor,
);

Post("generated-e2e/run")(
  ReviewWorkbenchController.prototype,
  "runGeneratedE2eRegressionTests",
  runGeneratedE2eRegressionTestsDescriptor,
);
Body()(ReviewWorkbenchController.prototype, "runGeneratedE2eRegressionTests", 0);
ApiOperation({ summary: "Plan or run generated real-data E2E regression tests" })(
  ReviewWorkbenchController.prototype,
  "runGeneratedE2eRegressionTests",
  runGeneratedE2eRegressionTestsDescriptor,
);
ApiBody({ type: GeneratedE2eRegressionRunRequestDto })(
  ReviewWorkbenchController.prototype,
  "runGeneratedE2eRegressionTests",
  runGeneratedE2eRegressionTestsDescriptor,
);
ApiOkResponse({ description: "Generated E2E run command, files, and audit event" })(
  ReviewWorkbenchController.prototype,
  "runGeneratedE2eRegressionTests",
  runGeneratedE2eRegressionTestsDescriptor,
);

Post("generated-e2e/history")(
  ReviewWorkbenchController.prototype,
  "listGeneratedE2eRuns",
  listGeneratedE2eRunsDescriptor,
);
Body()(ReviewWorkbenchController.prototype, "listGeneratedE2eRuns", 0);
ApiOperation({ summary: "List generated real-data E2E regression runs" })(
  ReviewWorkbenchController.prototype,
  "listGeneratedE2eRuns",
  listGeneratedE2eRunsDescriptor,
);
ApiBody({ type: GeneratedE2eRunHistoryRequestDto })(
  ReviewWorkbenchController.prototype,
  "listGeneratedE2eRuns",
  listGeneratedE2eRunsDescriptor,
);
ApiOkResponse({ description: "Generated E2E run history" })(
  ReviewWorkbenchController.prototype,
  "listGeneratedE2eRuns",
  listGeneratedE2eRunsDescriptor,
);
