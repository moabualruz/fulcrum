import "reflect-metadata";

import { Body, Controller, Get, Inject, Post, Query, Res } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsArray, IsObject, IsOptional, IsString, MinLength } from "class-validator";

import type { DependencyRunPreviewInput } from "@execution-orchestration/domain/dependency-run-preview.ts";

import {
  DependencyRunService,
  type DependencyRunDispatchInput,
  type DependencyRunDispatchOutput,
  type DependencyRunLifecycleEventInput,
  type DependencyRunLifecycleEventOutput,
  type DependencyRunLiveFeedbackInput,
  type DependencyRunLiveFeedbackOutput,
  type DependencyRunPreviewRequest,
  type DependencyRunPreviewOutput,
  type DependencyRunWorkerTickInput,
  type DependencyRunWorkerTickOutput,
  type AutomatedFeedbackLoopInput,
  type AutomatedFeedbackLoopOutput,
  type TaskQaReviewInput,
  type TaskQaReviewOutput,
} from "@workflow-coordination/application/dependency-execution.service.ts";

import { DependencyRunPreviewRequestDto, DependencyRunDispatchRequestDto, DependencyRunLiveFeedbackRequestDto, DependencyRunLiveFeedbackStreamQueryDto, DependencyRunLifecycleEventRequestDto, DependencyRunWorkerTickRequestDto, AutomatedFeedbackLoopRequestDto, TaskQaReviewRequestDto } from "./dto/dependency-execution.dto.ts";
export { DependencyRunPreviewRequestDto, DependencyRunDispatchRequestDto, DependencyRunLiveFeedbackRequestDto, DependencyRunLiveFeedbackStreamQueryDto, DependencyRunLifecycleEventRequestDto, DependencyRunWorkerTickRequestDto, AutomatedFeedbackLoopRequestDto, TaskQaReviewRequestDto };

type DependencyRunPreviewPort = Pick<
  DependencyRunService,
  | "dispatchDependencyRun"
  | "loadDependencyRunLiveFeedback"
  | "previewDependencyRun"
  | "recordDependencyRunLifecycleEvent"
  | "recordTaskQaReview"
  | "runAutomatedFeedbackLoop"
  | "runDependencyRunWorkerTick"
>;

interface EventStreamResponse {
  setHeader(name: string, value: string): void;
  write(chunk: string): void;
  end(): void;
  on?(event: "close", listener: () => void): void;
}

export class DependencyExecutionController {
  constructor(private readonly execution: DependencyRunPreviewPort) {}

  async previewDependencyRun(
    body: DependencyRunPreviewRequestDto,
  ): Promise<DependencyRunPreviewOutput> {
    return await this.execution.previewDependencyRun(body);
  }

  async dispatchDependencyRun(
    body: DependencyRunDispatchRequestDto,
  ): Promise<DependencyRunDispatchOutput> {
    return await this.execution.dispatchDependencyRun(body);
  }

  async loadDependencyRunLiveFeedback(
    body: DependencyRunLiveFeedbackRequestDto,
  ): Promise<DependencyRunLiveFeedbackOutput> {
    return await this.execution.loadDependencyRunLiveFeedback(body);
  }

  async streamDependencyRunLiveFeedback(
    query: DependencyRunLiveFeedbackStreamQueryDto,
    response: EventStreamResponse,
  ): Promise<void> {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    let closed = false;
    response.on?.("close", () => {
      closed = true;
    });

    do {
      const feedback = await this.execution.loadDependencyRunLiveFeedback(query);
      response.write(`event: feedback\ndata: ${JSON.stringify(feedback)}\n\n`);
      if (closed || streamOnce(query.once) || !feedback.executorStatus.active) break;
      await sleep(streamPollMs(query.pollMs));
    } while (!closed);

    response.end();
  }

  async recordDependencyRunLifecycleEvent(
    body: DependencyRunLifecycleEventRequestDto,
  ): Promise<DependencyRunLifecycleEventOutput> {
    return await this.execution.recordDependencyRunLifecycleEvent(body);
  }

