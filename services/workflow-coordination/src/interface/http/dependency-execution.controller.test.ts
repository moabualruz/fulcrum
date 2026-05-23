import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import {
  DependencyExecutionController,
  DependencyRunDispatchRequestDto,
  DependencyRunLifecycleEventRequestDto,
  DependencyRunLiveFeedbackRequestDto,
  DependencyRunLiveFeedbackStreamQueryDto,
  DependencyRunPreviewRequestDto,
  DependencyRunWorkerTickRequestDto,
  AutomatedFeedbackLoopRequestDto,
  TaskQaReviewRequestDto,
} from "@workflow-coordination/interface/http/dependency-execution.controller.ts";
import {
  DependencyRunService,
  type AutomatedFeedbackLoopOutput,
  type DependencyRunDispatchOutput,
  type DependencyRunLifecycleEventOutput,
  type DependencyRunLiveFeedbackOutput,
  type DependencyRunPreviewOutput,
  type DependencyRunWorkerTickOutput,
  type TaskQaReviewOutput,
} from "@workflow-coordination/application/dependency-execution.service.ts";
import { WorkflowCycleModule } from "@workflow-coordination/interface/http/workflow-cycle.module.ts";

function validDependencyPreviewInput(): DependencyRunPreviewRequestDto {
  return Object.assign(new DependencyRunPreviewRequestDto(), {
    mode: "task",
    traceId: "trace-execution-api",
    targetTaskIds: ["A"],
    tasks: [
      {
        id: "A",
        title: "Run selected task",
        column: "todo",
        dependencies: { blocks: [], blocked_by: ["B"] },
      },
      {
        id: "B",
        title: "Prepare dependency",
        column: "in_progress",
        dependencies: { blocks: ["A"], blocked_by: [] },
      },
    ],
  });
}

