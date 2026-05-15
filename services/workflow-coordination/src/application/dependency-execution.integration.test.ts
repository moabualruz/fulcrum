import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import {
  FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
  FulcrumRunEventEntity,
} from "@execution-orchestration/infrastructure/database/run-context.entities.ts";
import {
  FULCRUM_JOB_QUEUE_ENTITIES,
  FulcrumJobEntity,
} from "@platform-core/infrastructure/database/job-queue.entities.ts";
import { JobQueue1778751000000 } from "@platform-core/infrastructure/database/job-queue.migration.ts";
import {
  FulcrumAgentRunEntity,
  FulcrumProjectEntity,
  FulcrumTaskDependencyEntity,
  FulcrumTaskEntity,
  FulcrumWorkspaceEntity,
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { RunContext1778623200005 } from "@execution-orchestration/infrastructure/database/run-context.migration.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import {
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { DependencyRunService } from "@workflow-coordination/application/dependency-execution.service.ts";

let pglite: PGlite | undefined;
let socketServer: PGLiteSocketServer | undefined;

async function startPgliteSocket(): Promise<string> {
  pglite = await PGlite.create();
  await pglite.waitReady;

  socketServer = new PGLiteSocketServer({
    db: pglite,
    host: "127.0.0.1",
    port: 0,
    maxConnections: 20,
  });
  await socketServer.start();

  const [host, port] = socketServer.getServerConn().split(":");
  return `postgresql://postgres:postgres@${host}:${port}/postgres`;
}

afterEach(async () => {
  if (socketServer) {
    await socketServer.stop();
    socketServer = undefined;
  }
  if (pglite) {
    await pglite.close();
    pglite = undefined;
  }
});

describe("Dependency execution Nest service", () => {
  test("dispatches dependency runs in dependency order through TypeORM agent-run and audit rows", async () => {
    const url = await startPgliteSocket();
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: [
          ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
          ...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
          ...FULCRUM_JOB_QUEUE_ENTITIES,
        ],
        migrations: [WorkflowSpine1778623200001, RunContext1778623200005, JobQueue1778751000000],
      }),);

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      await dataSource.getRepository(FulcrumWorkspaceEntity).save({
        id: "workspace-execution-nest",
        slug: "execution-nest",
        name: "Execution Nest",
      });
      await dataSource.getRepository(FulcrumProjectEntity).save({
        id: "project-execution-nest",
        workspaceId: "workspace-execution-nest",
        slug: "execution-nest",
        name: "Execution Nest Project",
        traceId: "trace-execution-nest",
      });
      await dataSource.getRepository(FulcrumTaskEntity).save([
        {
          id: "task-target-execution",
          projectId: "project-execution-nest",
          title: "Run selected task",
          status: "todo",
          successCriteria: ["Target runs after prerequisites"],
          traceId: "trace-execution-nest",
        },
        {
          id: "task-prepare-execution",
          projectId: "project-execution-nest",
          title: "Prepare dependency",
          status: "triage",
          successCriteria: ["Dependency is ready"],
          traceId: "trace-execution-nest",
        },
        {
          id: "task-done-execution",
          projectId: "project-execution-nest",
          title: "Already accepted",
          status: "done",
          successCriteria: ["Accepted earlier"],
          traceId: "trace-execution-nest",
        },
      ]);
      await dataSource.getRepository(FulcrumTaskDependencyEntity).save([
        {
          id: "dependency-target-prepare",
          projectId: "project-execution-nest",
          taskId: "task-target-execution",
          dependsOnTaskId: "task-prepare-execution",
          dependencyKind: "approved_plan_dependency",
          traceId: "trace-execution-nest",
        },
        {
          id: "dependency-target-done",
          projectId: "project-execution-nest",
          taskId: "task-target-execution",
          dependsOnTaskId: "task-done-execution",
          dependencyKind: "approved_plan_dependency",
          traceId: "trace-execution-nest",
        },
      ]);

      const service = new DependencyRunService(dataSource);
      const result = await service.dispatchDependencyRun({
        workspaceId: "workspace-execution-nest",
        workspaceSlug: "temporary-workspace-slug",
        workspaceName: "Temporary Workspace Name",
        projectId: "project-execution-nest",
        projectSlug: "temporary-project-slug",
        projectName: "Temporary Project Name",
        mode: "task",
        targetTaskIds: ["task-target-execution"],
        traceId: "trace-execution-nest",
        agent: "codex",
        model: "gpt-5.4",
        prompt: "Run the dependency tree.",
      });

      expect(result.preview.orderedTaskIds).toEqual([
        "task-prepare-execution",
        "task-done-execution",
        "task-target-execution",
      ]);
      expect(result.scheduledRuns.map((run) => [run.taskId, run.queuePosition, run.dependencyIds])).toEqual([
        ["task-prepare-execution", 1, []],
        ["task-target-execution", 2, ["task-prepare-execution", "task-done-execution"]],
      ]);
      expect(result.skippedTasks).toEqual([
        {
          id: "task-done-execution",
          title: "Already accepted",
          column: "done",
          reason: "already satisfied",
        },
      ]);
      await expect(dataSource.getRepository(FulcrumProjectEntity).findOneByOrFail({
        id: "project-execution-nest",
      })).resolves.toMatchObject({
        slug: "execution-nest",
        name: "Execution Nest Project",
        traceId: "trace-execution-nest",
      });

      const runs = await dataSource.getRepository(FulcrumAgentRunEntity).find({
        where: { traceId: "trace-execution-nest" },
        order: { id: "ASC" },
      });
      expect(runs.map((run) => ({
        id: run.id,
        taskId: run.taskId,
        status: run.status,
        dependencyTree: run.dependencyTree,
      }))).toEqual([
        {
          id: "run-trace-execution-nest-1-task-prepare-execution",
          taskId: "task-prepare-execution",
          status: "queued",
          dependencyTree: [],
        },
        {
          id: "run-trace-execution-nest-2-task-target-execution",
          taskId: "task-target-execution",
          status: "queued",
          dependencyTree: ["task-prepare-execution", "task-done-execution"],
        },
      ]);

      const event = await dataSource.getRepository(FulcrumRunEventEntity).findOneByOrFail({
        runId: "run-trace-execution-nest-1-task-prepare-execution",
        sequence: 1,
      });
      expect(event).toMatchObject({
        projectId: "project-execution-nest",
        traceId: "trace-execution-nest",
        domain: "executor",
        mutationType: "dependency_tree_dispatched",
        targetKind: "task",
        targetId: "task-target-execution",
      });
      expect(event.payload).toMatchObject({
        runGroupId: "trace-execution-nest",
        orderedTaskIds: [
          "task-prepare-execution",
          "task-done-execution",
          "task-target-execution",
        ],
        scheduledTaskIds: ["task-prepare-execution", "task-target-execution"],
        skippedTaskIds: ["task-done-execution"],
      });
      const jobs = await dataSource.getRepository(FulcrumJobEntity).find({
        where: { orgId: "workspace-execution-nest", queue: "agent-runs", kind: "agent_run" },
        order: { availableAt: "ASC", id: "ASC" },
      });
      expect(jobs.map((job) => ({ status: job.status, payload: job.payload }))).toEqual([
        {
          status: "queued",
          payload: expect.objectContaining({
            run_id: "run-trace-execution-nest-1-task-prepare-execution",
            task_id: "task-prepare-execution",
            agent: "codex",
            model: "gpt-5.4",
            prompt: "Run the dependency tree.",
          }),
        },
        {
          status: "queued",
          payload: expect.objectContaining({
            run_id: "run-trace-execution-nest-2-task-target-execution",
            task_id: "task-target-execution",
            agent: "codex",
            model: "gpt-5.4",
            prompt: "Run the dependency tree.",
          }),
        },
      ]);
    } finally {
      await dataSource.destroy();
    }
  });

  test("records worker lifecycle events and returns live dependency-run feedback from TypeORM rows", async () => {
    const url = await startPgliteSocket();
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: [
          ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
          ...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
          ...FULCRUM_JOB_QUEUE_ENTITIES,
        ],
        migrations: [WorkflowSpine1778623200001, RunContext1778623200005, JobQueue1778751000000],
      }),);

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      await dataSource.getRepository(FulcrumWorkspaceEntity).save({
        id: "workspace-execution-live",
        slug: "execution-live",
        name: "Execution Live",
      });
      await dataSource.getRepository(FulcrumProjectEntity).save({
        id: "project-execution-live",
        workspaceId: "workspace-execution-live",
        slug: "execution-live",
        name: "Execution Live Project",
        traceId: "trace-execution-live",
      });
      await dataSource.getRepository(FulcrumTaskEntity).save([
        {
          id: "task-target-live",
          projectId: "project-execution-live",
          title: "Run target task",
          status: "todo",
          successCriteria: ["Target receives live updates after prerequisites"],
          traceId: "trace-execution-live",
        },
        {
          id: "task-prepare-live",
          projectId: "project-execution-live",
          title: "Prepare live dependency",
          status: "todo",
          successCriteria: ["Dependency emits lifecycle output"],
          traceId: "trace-execution-live",
        },
      ]);
      await dataSource.getRepository(FulcrumTaskDependencyEntity).save({
        id: "dependency-live-target-prepare",
        projectId: "project-execution-live",
        taskId: "task-target-live",
        dependsOnTaskId: "task-prepare-live",
        dependencyKind: "approved_plan_dependency",
        traceId: "trace-execution-live",
      });

      const service = new DependencyRunService(dataSource);
      await service.dispatchDependencyRun({
        workspaceId: "workspace-execution-live",
        workspaceSlug: "execution-live",
        workspaceName: "Execution Live",
        projectId: "project-execution-live",
        projectSlug: "execution-live",
        projectName: "Execution Live Project",
        mode: "task",
        targetTaskIds: ["task-target-live"],
        traceId: "trace-execution-live",
        agent: "codex",
        model: "gpt-5.4",
        prompt: "Run with live worker feedback.",
      });

      const started = await service.recordDependencyRunLifecycleEvent({
        projectId: "project-execution-live",
        traceId: "trace-execution-live",
        runId: "run-trace-execution-live-1-task-prepare-live",
        taskId: "task-prepare-live",
        status: "running",
        domain: "executor",
        mutationType: "agent_run_started",
        targetKind: "task",
        targetId: "task-prepare-live",
        agentId: "codex",
        taskLineageId: "trace-execution-live",
        summary: "Started preparing dependency",
        output: "checking dependency state",
      });
      const completed = await service.recordDependencyRunLifecycleEvent({
        projectId: "project-execution-live",
        traceId: "trace-execution-live",
        runId: "run-trace-execution-live-1-task-prepare-live",
        taskId: "task-prepare-live",
        status: "succeeded",
        domain: "executor",
        mutationType: "agent_run_completed",
        targetKind: "task",
        targetId: "task-prepare-live",
        agentId: "codex",
        taskLineageId: "trace-execution-live",
        summary: "Finished preparing dependency",
        output: "dependency ready",
        payload: { successCriteria: ["Dependency emits lifecycle output"] },
      });

      expect(started.event.sequence).toBe(2);
      expect(completed.event.sequence).toBe(3);

      const feedback = await service.loadDependencyRunLiveFeedback({
        projectId: "project-execution-live",
        traceId: "trace-execution-live",
      });

      expect(feedback).toMatchObject({
        projectId: "project-execution-live",
        traceId: "trace-execution-live",
        runGroupId: "trace-execution-live",
        executorStatus: {
          queuedTaskCount: 1,
          runningTaskCount: 0,
          succeededTaskCount: 1,
          failedTaskCount: 0,
          blockedTaskCount: 0,
          inReviewCount: 0,
          active: true,
        },
      });
      expect(feedback.runs.map((run) => ({
        id: run.id,
        taskId: run.taskId,
        status: run.status,
        queuePosition: run.queuePosition,
        dependencyIds: run.dependencyIds,
        latestEventSummary: run.latestEventSummary,
      }))).toEqual([
        {
          id: "run-trace-execution-live-1-task-prepare-live",
          taskId: "task-prepare-live",
          status: "succeeded",
          queuePosition: 1,
          dependencyIds: [],
          latestEventSummary: "Finished preparing dependency",
        },
        {
          id: "run-trace-execution-live-2-task-target-live",
          taskId: "task-target-live",
          status: "queued",
          queuePosition: 2,
          dependencyIds: ["task-prepare-live"],
          latestEventSummary: null,
        },
      ]);
      expect(feedback.events.map((event) => ({
        runId: event.runId,
        sequence: event.sequence,
        mutationType: event.mutationType,
        summary: event.summary,
        output: event.output,
      }))).toEqual([
        {
          runId: "run-trace-execution-live-1-task-prepare-live",
          sequence: 1,
          mutationType: "dependency_tree_dispatched",
          summary: "Dependency tree dispatched",
          output: null,
        },
        {
          runId: "run-trace-execution-live-1-task-prepare-live",
          sequence: 2,
          mutationType: "agent_run_started",
          summary: "Started preparing dependency",
          output: "checking dependency state",
        },
        {
          runId: "run-trace-execution-live-1-task-prepare-live",
          sequence: 3,
          mutationType: "agent_run_completed",
          summary: "Finished preparing dependency",
          output: "dependency ready",
        },
      ]);
      expect(feedback.latestEvent?.mutationType).toBe("agent_run_completed");
    } finally {
      await dataSource.destroy();
    }
  });

  test("worker tick claims TypeORM jobs and executes queued dependency runs in dependency order", async () => {
    const url = await startPgliteSocket();
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: [
          ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
          ...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
          ...FULCRUM_JOB_QUEUE_ENTITIES,
        ],
        migrations: [WorkflowSpine1778623200001, RunContext1778623200005, JobQueue1778751000000],
      }),);

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      await dataSource.getRepository(FulcrumWorkspaceEntity).save({
        id: "workspace-execution-worker",
        slug: "execution-worker",
        name: "Execution Worker",
      });
      await dataSource.getRepository(FulcrumProjectEntity).save({
        id: "project-execution-worker",
        workspaceId: "workspace-execution-worker",
        slug: "execution-worker",
        name: "Execution Worker Project",
        traceId: "trace-execution-worker",
      });
      await dataSource.getRepository(FulcrumTaskEntity).save([
        {
          id: "task-target-worker",
          projectId: "project-execution-worker",
          title: "Run worker target",
          status: "todo",
          successCriteria: ["Target runs after worker dependency"],
          traceId: "trace-execution-worker",
        },
        {
          id: "task-prepare-worker",
          projectId: "project-execution-worker",
          title: "Prepare worker dependency",
          status: "todo",
          successCriteria: ["Dependency worker emits output"],
          traceId: "trace-execution-worker",
        },
      ]);
      await dataSource.getRepository(FulcrumTaskDependencyEntity).save({
        id: "dependency-worker-target-prepare",
        projectId: "project-execution-worker",
        taskId: "task-target-worker",
        dependsOnTaskId: "task-prepare-worker",
        dependencyKind: "approved_plan_dependency",
        traceId: "trace-execution-worker",
      });

      const service = new DependencyRunService(dataSource);
      const dispatch = await service.dispatchDependencyRun({
        workspaceId: "workspace-execution-worker",
        workspaceSlug: "execution-worker",
        workspaceName: "Execution Worker",
        projectId: "project-execution-worker",
        projectSlug: "execution-worker",
        projectName: "Execution Worker Project",
        mode: "task",
        targetTaskIds: ["task-target-worker"],
        traceId: "trace-execution-worker",
        agent: "codex",
        model: "gpt-worker",
        prompt: "Run TypeORM dependency worker",
      });

      const runnerCalls: unknown[] = [];
      const firstTick = await service.runDependencyRunWorkerTick({
        projectId: "project-execution-worker",
        traceId: dispatch.runGroupId,
        workerId: "worker-typeorm",
      }, {
        runAgent: async (request) => {
          runnerCalls.push(request);
          return {
            transcript: "Prepared dependency\nCOMPLETE\n",
            exitCode: 0,
            filesChanged: [],
            artifacts: [],
            durationMs: 12,
            iterationCount: 1,
            exitReason: "complete",
            tokenUsed: 2,
          };
        },
      });

      expect(firstTick.processedRun).toMatchObject({
        taskId: "task-prepare-worker",
        status: "succeeded",
        agent: "codex",
      });
      expect(firstTick.feedback.executorStatus).toMatchObject({
        queuedTaskCount: 1,
        succeededTaskCount: 1,
        active: true,
      });

      const secondTick = await service.runDependencyRunWorkerTick({
        projectId: "project-execution-worker",
        traceId: dispatch.runGroupId,
        workerId: "worker-typeorm",
      }, {
        runAgent: async (request) => {
          runnerCalls.push(request);
          return {
            transcript: "Ran target\nCOMPLETE\n",
            exitCode: 0,
            filesChanged: [],
            artifacts: [],
            durationMs: 18,
            iterationCount: 1,
            exitReason: "complete",
            tokenUsed: 3,
          };
        },
      });

      expect(secondTick.processedRun).toMatchObject({
        taskId: "task-target-worker",
        status: "succeeded",
        agent: "codex",
      });
      expect(runnerCalls).toHaveLength(2);
      expect(runnerCalls[0]).toMatchObject({
        runId: "run-trace-execution-worker-1-task-prepare-worker",
        prompt: "Run TypeORM dependency worker",
        contextBundle: expect.objectContaining({
          traceId: "trace-execution-worker",
          taskId: "task-prepare-worker",
          dependencyIds: [],
          queuePosition: 1,
        }),
      });
      expect(runnerCalls[1]).toMatchObject({
        contextBundle: expect.objectContaining({
          taskId: "task-target-worker",
          dependencyIds: ["task-prepare-worker"],
          queuePosition: 2,
        }),
      });

      const feedback = await service.loadDependencyRunLiveFeedback({
        projectId: "project-execution-worker",
        traceId: dispatch.runGroupId,
      });
      expect(feedback.executorStatus).toMatchObject({
        queuedTaskCount: 0,
        runningTaskCount: 0,
        succeededTaskCount: 2,
        failedTaskCount: 0,
        active: false,
      });
      expect(feedback.events.map((event) => event.mutationType)).toEqual([
        "dependency_tree_dispatched",
        "agent_run_started",
        "agent_run_completed",
        "agent_run_started",
        "agent_run_completed",
      ]);
      const jobs = await dataSource.getRepository(FulcrumJobEntity).find({
        where: { orgId: "workspace-execution-worker", queue: "agent-runs", kind: "agent_run" },
        order: { availableAt: "ASC", id: "ASC" },
      });
      expect(jobs.map((job) => ({ status: job.status, runId: job.payload.run_id }))).toEqual([
        { status: "succeeded", runId: "run-trace-execution-worker-1-task-prepare-worker" },
        { status: "succeeded", runId: "run-trace-execution-worker-2-task-target-worker" },
      ]);
    } finally {
      await dataSource.destroy();
    }
  });

  test("runs automated feedback loops through TypeORM worker execution and QA approval", async () => {
    const url = await startPgliteSocket();
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: [
          ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
          ...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
          ...FULCRUM_JOB_QUEUE_ENTITIES,
        ],
        migrations: [WorkflowSpine1778623200001, RunContext1778623200005, JobQueue1778751000000],
      }),);

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      await dataSource.getRepository(FulcrumWorkspaceEntity).save({
        id: "workspace-feedback-loop",
        slug: "feedback-loop",
        name: "Feedback Loop",
      });
      await dataSource.getRepository(FulcrumProjectEntity).save({
        id: "project-feedback-loop",
        workspaceId: "workspace-feedback-loop",
        slug: "feedback-loop",
        name: "Feedback Loop Project",
        traceId: "trace-feedback-loop",
      });
      await dataSource.getRepository(FulcrumTaskEntity).save({
        id: "task-feedback-loop",
        projectId: "project-feedback-loop",
        title: "Complete reviewed task",
        descriptionText: "Run the dependency worker, then record automated QA approval.",
        status: "todo",
        successCriteria: [
          "Worker output demonstrates the implementation is complete.",
          "QA review approval moves the task to final review.",
        ],
        traceId: "trace-feedback-loop",
      });

      const service = new DependencyRunService(dataSource);
      await service.dispatchDependencyRun({
        workspaceId: "workspace-feedback-loop",
        workspaceSlug: "feedback-loop",
        workspaceName: "Feedback Loop",
        projectId: "project-feedback-loop",
        projectSlug: "feedback-loop",
        projectName: "Feedback Loop Project",
        mode: "task",
        targetTaskIds: ["task-feedback-loop"],
        traceId: "trace-feedback-loop",
        agent: "codex",
        model: "gpt-feedback-loop",
        prompt: "Implement the reviewed task.",
      });

      const runnerCalls: unknown[] = [];
      const reviewCalls: unknown[] = [];
      const result = await service.runAutomatedFeedbackLoop({
        projectId: "project-feedback-loop",
        traceId: "trace-feedback-loop",
        workerId: "worker-feedback-loop",
        reviewType: "code",
        reviewerAgent: "qa-reviewer",
        feedbackAgent: "codex",
        maxIterations: 3,
      }, {
        runAgent: async (request) => {
          runnerCalls.push(request);
          return {
            transcript: "Implemented the task and satisfied both success criteria.\nCOMPLETE\n",
            exitCode: 0,
            filesChanged: [],
            artifacts: [],
            durationMs: 25,
            iterationCount: 1,
            exitReason: "complete",
            tokenUsed: 4,
          };
        },
        reviewTaskRun: async (input) => {
          reviewCalls.push(input);
          return {
            reviewerAgent: "qa-reviewer",
            reviewText: [
              "## Automated QA",
              "### Verdict: APPROVE",
              "The worker output demonstrates the task is complete.",
            ].join("\n"),
            summary: "Automated QA approved the dependency run.",
          };
        },
      });

      expect(result).toMatchObject({
        projectId: "project-feedback-loop",
        traceId: "trace-feedback-loop",
        runGroupId: "trace-feedback-loop",
        iterations: 1,
        exhausted: true,
        stopReason: "automated_feedback_exhausted",
      });
      expect(result.processedRuns).toEqual([
        {
          id: "run-trace-feedback-loop-1-task-feedback-loop",
          taskId: "task-feedback-loop",
          status: "succeeded",
          output: "Implemented the task and satisfied both success criteria.\nCOMPLETE",
        },
      ]);
      expect(result.reviews).toMatchObject([
        {
          taskId: "task-feedback-loop",
          runId: "run-trace-feedback-loop-1-task-feedback-loop",
          traceId: "trace-feedback-loop",
          reviewType: "code",
          reviewerAgent: "qa-reviewer",
          verdict: "APPROVE",
          nextAction: "ready_for_final_review",
          feedbackRun: null,
        },
      ]);
      expect(runnerCalls).toHaveLength(1);
      expect(runnerCalls[0]).toMatchObject({
        runId: "run-trace-feedback-loop-1-task-feedback-loop",
        projectId: "project-feedback-loop",
        taskId: "task-feedback-loop",
        traceId: "trace-feedback-loop",
      });
      expect(reviewCalls).toHaveLength(1);
      expect(reviewCalls[0]).toMatchObject({
        iteration: 1,
        projectId: "project-feedback-loop",
        traceId: "trace-feedback-loop",
        tick: expect.objectContaining({
          processedRun: expect.objectContaining({
            id: "run-trace-feedback-loop-1-task-feedback-loop",
            status: "succeeded",
          }),
        }),
      });

      await expect(dataSource.getRepository(FulcrumTaskEntity).findOneByOrFail({
        id: "task-feedback-loop",
        projectId: "project-feedback-loop",
      })).resolves.toMatchObject({
        status: "in-review",
      });

      const events = await dataSource.getRepository(FulcrumRunEventEntity).find({
        where: {
          projectId: "project-feedback-loop",
          runId: "run-trace-feedback-loop-1-task-feedback-loop",
        },
        order: { sequence: "ASC" },
      });
      expect(events.map((event) => event.mutationType)).toEqual([
        "dependency_tree_dispatched",
        "agent_run_started",
        "agent_run_completed",
        "qa_review_recorded",
      ]);
      expect(events.at(-1)).toMatchObject({
        domain: "review",
        agentId: "qa-reviewer",
        targetId: "task-feedback-loop",
      });
      expect(events.at(-1)?.payload).toMatchObject({
        verdict: "APPROVE",
        nextAction: "ready_for_final_review",
        successCriteria: [
          "Worker output demonstrates the implementation is complete.",
          "QA review approval moves the task to final review.",
        ],
      });
    } finally {
      await dataSource.destroy();
    }
  });

  test("records QA REVISE verdicts against TypeORM success criteria and schedules feedback runs", async () => {
    const url = await startPgliteSocket();
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url,
        entities: [
          ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
          ...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
          ...FULCRUM_JOB_QUEUE_ENTITIES,
        ],
        migrations: [WorkflowSpine1778623200001, RunContext1778623200005, JobQueue1778751000000],
      }),);

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      await dataSource.getRepository(FulcrumWorkspaceEntity).save({
        id: "workspace-qa-nest",
        slug: "qa-nest",
        name: "QA Nest",
      });
      await dataSource.getRepository(FulcrumProjectEntity).save({
        id: "project-qa-nest",
        workspaceId: "workspace-qa-nest",
        slug: "qa-nest",
        name: "QA Nest Project",
        traceId: "trace-qa-nest",
      });
      await dataSource.getRepository(FulcrumTaskEntity).save({
        id: "task-qa-nest",
        projectId: "project-qa-nest",
        title: "Review dependency runner",
        status: "in-progress",
        successCriteria: [
          "Dependency tree is disclosed before execution.",
          "Feedback loops schedule corrective runs until review passes.",
        ],
        traceId: "trace-qa-nest",
      });

      const service = new DependencyRunService(dataSource);
      const result = await service.recordTaskQaReview({
        workspaceId: "workspace-qa-nest",
        workspaceSlug: "qa-nest",
        workspaceName: "QA Nest",
        projectId: "project-qa-nest",
        projectSlug: "qa-nest",
        projectName: "QA Nest Project",
        taskId: "task-qa-nest",
        traceId: "trace-qa-nest",
        reviewType: "code",
        reviewerAgent: "qa-reviewer",
        feedbackAgent: "codex",
        feedbackModel: "gpt-feedback",
        reviewText: [
          "## Code Review",
          "### Verdict: REVISE",
          "Corrective feedback must stay tied to success criteria.",
        ].join("\n"),
      });

      expect(result).toMatchObject({
        taskId: "task-qa-nest",
        runId: null,
        traceId: "trace-qa-nest",
        reviewType: "code",
        reviewerAgent: "qa-reviewer",
        verdict: "REVISE",
        nextAction: "feedback_run_scheduled",
      });
      expect(result.successCriteria.map((criterion) => criterion.text)).toEqual([
        "Dependency tree is disclosed before execution.",
        "Feedback loops schedule corrective runs until review passes.",
      ]);
      expect(result.feedbackRun).toMatchObject({
        id: "run-trace-qa-nest-feedback-task-qa-nest",
        taskId: "task-qa-nest",
        agent: "codex",
        status: "queued",
      });

      await expect(dataSource.getRepository(FulcrumAgentRunEntity).findOneByOrFail({
        id: "run-trace-qa-nest-feedback-task-qa-nest",
      })).resolves.toMatchObject({
        projectId: "project-qa-nest",
        taskId: "task-qa-nest",
        status: "queued",
      });
      await expect(dataSource.getRepository(FulcrumJobEntity).findOneByOrFail({
        orgId: "workspace-qa-nest",
        projectId: "project-qa-nest",
        queue: "agent-runs",
        kind: "agent_run",
        status: "queued",
      })).resolves.toMatchObject({
        payload: expect.objectContaining({
          run_id: "run-trace-qa-nest-feedback-task-qa-nest",
          task_id: "task-qa-nest",
          agent: "codex",
          model: "gpt-feedback",
        }),
      });
      const event = await dataSource.getRepository(FulcrumRunEventEntity).findOneByOrFail({
        runId: "run-trace-qa-nest-feedback-task-qa-nest",
        sequence: 1,
      });
      expect(event).toMatchObject({
        projectId: "project-qa-nest",
        traceId: "trace-qa-nest",
        domain: "review",
        mutationType: "qa_review_recorded",
        targetKind: "task",
        targetId: "task-qa-nest",
        agentId: "qa-reviewer",
      });
      expect(event.payload).toMatchObject({
        verdict: "REVISE",
        nextAction: "feedback_run_scheduled",
        feedbackRunId: "run-trace-qa-nest-feedback-task-qa-nest",
        successCriteria: [
          "Dependency tree is disclosed before execution.",
          "Feedback loops schedule corrective runs until review passes.",
        ],
      });
    } finally {
      await dataSource.destroy();
    }
  });
});