  async runDependencyRunWorkerTick(
    body: DependencyRunWorkerTickRequestDto,
  ): Promise<DependencyRunWorkerTickOutput> {
    return await this.execution.runDependencyRunWorkerTick(body);
  }

  async runAutomatedFeedbackLoop(
    body: AutomatedFeedbackLoopRequestDto,
  ): Promise<AutomatedFeedbackLoopOutput> {
    return await this.execution.runAutomatedFeedbackLoop(body);
  }

  async recordTaskQaReview(
    body: TaskQaReviewRequestDto,
  ): Promise<TaskQaReviewOutput> {
    return await this.execution.recordTaskQaReview(body);
  }
}

IsString()(DependencyRunPreviewRequestDto.prototype, "mode");
MinLength(1)(DependencyRunPreviewRequestDto.prototype, "mode");
IsArray()(DependencyRunPreviewRequestDto.prototype, "targetTaskIds");
IsArray()(DependencyRunPreviewRequestDto.prototype, "tasks");
IsOptional()(DependencyRunPreviewRequestDto.prototype, "tasks");
IsString()(DependencyRunPreviewRequestDto.prototype, "projectId");
IsOptional()(DependencyRunPreviewRequestDto.prototype, "projectId");
IsString()(DependencyRunPreviewRequestDto.prototype, "traceId");
IsOptional()(DependencyRunPreviewRequestDto.prototype, "traceId");
for (const property of ["workspaceId", "workspaceSlug", "workspaceName", "projectId", "projectSlug", "projectName", "mode", "agent"] as const) {
  IsString()(DependencyRunDispatchRequestDto.prototype, property);
  MinLength(1)(DependencyRunDispatchRequestDto.prototype, property);
}
IsArray()(DependencyRunDispatchRequestDto.prototype, "targetTaskIds");
for (const property of ["traceId", "model", "prompt"] as const) {
  IsString()(DependencyRunDispatchRequestDto.prototype, property);
  IsOptional()(DependencyRunDispatchRequestDto.prototype, property);
}
IsString()(DependencyRunLiveFeedbackRequestDto.prototype, "projectId");
MinLength(1)(DependencyRunLiveFeedbackRequestDto.prototype, "projectId");
for (const property of ["traceId", "runGroupId", "runId", "taskId"] as const) {
  IsString()(DependencyRunLiveFeedbackRequestDto.prototype, property);
  IsOptional()(DependencyRunLiveFeedbackRequestDto.prototype, property);
}
IsString()(DependencyRunLiveFeedbackStreamQueryDto.prototype, "once");
IsOptional()(DependencyRunLiveFeedbackStreamQueryDto.prototype, "once");
IsString()(DependencyRunLiveFeedbackStreamQueryDto.prototype, "pollMs");
IsOptional()(DependencyRunLiveFeedbackStreamQueryDto.prototype, "pollMs");
for (const property of ["projectId", "runId", "status", "domain", "mutationType", "targetKind", "targetId"] as const) {
  IsString()(DependencyRunLifecycleEventRequestDto.prototype, property);
  MinLength(1)(DependencyRunLifecycleEventRequestDto.prototype, property);
}
for (const property of ["traceId", "taskId", "agentId", "taskLineageId", "summary", "output"] as const) {
  IsString()(DependencyRunLifecycleEventRequestDto.prototype, property);
  IsOptional()(DependencyRunLifecycleEventRequestDto.prototype, property);
}
IsObject()(DependencyRunLifecycleEventRequestDto.prototype, "payload");
IsOptional()(DependencyRunLifecycleEventRequestDto.prototype, "payload");
IsString()(DependencyRunWorkerTickRequestDto.prototype, "projectId");
MinLength(1)(DependencyRunWorkerTickRequestDto.prototype, "projectId");
for (const property of ["traceId", "runGroupId", "workerId", "cwd"] as const) {
  IsString()(DependencyRunWorkerTickRequestDto.prototype, property);
  IsOptional()(DependencyRunWorkerTickRequestDto.prototype, property);
}
IsArray()(DependencyRunWorkerTickRequestDto.prototype, "copyToWorktree");
IsOptional()(DependencyRunWorkerTickRequestDto.prototype, "copyToWorktree");
IsString()(AutomatedFeedbackLoopRequestDto.prototype, "projectId");
MinLength(1)(AutomatedFeedbackLoopRequestDto.prototype, "projectId");
for (const property of [
  "workspaceId",
  "workspaceSlug",
  "workspaceName",
  "projectSlug",
  "projectName",
  "traceId",
  "runGroupId",
  "reviewType",
  "reviewerAgent",
  "feedbackAgent",
  "feedbackModel",
  "workerId",
  "cwd",
] as const) {
  IsString()(AutomatedFeedbackLoopRequestDto.prototype, property);
  IsOptional()(AutomatedFeedbackLoopRequestDto.prototype, property);
}
IsArray()(AutomatedFeedbackLoopRequestDto.prototype, "copyToWorktree");
IsOptional()(AutomatedFeedbackLoopRequestDto.prototype, "copyToWorktree");
IsOptional()(AutomatedFeedbackLoopRequestDto.prototype, "maxIterations");
for (const property of ["workspaceId", "workspaceSlug", "workspaceName", "projectId", "projectSlug", "projectName", "taskId", "reviewType", "reviewText"] as const) {
  IsString()(TaskQaReviewRequestDto.prototype, property);
  MinLength(1)(TaskQaReviewRequestDto.prototype, property);
}
for (const property of ["runId", "traceId", "reviewerAgent", "feedbackAgent", "feedbackModel", "baseline", "checkpointId", "summary"] as const) {
  IsString()(TaskQaReviewRequestDto.prototype, property);
  IsOptional()(TaskQaReviewRequestDto.prototype, property);
}

