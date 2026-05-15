import { afterEach, describe, expect, mock, test } from "bun:test";
import { Container } from "@needle-di/core";

import { createContext } from "@fulcrum/server/trpc/context.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import { __setTaskApplicationForTest } from "@fulcrum/server/runtime/trpc/routers/tasks.ts";
import type { AppContext } from "@work-management/application/tasks/types.ts";
import type {
  DispatchDependencyRunForTasksInput,
  DispatchDependencyRunForTasksOutput,
  PreviewDependencyRunForTasksInput,
} from "@execution-orchestration/application/dependency-run-actions.ts";
import type {
  DependencyRunLiveFeedbackInput,
  DependencyRunLiveFeedbackOutput,
  DependencyRunWorkerTickInput,
  DependencyRunWorkerTickOutput,
} from "@execution-orchestration/application/dependency-run-live-feedback.ts";
import type {
  RecordTaskQaReviewInput,
  TaskQaReviewOutput,
} from "@execution-orchestration/application/qa-review-actions.ts";
import type {
  AutomatedFeedbackLoopInput,
  AutomatedFeedbackLoopOutput,
} from "@execution-orchestration/application/automated-feedback-loop.ts";
import type { DependencyRunPreview } from "@execution-orchestration/domain/dependency-run-preview.ts";
import {
  dependencyRunLiveFeedbackTopic as liveFeedbackTopicForTasks,
} from "@execution-orchestration/application/dependency-run-live-feedback.ts";
import { getEventBus, resetEventBus } from "@platform-core/application/subscriptions/event-bus.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "99999999-9999-4999-8999-999999999999";
const TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const previewDependencyRunForTasks = mock(async (): Promise<DependencyRunPreview> => ({
  mode: "task",
  traceId: "trace-trpc-preview",
  targetTaskIds: [TASK_ID],
  orderedTaskIds: [TASK_ID],
  tasks: [{
    id: TASK_ID,
    title: "Run task",
    column: "todo",
    selected: true,
    dependencyDepth: 0,
    dependencyIds: [],
    blockers: [],
  }],
  omittedTaskIds: [],
  missingTaskIds: [],
  warnings: [],
  requiresDisclosure: true,
  blocked: false,
}));
const dispatchDependencyRunForTasks = mock(async (): Promise<DispatchDependencyRunForTasksOutput> => ({
  runGroupId: "trace-trpc-dispatch",
  preview: {
    mode: "task",
    traceId: "trace-trpc-dispatch",
    targetTaskIds: [TASK_ID],
    orderedTaskIds: [TASK_ID],
    tasks: [{
      id: TASK_ID,
      title: "Run task",
      column: "todo",
      selected: true,
      dependencyDepth: 0,
      dependencyIds: [],
      blockers: [],
    }],
    omittedTaskIds: [],
    missingTaskIds: [],
    warnings: [],
    requiresDisclosure: true,
    blocked: false,
  },
  scheduledRuns: [{
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    taskId: TASK_ID,
    agent: "codex",
    status: "queued",
    queuePosition: 1,
    dependencyIds: [],
  }],
  skippedTasks: [],
  warnings: [],
}));
const loadDependencyRunLiveFeedbackForTasks = mock(async (): Promise<DependencyRunLiveFeedbackOutput> => ({
  projectId: PROJECT_ID,
  traceId: "trace-trpc-feedback",
  runGroupId: "trace-trpc-feedback",
  fetchedAt: "2026-05-13T00:00:00.000Z",
  executorStatus: {
    queuedTaskCount: 1,
    runningTaskCount: 0,
    succeededTaskCount: 0,
    failedTaskCount: 0,
    blockedTaskCount: 0,
    inReviewCount: 0,
    active: true,
    lastActivityAt: "2026-05-13T00:00:00.000Z",
  },
  runs: [{
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    taskId: TASK_ID,
    traceId: "trace-trpc-feedback",
    status: "queued",
    queuePosition: 1,
    dependencyIds: [],
    latestEventSummary: null,
    lastActivityAt: "2026-05-13T00:00:00.000Z",
  }],
  events: [],
  latestEvent: null,
}));
const runNextDependencyRunWorkerTickForTasks = mock(async (): Promise<DependencyRunWorkerTickOutput> => ({
  projectId: PROJECT_ID,
  traceId: "trace-trpc-worker",
  runGroupId: "trace-trpc-worker",
  workerId: "worker-trpc",
  processedRun: {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    taskId: TASK_ID,
    traceId: "trace-trpc-worker",
    agent: "codex",
    status: "succeeded",
    output: "worker complete",
    jobId: "job-trpc",
  },
  skippedReason: null,
  feedback: {
    projectId: PROJECT_ID,
    traceId: "trace-trpc-worker",
    runGroupId: "trace-trpc-worker",
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
    runs: [{
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      taskId: TASK_ID,
      traceId: "trace-trpc-worker",
      status: "succeeded",
      queuePosition: 1,
      dependencyIds: [],
      latestEventSummary: "Agent run completed",
      lastActivityAt: "2026-05-13T00:00:00.000Z",
    }],
    events: [],
    latestEvent: null,
  },
}));
const recordTaskQaReview = mock(async (): Promise<TaskQaReviewOutput> => ({
  taskId: TASK_ID,
  runId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  traceId: "trace-trpc-qa",
  reviewType: "code",
  reviewerAgent: "qa-reviewer",
  verdict: "REVISE",
  nextAction: "feedback_run_scheduled",
  successCriteria: [{ id: "criterion-1", text: "Dependency disclosure is verified." }],
  feedbackRun: {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    taskId: TASK_ID,
    agent: "codex",
    status: "queued",
  },
  recoveryPlan: null,
  reviewFeed: {
    mode: "reviewer-agent",
    refreshable: true,
    fetchedAt: "2026-05-13T00:00:00.000Z",
    summary: { verdict: "REVISE", summary: "code review REVISE" },
    items: [],
  },
}));
const runAutomatedFeedbackLoopForTasks = mock(async (): Promise<AutomatedFeedbackLoopOutput> => ({
  projectId: PROJECT_ID,
  traceId: "trace-trpc-loop",
  runGroupId: "trace-trpc-loop",
  iterations: 2,
  processedRuns: [{
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    taskId: TASK_ID,
    status: "succeeded",
    output: "worker complete",
  }],
  reviews: [await recordTaskQaReview()],
  exhausted: true,
  stopReason: "automated_feedback_exhausted",
  feedback: {
    projectId: PROJECT_ID,
    traceId: "trace-trpc-loop",
    runGroupId: "trace-trpc-loop",
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
    runs: [{
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      taskId: TASK_ID,
      traceId: "trace-trpc-loop",
      status: "succeeded",
      queuePosition: 1,
      dependencyIds: [],
      latestEventSummary: "Agent run completed",
      lastActivityAt: "2026-05-13T00:00:00.000Z",
    }],
    events: [],
    latestEvent: null,
  },
}));