describe("Dependency execution Nest controller", () => {
  test("is wired as a Nest API controller on the workflows module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, WorkflowCycleModule) as unknown[];

    expect(controllers).toContain(DependencyExecutionController);
    expect(Reflect.getMetadata(PATH_METADATA, DependencyExecutionController)).toBe("workflows/execution");
    expect(
      Reflect.getMetadata(PATH_METADATA, DependencyExecutionController.prototype.previewDependencyRun),
    ).toBe("dependency-run/preview");
    expect(
      Reflect.getMetadata(METHOD_METADATA, DependencyExecutionController.prototype.previewDependencyRun),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata(PATH_METADATA, DependencyExecutionController.prototype.dispatchDependencyRun),
    ).toBe("dependency-run/dispatch");
    expect(
      Reflect.getMetadata(METHOD_METADATA, DependencyExecutionController.prototype.dispatchDependencyRun),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata(PATH_METADATA, DependencyExecutionController.prototype.loadDependencyRunLiveFeedback),
    ).toBe("dependency-run/live-feedback");
    expect(
      Reflect.getMetadata(METHOD_METADATA, DependencyExecutionController.prototype.loadDependencyRunLiveFeedback),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata(PATH_METADATA, DependencyExecutionController.prototype.streamDependencyRunLiveFeedback),
    ).toBe("dependency-run/live-feedback/stream");
    expect(
      Reflect.getMetadata(METHOD_METADATA, DependencyExecutionController.prototype.streamDependencyRunLiveFeedback),
    ).toBe(RequestMethod.GET);
    expect(
      Reflect.getMetadata(PATH_METADATA, DependencyExecutionController.prototype.recordDependencyRunLifecycleEvent),
    ).toBe("dependency-run/lifecycle-event");
    expect(
      Reflect.getMetadata(METHOD_METADATA, DependencyExecutionController.prototype.recordDependencyRunLifecycleEvent),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata(PATH_METADATA, DependencyExecutionController.prototype.runDependencyRunWorkerTick),
    ).toBe("dependency-run/worker-tick");
    expect(
      Reflect.getMetadata(METHOD_METADATA, DependencyExecutionController.prototype.runDependencyRunWorkerTick),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata(PATH_METADATA, DependencyExecutionController.prototype.runAutomatedFeedbackLoop),
    ).toBe("dependency-run/automated-feedback-loop");
    expect(
      Reflect.getMetadata(METHOD_METADATA, DependencyExecutionController.prototype.runAutomatedFeedbackLoop),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata(PATH_METADATA, DependencyExecutionController.prototype.recordTaskQaReview),
    ).toBe("qa-review/record");
    expect(
      Reflect.getMetadata(METHOD_METADATA, DependencyExecutionController.prototype.recordTaskQaReview),
    ).toBe(RequestMethod.POST);
  });

  test("delegates dependency preview to the server-owned execution service", async () => {
    const input = validDependencyPreviewInput();
    const preview: DependencyRunPreviewOutput = {
      mode: "task",
      traceId: input.traceId,
      targetTaskIds: ["A"],
      orderedTaskIds: ["B", "A"],
      tasks: [],
      omittedTaskIds: [],
      missingTaskIds: [],
      warnings: ["Target A requires 1 prerequisite task(s) before it runs."],
      requiresDisclosure: true,
      blocked: false,
    };
    const service = {
      seen: undefined as DependencyRunPreviewRequestDto | undefined,
      async previewDependencyRun(body: DependencyRunPreviewRequestDto) {
        this.seen = body;
        return preview;
      },
      async dispatchDependencyRun() {
        throw new Error("unexpected dispatch call");
      },
      async loadDependencyRunLiveFeedback() {
        throw new Error("unexpected live feedback call");
      },
      async recordDependencyRunLifecycleEvent() {
        throw new Error("unexpected lifecycle event call");
      },
      async runDependencyRunWorkerTick() {
        throw new Error("unexpected worker tick call");
      },
      async runAutomatedFeedbackLoop() {
        throw new Error("unexpected automated feedback loop call");
      },
      async recordTaskQaReview() {
        throw new Error("unexpected QA review call");
      },
    };
    const controller = new DependencyExecutionController(service);

    await expect(controller.previewDependencyRun(input)).resolves.toBe(preview);
    expect(service.seen).toBe(input);
  });

  test("delegates dependency dispatch to the server-owned execution service", async () => {
    const input = Object.assign(new DependencyRunDispatchRequestDto(), {
      workspaceId: "workspace-execution-api",
      workspaceSlug: "execution-api",
      workspaceName: "Execution API",
      projectId: "project-execution-api",
      projectSlug: "execution-api",
      projectName: "Execution Project",
      mode: "task",
      traceId: "trace-execution-api",
      targetTaskIds: ["A"],
      agent: "codex",
      model: "gpt-5.4",
      prompt: "Run the dependency tree.",
    });
    const dispatched: DependencyRunDispatchOutput = {
      runGroupId: "trace-execution-api",
      preview: {
        mode: "task",
        traceId: "trace-execution-api",
        targetTaskIds: ["A"],
        orderedTaskIds: ["B", "A"],
        tasks: [],
        omittedTaskIds: [],
        missingTaskIds: [],
        warnings: [],
        requiresDisclosure: true,
        blocked: false,
      },
      scheduledRuns: [
        {
          id: "run-trace-execution-api-1-b",
          taskId: "B",
          agent: "codex",
          status: "queued",
          queuePosition: 1,
          dependencyIds: [],
        },
        {
          id: "run-trace-execution-api-2-a",
          taskId: "A",
          agent: "codex",
          status: "queued",
          queuePosition: 2,
          dependencyIds: ["B"],
        },
      ],
      skippedTasks: [],
      warnings: [],
    };
    const service = {
      seen: undefined as DependencyRunDispatchRequestDto | undefined,
      async previewDependencyRun() {
        throw new Error("unexpected preview call");
      },
      async dispatchDependencyRun(body: DependencyRunDispatchRequestDto) {
        this.seen = body;
        return dispatched;
      },
      async loadDependencyRunLiveFeedback() {
        throw new Error("unexpected live feedback call");
      },
      async recordDependencyRunLifecycleEvent() {
        throw new Error("unexpected lifecycle event call");
      },
      async runDependencyRunWorkerTick() {
        throw new Error("unexpected worker tick call");
      },
      async runAutomatedFeedbackLoop() {
        throw new Error("unexpected automated feedback loop call");
      },
      async recordTaskQaReview() {
        throw new Error("unexpected QA review call");
      },
    };
    const controller = new DependencyExecutionController(service);

    await expect(controller.dispatchDependencyRun(input)).resolves.toBe(dispatched);
    expect(service.seen).toBe(input);
  });

  test("delegates dependency-run live feedback to the server-owned execution service", async () => {
    const input = Object.assign(new DependencyRunLiveFeedbackRequestDto(), {
      projectId: "project-execution-api",
      traceId: "trace-execution-api",
    });
    const output: DependencyRunLiveFeedbackOutput = {
      projectId: "project-execution-api",
      traceId: "trace-execution-api",
      runGroupId: "trace-execution-api",
      fetchedAt: "2026-05-13T00:00:00.000Z",
      executorStatus: {
        queuedTaskCount: 1,
        runningTaskCount: 0,
        succeededTaskCount: 1,
        failedTaskCount: 0,
        blockedTaskCount: 0,
        inReviewCount: 0,
        active: true,
        lastActivityAt: "2026-05-13T00:00:00.000Z",
      },
      runs: [],
      events: [],
      latestEvent: null,
    };
    const service = {
      seen: undefined as DependencyRunLiveFeedbackRequestDto | undefined,
      async previewDependencyRun() {
        throw new Error("unexpected preview call");
      },
      async dispatchDependencyRun() {
        throw new Error("unexpected dispatch call");
      },
      async loadDependencyRunLiveFeedback(body: DependencyRunLiveFeedbackRequestDto) {
        this.seen = body;
        return output;
      },
      async recordDependencyRunLifecycleEvent() {
        throw new Error("unexpected lifecycle event call");
      },
      async runDependencyRunWorkerTick() {
        throw new Error("unexpected worker tick call");
      },
      async runAutomatedFeedbackLoop() {
        throw new Error("unexpected automated feedback loop call");
      },
      async recordTaskQaReview() {
        throw new Error("unexpected QA review call");
      },
    };
    const controller = new DependencyExecutionController(service);

    await expect(controller.loadDependencyRunLiveFeedback(input)).resolves.toBe(output);
    expect(service.seen).toBe(input);
  });

  test("streams dependency-run live feedback as server-sent events", async () => {
    const input = Object.assign(new DependencyRunLiveFeedbackStreamQueryDto(), {
      projectId: "project-execution-api",
      traceId: "trace-execution-api",
      once: "1",
    });
    const output: DependencyRunLiveFeedbackOutput = {
      projectId: "project-execution-api",
      traceId: "trace-execution-api",
      runGroupId: "trace-execution-api",
      fetchedAt: "2026-05-13T00:00:00.000Z",
      executorStatus: {
        queuedTaskCount: 0,
        runningTaskCount: 0,
        succeededTaskCount: 1,
        failedTaskCount: 0,
        blockedTaskCount: 0,
        inReviewCount: 0,
        active: false,
        lastActivityAt: "2026-05-13T00:00:00.000Z",
      },
      runs: [],
      events: [],
      latestEvent: null,
    };
    const service = {
      seen: undefined as DependencyRunLiveFeedbackStreamQueryDto | undefined,
      async previewDependencyRun() {
        throw new Error("unexpected preview call");
      },
      async dispatchDependencyRun() {
        throw new Error("unexpected dispatch call");
      },
      async loadDependencyRunLiveFeedback(body: DependencyRunLiveFeedbackStreamQueryDto) {
        this.seen = body;
        return output;
      },
      async recordDependencyRunLifecycleEvent() {
        throw new Error("unexpected lifecycle event call");
      },
      async runDependencyRunWorkerTick() {
        throw new Error("unexpected worker tick call");
      },
      async runAutomatedFeedbackLoop() {
        throw new Error("unexpected automated feedback loop call");
      },
      async recordTaskQaReview() {
        throw new Error("unexpected QA review call");
      },
    };
    const headers: Record<string, string> = {};
    const chunks: string[] = [];
    const response = {
      ended: false,
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
      write(chunk: string) {
        chunks.push(chunk);
      },
      end() {
        this.ended = true;
      },
      on() {},
    };
    const controller = new DependencyExecutionController(service);

    await controller.streamDependencyRunLiveFeedback(input, response);

    expect(service.seen).toBe(input);
    expect(headers).toMatchObject({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Fulcrum-Reconnect": "send-last-event-id",
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("event: dependency-run.feedback");
    const event = JSON.parse(chunks[0]!.match(/^data: (.*)$/m)?.[1] ?? "{}");
    expect(event).toMatchObject({
      type: "dependency-run.feedback",
      traceId: "trace-execution-api",
      payload: output,
    });
    expect(response.ended).toBe(true);
  });

  test("delegates dependency-run lifecycle events to the server-owned execution service", async () => {
    const input = Object.assign(new DependencyRunLifecycleEventRequestDto(), {
      projectId: "project-execution-api",
      traceId: "trace-execution-api",
      runId: "run-execution-api",
      taskId: "task-execution-api",
      status: "running",
      domain: "executor",
      mutationType: "agent_run_started",
      targetKind: "task",
      targetId: "task-execution-api",
      agentId: "codex",
      taskLineageId: "trace-execution-api",
      summary: "Started task",
      output: "booting worker",
    });
    const output: DependencyRunLifecycleEventOutput = {
      run: {
        id: "run-execution-api",
        taskId: "task-execution-api",
        traceId: "trace-execution-api",
        status: "running",
      },
      event: {
        id: "event-trace-execution-api-run-execution-api-2-agent-run-started",
        runId: "run-execution-api",
        taskId: "task-execution-api",
        traceId: "trace-execution-api",
        sequence: 2,
        domain: "executor",
        mutationType: "agent_run_started",
        targetKind: "task",
        targetId: "task-execution-api",
        agentId: "codex",
        taskLineageId: "trace-execution-api",
        summary: "Started task",
        output: "booting worker",
        createdAt: "2026-05-13T00:00:00.000Z",
        payload: {},
      },
    };
    const service = {
      seen: undefined as DependencyRunLifecycleEventRequestDto | undefined,
      async previewDependencyRun() {
        throw new Error("unexpected preview call");
      },
      async dispatchDependencyRun() {
        throw new Error("unexpected dispatch call");
      },
      async loadDependencyRunLiveFeedback() {
        throw new Error("unexpected live feedback call");
      },
      async recordDependencyRunLifecycleEvent(body: DependencyRunLifecycleEventRequestDto) {
        this.seen = body;
        return output;
      },
      async runDependencyRunWorkerTick() {
        throw new Error("unexpected worker tick call");
      },
      async runAutomatedFeedbackLoop() {
        throw new Error("unexpected automated feedback loop call");
      },
      async recordTaskQaReview() {
        throw new Error("unexpected QA review call");
      },
    };
    const controller = new DependencyExecutionController(service);

    await expect(controller.recordDependencyRunLifecycleEvent(input)).resolves.toBe(output);
    expect(service.seen).toBe(input);
  });

  test("delegates dependency-run worker ticks to the server-owned execution service", async () => {
    const input = Object.assign(new DependencyRunWorkerTickRequestDto(), {
      projectId: "project-execution-api",
      traceId: "trace-execution-api",
      workerId: "worker-api",
    });
    const output: DependencyRunWorkerTickOutput = {
      projectId: "project-execution-api",
      traceId: "trace-execution-api",
      runGroupId: "trace-execution-api",
      workerId: "worker-api",
      processedRun: {
        id: "run-execution-api",
        taskId: "task-execution-api",
        traceId: "trace-execution-api",
        agent: "codex",
        status: "succeeded",
        output: "complete",
        jobId: "job-execution-api",
      },
      skippedReason: null,
      feedback: {
        projectId: "project-execution-api",
        traceId: "trace-execution-api",
        runGroupId: "trace-execution-api",
        fetchedAt: "2026-05-13T00:00:00.000Z",
        executorStatus: {
          queuedTaskCount: 0,
          runningTaskCount: 0,
          succeededTaskCount: 1,
          failedTaskCount: 0,
          blockedTaskCount: 0,
          inReviewCount: 0,
          active: false,
          lastActivityAt: "2026-05-13T00:00:00.000Z",
        },
        runs: [],
        events: [],
        latestEvent: null,
      },
    };
    const service = {
      seen: undefined as DependencyRunWorkerTickRequestDto | undefined,
      async previewDependencyRun() {
        throw new Error("unexpected preview call");
      },
      async dispatchDependencyRun() {
        throw new Error("unexpected dispatch call");
      },
      async loadDependencyRunLiveFeedback() {
        throw new Error("unexpected live feedback call");
      },
      async recordDependencyRunLifecycleEvent() {
        throw new Error("unexpected lifecycle event call");
      },
      async runDependencyRunWorkerTick(body: DependencyRunWorkerTickRequestDto) {
        this.seen = body;
        return output;
      },
      async runAutomatedFeedbackLoop() {
        throw new Error("unexpected automated feedback loop call");
      },
      async recordTaskQaReview() {
        throw new Error("unexpected QA review call");
      },
    };
    const controller = new DependencyExecutionController(service);

    await expect(controller.runDependencyRunWorkerTick(input)).resolves.toBe(output);
    expect(service.seen).toBe(input);
  });

  test("delegates automated feedback loops to the server-owned execution service", async () => {
    const input = Object.assign(new AutomatedFeedbackLoopRequestDto(), {
      workspaceId: "workspace-execution-api",
      workspaceSlug: "execution-api",
      workspaceName: "Execution API",
      projectId: "project-execution-api",
      projectSlug: "execution-api",
      projectName: "Execution Project",
      traceId: "trace-execution-api",
      workerId: "worker-api",
      reviewType: "code",
      feedbackAgent: "codex",
      maxIterations: 3,
    });
    const output: AutomatedFeedbackLoopOutput = {
      projectId: "project-execution-api",
      traceId: "trace-execution-api",
      runGroupId: "trace-execution-api",
      iterations: 1,
      processedRuns: [{ id: "run-execution-api", taskId: "task-execution-api", status: "succeeded", output: "complete" }],
      reviews: [],
      exhausted: true,
      stopReason: "automated_feedback_exhausted",
      feedback: {
        projectId: "project-execution-api",
        traceId: "trace-execution-api",
        runGroupId: "trace-execution-api",
        fetchedAt: "2026-05-13T00:00:00.000Z",
        executorStatus: {
          queuedTaskCount: 0,
          runningTaskCount: 0,
          succeededTaskCount: 1,
          failedTaskCount: 0,
          blockedTaskCount: 0,
          inReviewCount: 0,
          active: false,
          lastActivityAt: "2026-05-13T00:00:00.000Z",
        },
        runs: [],
        events: [],
        latestEvent: null,
      },
    };
    const service = {
      seen: undefined as AutomatedFeedbackLoopRequestDto | undefined,
      async previewDependencyRun() {
        throw new Error("unexpected preview call");
      },
      async dispatchDependencyRun() {
        throw new Error("unexpected dispatch call");
      },
      async loadDependencyRunLiveFeedback() {
        throw new Error("unexpected live feedback call");
      },
      async recordDependencyRunLifecycleEvent() {
        throw new Error("unexpected lifecycle event call");
      },
      async runDependencyRunWorkerTick() {
        throw new Error("unexpected worker tick call");
      },
      async runAutomatedFeedbackLoop(body: AutomatedFeedbackLoopRequestDto) {
        this.seen = body;
        return output;
      },
      async recordTaskQaReview() {
        throw new Error("unexpected QA review call");
      },
    };
    const controller = new DependencyExecutionController(service);

    await expect(controller.runAutomatedFeedbackLoop(input)).resolves.toBe(output);
    expect(service.seen).toBe(input);
  });

  test("delegates QA review recording to the server-owned execution service", async () => {
    const input = Object.assign(new TaskQaReviewRequestDto(), {
      workspaceId: "workspace-execution-api",
      workspaceSlug: "execution-api",
      workspaceName: "Execution API",
      projectId: "project-execution-api",
      projectSlug: "execution-api",
      projectName: "Execution Project",
      taskId: "A",
      traceId: "trace-execution-api",
      reviewType: "code",
      reviewerAgent: "qa-reviewer",
      reviewText: "### Verdict: REVISE\nTie the feedback run to criteria.",
      feedbackAgent: "codex",
      feedbackModel: "gpt-feedback",
    });
    const output: TaskQaReviewOutput = {
      taskId: "A",
      runId: null,
      traceId: "trace-execution-api",
      reviewType: "code",
      reviewerAgent: "qa-reviewer",
      verdict: "REVISE",
      nextAction: "feedback_run_scheduled",
      successCriteria: [{ id: "criterion-1", text: "Criteria preserved" }],
      feedbackRun: { id: "run-feedback", taskId: "A", agent: "codex", status: "queued" },
      recoveryPlan: null,
    };
    const service = {
      seen: undefined as TaskQaReviewRequestDto | undefined,
      async previewDependencyRun() {
        throw new Error("unexpected preview call");
      },
      async dispatchDependencyRun() {
        throw new Error("unexpected dispatch call");
      },
      async loadDependencyRunLiveFeedback() {
        throw new Error("unexpected live feedback call");
      },
      async recordDependencyRunLifecycleEvent() {
        throw new Error("unexpected lifecycle event call");
      },
      async runDependencyRunWorkerTick() {
        throw new Error("unexpected worker tick call");
      },
      async runAutomatedFeedbackLoop() {
        throw new Error("unexpected automated feedback loop call");
      },
      async recordTaskQaReview(body: TaskQaReviewRequestDto) {
        this.seen = body;
        return output;
      },
    };
    const controller = new DependencyExecutionController(service);

    await expect(controller.recordTaskQaReview(input)).resolves.toBe(output);
    expect(service.seen).toBe(input);
  });

  test("keeps dependency preview request validation at the Nest boundary", () => {
    const valid = validDependencyPreviewInput();
    const invalid = Object.assign(new DependencyRunPreviewRequestDto(), {
      mode: "",
      targetTaskIds: undefined,
      tasks: undefined,
    });

    expect(validateSync(valid)).toEqual([]);
    expect(validateSync(invalid).map((error) => error.property).sort()).toEqual([
      "mode",
      "targetTaskIds",
    ]);
    expect(validateSync(Object.assign(new DependencyRunPreviewRequestDto(), {
      mode: "task",
      projectId: "project-1",
      targetTaskIds: ["task-1"],
    }))).toEqual([]);

    const dispatchInvalid = Object.assign(new DependencyRunDispatchRequestDto(), {
      workspaceId: "",
      workspaceSlug: "",
      workspaceName: "",
      projectId: "",
      projectSlug: "",
      projectName: "",
      mode: "",
      targetTaskIds: undefined,
      agent: "",
    });
    expect(validateSync(dispatchInvalid).map((error) => error.property).sort()).toEqual([
      "agent",
      "mode",
      "projectId",
      "projectName",
      "projectSlug",
      "targetTaskIds",
      "workspaceId",
      "workspaceName",
      "workspaceSlug",
    ]);

    const liveFeedbackInvalid = Object.assign(new DependencyRunLiveFeedbackRequestDto(), {
      projectId: "",
    });
    expect(validateSync(liveFeedbackInvalid).map((error) => error.property).sort()).toEqual([
      "projectId",
    ]);

    const lifecycleInvalid = Object.assign(new DependencyRunLifecycleEventRequestDto(), {
      projectId: "",
      runId: "",
      status: "",
      domain: "",
      mutationType: "",
      targetKind: "",
      targetId: "",
    });
    expect(validateSync(lifecycleInvalid).map((error) => error.property).sort()).toEqual([
      "domain",
      "mutationType",
      "projectId",
      "runId",
      "status",
      "targetId",
      "targetKind",
    ]);

    const qaInvalid = Object.assign(new TaskQaReviewRequestDto(), {
      workspaceId: "",
      workspaceSlug: "",
      workspaceName: "",
      projectId: "",
      projectSlug: "",
      projectName: "",
      taskId: "",
      reviewType: "",
      reviewText: "",
    });
    expect(validateSync(qaInvalid).map((error) => error.property).sort()).toEqual([
      "projectId",
      "projectName",
      "projectSlug",
      "reviewText",
      "reviewType",
      "taskId",
      "workspaceId",
      "workspaceName",
      "workspaceSlug",
    ]);

    const workerInvalid = Object.assign(new DependencyRunWorkerTickRequestDto(), {
      projectId: "",
    });
    expect(validateSync(workerInvalid).map((error) => error.property).sort()).toEqual([
      "projectId",
    ]);

    const automatedInvalid = Object.assign(new AutomatedFeedbackLoopRequestDto(), {
      projectId: "",
    });
    expect(validateSync(automatedInvalid).map((error) => error.property).sort()).toEqual([
      "projectId",
    ]);
  });

  test("service builds the dependency disclosure model", async () => {
    const service = new DependencyRunService();

    const result = await service.previewDependencyRun(validDependencyPreviewInput());

    expect(result.traceId).toBe("trace-execution-api");
    expect(result.requiresDisclosure).toBe(true);
    expect(result.orderedTaskIds).toEqual(["B", "A"]);
    expect(result.tasks.map((task) => ({
      id: task.id,
      selected: task.selected,
      dependencyDepth: task.dependencyDepth,
    }))).toEqual([
      { id: "B", selected: false, dependencyDepth: 1 },
      { id: "A", selected: true, dependencyDepth: 0 },
    ]);
    expect(result.warnings).toEqual(["Target A requires 1 prerequisite task(s) before it runs."]);
    expect(result.blocked).toBe(false);
  });
});