const previewDependencyRunDescriptor = Object.getOwnPropertyDescriptor(
  DependencyExecutionController.prototype,
  "previewDependencyRun",
);
const dispatchDependencyRunDescriptor = Object.getOwnPropertyDescriptor(
  DependencyExecutionController.prototype,
  "dispatchDependencyRun",
);
const loadDependencyRunLiveFeedbackDescriptor = Object.getOwnPropertyDescriptor(
  DependencyExecutionController.prototype,
  "loadDependencyRunLiveFeedback",
);
const streamDependencyRunLiveFeedbackDescriptor = Object.getOwnPropertyDescriptor(
  DependencyExecutionController.prototype,
  "streamDependencyRunLiveFeedback",
);
const recordDependencyRunLifecycleEventDescriptor = Object.getOwnPropertyDescriptor(
  DependencyExecutionController.prototype,
  "recordDependencyRunLifecycleEvent",
);
const runDependencyRunWorkerTickDescriptor = Object.getOwnPropertyDescriptor(
  DependencyExecutionController.prototype,
  "runDependencyRunWorkerTick",
);
const runAutomatedFeedbackLoopDescriptor = Object.getOwnPropertyDescriptor(
  DependencyExecutionController.prototype,
  "runAutomatedFeedbackLoop",
);
const recordTaskQaReviewDescriptor = Object.getOwnPropertyDescriptor(
  DependencyExecutionController.prototype,
  "recordTaskQaReview",
);

if (
  !previewDependencyRunDescriptor ||
  !dispatchDependencyRunDescriptor ||
  !loadDependencyRunLiveFeedbackDescriptor ||
  !streamDependencyRunLiveFeedbackDescriptor ||
  !recordDependencyRunLifecycleEventDescriptor ||
  !runDependencyRunWorkerTickDescriptor ||
  !runAutomatedFeedbackLoopDescriptor ||
  !recordTaskQaReviewDescriptor
) {
  throw new Error("DependencyExecutionController route descriptor is missing");
}