let restoreApplication: (() => void) | null = null;

afterEach(() => {
  restoreApplication?.();
  restoreApplication = null;
  resetEventBus();
  previewDependencyRunForTasks.mockClear();
  dispatchDependencyRunForTasks.mockClear();
  loadDependencyRunLiveFeedbackForTasks.mockClear();
  runNextDependencyRunWorkerTickForTasks.mockClear();
  recordTaskQaReview.mockClear();
  runAutomatedFeedbackLoopForTasks.mockClear();
});

function caller() {
  restoreApplication = __setTaskApplicationForTest({
    previewDependencyRunForTasks,
    dispatchDependencyRunForTasks,
    loadDependencyRunLiveFeedbackForTasks,
    runNextDependencyRunWorkerTickForTasks,
    recordTaskQaReview,
    runAutomatedFeedbackLoopForTasks,
  });
  const createCaller = t.createCallerFactory(appRouter);
  return createCaller(createContext({
    session: {
      id: "session",
      token: "session",
      userId: USER_ID,
      orgId: ORG_ID,
      activeOrganizationId: ORG_ID,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    } as never,
    orgId: ORG_ID,
    userId: USER_ID,
    em: { marker: "trpc-em" } as never,
    container: null,
  }));
}

async function collectFeedbackEvents(
  subscription: unknown,
  count: number,
): Promise<DependencyRunLiveFeedbackOutput[]> {
  return await new Promise((resolve, reject) => {
    const events: DependencyRunLiveFeedbackOutput[] = [];
    const timeout = setTimeout(() => {
      sub?.unsubscribe();
      reject(new Error(`timed out after ${events.length} feedback event(s)`));
    }, 1000);
    const sub = (subscription as {
      subscribe(opts: {
        next(value: DependencyRunLiveFeedbackOutput): void;
        error(error: unknown): void;
        complete(): void;
      }): { unsubscribe(): void };
    }).subscribe({
      next(value) {
        events.push(value);
        if (events.length === count) {
          clearTimeout(timeout);
          sub.unsubscribe();
          resolve(events);
        }
      },
      error(error) {
        clearTimeout(timeout);
        reject(error);
      },
      complete() {
        if (events.length >= count) {
          clearTimeout(timeout);
          resolve(events);
        }
      },
    });
  });
}