Inject(DependencyRunService)(DependencyExecutionController, undefined, 0);
Controller("workflows/execution")(DependencyExecutionController);
ApiTags("dependency-execution")(DependencyExecutionController);

Post("dependency-run/preview")(
  DependencyExecutionController.prototype,
  "previewDependencyRun",
  previewDependencyRunDescriptor,
);
Body()(DependencyExecutionController.prototype, "previewDependencyRun", 0);
ApiOperation({ summary: "Preview dependency-aware dependency disclosure before running tasks" })(
  DependencyExecutionController.prototype,
  "previewDependencyRun",
  previewDependencyRunDescriptor,
);
ApiBody({ type: DependencyRunPreviewRequestDto })(
  DependencyExecutionController.prototype,
  "previewDependencyRun",
  previewDependencyRunDescriptor,
);
ApiOkResponse({ description: "Workflow dependency-run preview" })(
  DependencyExecutionController.prototype,
  "previewDependencyRun",
  previewDependencyRunDescriptor,
);

Post("dependency-run/dispatch")(
  DependencyExecutionController.prototype,
  "dispatchDependencyRun",
  dispatchDependencyRunDescriptor,
);
Body()(DependencyExecutionController.prototype, "dispatchDependencyRun", 0);
ApiOperation({ summary: "Dispatch dependency-ordered task runs through the cycle execution model" })(
  DependencyExecutionController.prototype,
  "dispatchDependencyRun",
  dispatchDependencyRunDescriptor,
);
ApiBody({ type: DependencyRunDispatchRequestDto })(
  DependencyExecutionController.prototype,
  "dispatchDependencyRun",
  dispatchDependencyRunDescriptor,
);
ApiOkResponse({ description: "Workflow dependency-run dispatch" })(
  DependencyExecutionController.prototype,
  "dispatchDependencyRun",
  dispatchDependencyRunDescriptor,
);

Post("dependency-run/live-feedback")(
  DependencyExecutionController.prototype,
  "loadDependencyRunLiveFeedback",
  loadDependencyRunLiveFeedbackDescriptor,
);
Body()(DependencyExecutionController.prototype, "loadDependencyRunLiveFeedback", 0);
ApiOperation({ summary: "Load dependency-aware live dependency-run feedback from run audit events" })(
  DependencyExecutionController.prototype,
  "loadDependencyRunLiveFeedback",
  loadDependencyRunLiveFeedbackDescriptor,
);
ApiBody({ type: DependencyRunLiveFeedbackRequestDto })(
  DependencyExecutionController.prototype,
  "loadDependencyRunLiveFeedback",
  loadDependencyRunLiveFeedbackDescriptor,
);
ApiOkResponse({ description: "Workflow live run feedback" })(
  DependencyExecutionController.prototype,
  "loadDependencyRunLiveFeedback",
  loadDependencyRunLiveFeedbackDescriptor,
);

Get("dependency-run/live-feedback/stream")(
  DependencyExecutionController.prototype,
  "streamDependencyRunLiveFeedback",
  streamDependencyRunLiveFeedbackDescriptor,
);
Query()(DependencyExecutionController.prototype, "streamDependencyRunLiveFeedback", 0);
Res()(DependencyExecutionController.prototype, "streamDependencyRunLiveFeedback", 1);
ApiOperation({ summary: "Stream dependency-run feedback events for live run supervision" })(
  DependencyExecutionController.prototype,
  "streamDependencyRunLiveFeedback",
  streamDependencyRunLiveFeedbackDescriptor,
);
ApiOkResponse({ description: "Workflow live run feedback event stream" })(
  DependencyExecutionController.prototype,
  "streamDependencyRunLiveFeedback",
  streamDependencyRunLiveFeedbackDescriptor,
);