async function waitForFeedbackListener(topic: string): Promise<void> {
  const bus = getEventBus();
  for (let attempt = 0; attempt < 20; attempt++) {
    if (bus.listenerCount(topic) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`feedback listener not registered for ${topic}`);
}

describe("tasks dependency run preview tRPC", () => {
  test("delegates to shared application action with project and trace scope", async () => {
    const trpc = caller();

    const result = await trpc.tasks.previewDependencyRun({
      mode: "task",
      targetTaskIds: [TASK_ID],
      projectId: PROJECT_ID,
      traceId: "trace-trpc-preview",
    });

    expect(result).toMatchObject({
      requiresDisclosure: true,
      traceId: "trace-trpc-preview",
      orderedTaskIds: [TASK_ID],
    });
    expect(previewDependencyRunForTasks).toHaveBeenCalledTimes(1);
    const [em, appCtx, input] = previewDependencyRunForTasks.mock.calls[0] as unknown as [
      unknown,
      AppContext,
      PreviewDependencyRunForTasksInput,
    ];
    expect(em).toEqual({ marker: "trpc-em" });
    expect(appCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(input).toEqual({
      mode: "task",
      targetTaskIds: [TASK_ID],
      projectId: PROJECT_ID,
      traceId: "trace-trpc-preview",
    });
  });

  test("delegates dependency run dispatch to shared application action with agent and trace scope", async () => {
    const trpc = caller();

    const result = await trpc.tasks.dispatchDependencyRun({
      mode: "task",
      targetTaskIds: [TASK_ID],
      projectId: PROJECT_ID,
      traceId: "trace-trpc-dispatch",
      agent: "codex",
      model: "gpt-dependency",
      prompt: "Ship dependency tree",
    });

    expect(result).toMatchObject({
      runGroupId: "trace-trpc-dispatch",
      scheduledRuns: [expect.objectContaining({ taskId: TASK_ID, agent: "codex", status: "queued" })],
    });
    expect(dispatchDependencyRunForTasks).toHaveBeenCalledTimes(1);
    const [em, appCtx, input] = dispatchDependencyRunForTasks.mock.calls[0] as unknown as [
      unknown,
      AppContext,
      DispatchDependencyRunForTasksInput,
    ];
    expect(em).toEqual({ marker: "trpc-em" });
    expect(appCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(input).toEqual({
      mode: "task",
      targetTaskIds: [TASK_ID],
      projectId: PROJECT_ID,
      traceId: "trace-trpc-dispatch",
      agent: "codex",
      model: "gpt-dependency",
      prompt: "Ship dependency tree",
    });
  });

  test("delegates dependency run live feedback to shared application action with trace scope", async () => {
    const trpc = caller();

    const result = await trpc.tasks.dependencyRunLiveFeedback({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-feedback",
    });

    expect(result).toMatchObject({
      runGroupId: "trace-trpc-feedback",
      executorStatus: { queuedTaskCount: 1, active: true },
    });
    expect(loadDependencyRunLiveFeedbackForTasks).toHaveBeenCalledTimes(1);
    const [em, appCtx, input] = loadDependencyRunLiveFeedbackForTasks.mock.calls[0] as unknown as [
      unknown,
      AppContext,
      DependencyRunLiveFeedbackInput,
    ];
    expect(em).toEqual({ marker: "trpc-em" });
    expect(appCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(input).toEqual({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-feedback",
    });
  });

  test("streams dependency-run live feedback from the shared update topic", async () => {
    const trpc = caller();
    const subscription = await trpc.tasks.dependencyRunLiveFeedbackStream({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-feedback",
    });
    const topic = liveFeedbackTopicForTasks({
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      traceId: "trace-trpc-feedback",
    });

    const eventsPromise = collectFeedbackEvents(subscription, 2);
    await waitForFeedbackListener(topic);
    getEventBus().publish<DependencyRunLiveFeedbackOutput>(topic, {
      ...(await loadDependencyRunLiveFeedbackForTasks()),
      executorStatus: {
        queuedTaskCount: 0,
        runningTaskCount: 0,
        succeededTaskCount: 1,
        failedTaskCount: 0,
        blockedTaskCount: 0,
        inReviewCount: 0,
        active: false,
        lastActivityAt: "2026-05-13T00:00:01.000Z",
      },
      latestEvent: {
        id: "event-stream-complete",
        runId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        taskId: TASK_ID,
        traceId: "trace-trpc-feedback",
        sequence: 1,
        domain: "executor",
        mutationType: "agent_run_completed",
        targetKind: "task",
        targetId: TASK_ID,
        agentId: "codex",
        taskLineageId: "trace-trpc-feedback",
        summary: "Agent run completed",
        output: "worker complete",
        payload: {},
        createdAt: "2026-05-13T00:00:01.000Z",
      },
    });

    await expect(eventsPromise).resolves.toMatchObject([
      { runGroupId: "trace-trpc-feedback", executorStatus: { queuedTaskCount: 1, active: true } },
      { runGroupId: "trace-trpc-feedback", executorStatus: { succeededTaskCount: 1, active: false } },
    ]);
  });

  test("delegates dependency-run worker ticks to the shared application runner", async () => {
    const trpc = caller();

    const result = await trpc.tasks.runDependencyRunWorkerTick({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-worker",
      workerId: "worker-trpc",
      cwd: "/repo",
    });

    expect(result).toMatchObject({
      runGroupId: "trace-trpc-worker",
      workerId: "worker-trpc",
      processedRun: { taskId: TASK_ID, status: "succeeded", output: "worker complete" },
    });
    expect(runNextDependencyRunWorkerTickForTasks).toHaveBeenCalledTimes(1);
    const [em, appCtx, input] = runNextDependencyRunWorkerTickForTasks.mock.calls[0] as unknown as [
      unknown,
      AppContext,
      DependencyRunWorkerTickInput,
    ];
    expect(em).toEqual({ marker: "trpc-em" });
    expect(appCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(input).toEqual({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-worker",
      workerId: "worker-trpc",
      cwd: "/repo",
    });
  });

  test("delegates automated feedback-loop exhaustion to the shared application runner", async () => {
    const trpc = caller();

    const result = await trpc.tasks.runAutomatedFeedbackLoop({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-loop",
      workerId: "worker-trpc",
      reviewType: "code",
      reviewerAgent: "qa-reviewer",
      feedbackAgent: "codex",
      feedbackModel: "gpt-feedback",
      maxIterations: 4,
    });

    expect(result).toMatchObject({
      runGroupId: "trace-trpc-loop",
      exhausted: true,
      stopReason: "automated_feedback_exhausted",
      processedRuns: [{ taskId: TASK_ID, status: "succeeded" }],
    });
    expect(runAutomatedFeedbackLoopForTasks).toHaveBeenCalledTimes(1);
    const [em, appCtx, input] = runAutomatedFeedbackLoopForTasks.mock.calls[0] as unknown as [
      unknown,
      AppContext,
      AutomatedFeedbackLoopInput,
    ];
    expect(em).toEqual({ marker: "trpc-em" });
    expect(appCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(input).toEqual({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-loop",
      workerId: "worker-trpc",
      reviewType: "code",
      reviewerAgent: "qa-reviewer",
      feedbackAgent: "codex",
      feedbackModel: "gpt-feedback",
      maxIterations: 4,
    });
  });

  test("delegates QA review recording to shared application action with trace and feedback agent scope", async () => {
    const trpc = caller();

    const result = await trpc.tasks.recordQaReview({
      taskId: TASK_ID,
      runId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      projectId: PROJECT_ID,
      traceId: "trace-trpc-qa",
      reviewType: "code",
      reviewerAgent: "qa-reviewer",
      feedbackAgent: "codex",
      feedbackModel: "gpt-feedback",
      reviewText: "### Verdict: REVISE\nMissing final success criteria check.",
    });

    expect(result).toMatchObject({
      taskId: TASK_ID,
      verdict: "REVISE",
      nextAction: "feedback_run_scheduled",
      feedbackRun: { agent: "codex", status: "queued" },
    });
    expect(recordTaskQaReview).toHaveBeenCalledTimes(1);
    const [em, appCtx, input] = recordTaskQaReview.mock.calls[0] as unknown as [
      unknown,
      AppContext,
      RecordTaskQaReviewInput,
    ];
    expect(em).toEqual({ marker: "trpc-em" });
    expect(appCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(input).toEqual({
      taskId: TASK_ID,
      runId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      projectId: PROJECT_ID,
      traceId: "trace-trpc-qa",
      reviewType: "code",
      reviewerAgent: "qa-reviewer",
      feedbackAgent: "codex",
      feedbackModel: "gpt-feedback",
      reviewText: "### Verdict: REVISE\nMissing final success criteria check.",
    });
  });
});