Post("dependency-run/lifecycle-event")(
  DependencyExecutionController.prototype,
  "recordDependencyRunLifecycleEvent",
  recordDependencyRunLifecycleEventDescriptor,
);
Body()(DependencyExecutionController.prototype, "recordDependencyRunLifecycleEvent", 0);
ApiOperation({ summary: "Record worker lifecycle status and output for a dependency run" })(
  DependencyExecutionController.prototype,
  "recordDependencyRunLifecycleEvent",
  recordDependencyRunLifecycleEventDescriptor,
);
ApiBody({ type: DependencyRunLifecycleEventRequestDto })(
  DependencyExecutionController.prototype,
  "recordDependencyRunLifecycleEvent",
  recordDependencyRunLifecycleEventDescriptor,
);
ApiOkResponse({ description: "Workflow run lifecycle event" })(
  DependencyExecutionController.prototype,
  "recordDependencyRunLifecycleEvent",
  recordDependencyRunLifecycleEventDescriptor,
);

Post("dependency-run/worker-tick")(
  DependencyExecutionController.prototype,
  "runDependencyRunWorkerTick",
  runDependencyRunWorkerTickDescriptor,
);
Body()(DependencyExecutionController.prototype, "runDependencyRunWorkerTick", 0);
ApiOperation({ summary: "Claim and execute one queued dependency run worker job" })(
  DependencyExecutionController.prototype,
  "runDependencyRunWorkerTick",
  runDependencyRunWorkerTickDescriptor,
);
ApiBody({ type: DependencyRunWorkerTickRequestDto })(
  DependencyExecutionController.prototype,
  "runDependencyRunWorkerTick",
  runDependencyRunWorkerTickDescriptor,
);
ApiOkResponse({ description: "Dependency-run worker tick result" })(
  DependencyExecutionController.prototype,
  "runDependencyRunWorkerTick",
  runDependencyRunWorkerTickDescriptor,
);

Post("dependency-run/automated-feedback-loop")(
  DependencyExecutionController.prototype,
  "runAutomatedFeedbackLoop",
  runAutomatedFeedbackLoopDescriptor,
);
Body()(DependencyExecutionController.prototype, "runAutomatedFeedbackLoop", 0);
ApiOperation({ summary: "Run automated feedback loops for dependency execution" })(
  DependencyExecutionController.prototype,
  "runAutomatedFeedbackLoop",
  runAutomatedFeedbackLoopDescriptor,
);
ApiBody({ type: AutomatedFeedbackLoopRequestDto })(
  DependencyExecutionController.prototype,
  "runAutomatedFeedbackLoop",
  runAutomatedFeedbackLoopDescriptor,
);
ApiOkResponse({ description: "Automated feedback loop result" })(
  DependencyExecutionController.prototype,
  "runAutomatedFeedbackLoop",
  runAutomatedFeedbackLoopDescriptor,
);

Post("qa-review/record")(
  DependencyExecutionController.prototype,
  "recordTaskQaReview",
  recordTaskQaReviewDescriptor,
);
Body()(DependencyExecutionController.prototype, "recordTaskQaReview", 0);
ApiOperation({ summary: "Record task review-derived task QA review verdicts" })(
  DependencyExecutionController.prototype,
  "recordTaskQaReview",
  recordTaskQaReviewDescriptor,
);
ApiBody({ type: TaskQaReviewRequestDto })(
  DependencyExecutionController.prototype,
  "recordTaskQaReview",
  recordTaskQaReviewDescriptor,
);
ApiOkResponse({ description: "Workflow QA review result" })(
  DependencyExecutionController.prototype,
  "recordTaskQaReview",
  recordTaskQaReviewDescriptor,
);

function streamOnce(value: string | boolean | null | undefined): boolean {
  return value === true || value === "1" || value === "true";
}

function streamPollMs(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value ?? "1000", 10);
  return Number.isInteger(parsed) && parsed >= 100 && parsed <= 30_000 ? parsed : 1000;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
