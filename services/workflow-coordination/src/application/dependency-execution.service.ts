import "reflect-metadata";

import { Inject, Injectable } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";

import {
  buildDependencyRunPreview,
  type DependencyRunPreview,
  type DependencyRunPreviewInput,
  type DependencyRunMode,
  type DependencyRunPreviewTask,
} from "@execution-orchestration/domain/dependency-run-preview.ts";
import type { Column } from "@execution-orchestration/domain/dependency-order.ts";
import { resolveAgentRunConfig } from "@execution-orchestration/application/agent-catalog/resolve-agent-run-config.ts";
import {
  buildReviewToolResponse,
  extractReviewVerdict,
  planRethinkRecovery,
  type RethinkRecoveryPlan,
  type ReviewType,
  type ReviewVerdict,
} from "@execution-orchestration/domain/review-verdicts.ts";
import { runAgent } from "@execution-orchestration/infrastructure/agent-runtime/sandbox-runner.ts";
import type {
  AgentRunRequest,
  AgentRunResult,
} from "@execution-orchestration/infrastructure/agent-runtime/types.ts";
import {
  FulcrumRunEventEntity,
} from "@execution-orchestration/infrastructure/database/run-context.entities.ts";
import {
  type FulcrumJob,
  FulcrumJobEntity,
} from "@platform-core/infrastructure/database/job-queue.entities.ts";
import {
  type FulcrumAgentRun,
  type FulcrumTask,
  FulcrumAgentRunEntity,
  FulcrumProjectEntity,
  FulcrumTaskDependencyEntity,
  FulcrumTaskEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export type DependencyRunPreviewOutput = DependencyRunPreview;

export type DependencyRunPreviewRequest = Omit<DependencyRunPreviewInput, "tasks"> & {
  projectId?: string;
  tasks?: DependencyRunPreviewInput["tasks"];
};

export interface DependencyRunDispatchInput {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
  mode: DependencyRunMode;
  targetTaskIds: string[];
  traceId?: string;
  agent: string;
  model?: string | null;
  prompt?: string | null;
}

export interface DependencyRunScheduledRun {
  id: string;
  taskId: string;
  agent: string;
  status: string;
  queuePosition: number;
  dependencyIds: string[];
}

export interface DependencyRunSkippedTask {
  id: string;
  title: string;
  column: Column;
  reason: string;
}

export interface DependencyRunDispatchOutput {
  runGroupId: string;
  preview: DependencyRunPreview;
  scheduledRuns: DependencyRunScheduledRun[];
  skippedTasks: DependencyRunSkippedTask[];
  warnings: string[];
}

export interface DependencyRunLiveFeedbackInput {
  projectId: string;
  traceId?: string | null;
  runGroupId?: string | null;
  runId?: string | null;
  taskId?: string | null;
}

export interface DependencyRunLiveRun {
  id: string;
  taskId: string | null;
  traceId: string;
  status: string;
  queuePosition: number;
  dependencyIds: string[];
  latestEventSummary: string | null;
  lastActivityAt: string | null;
}

export interface DependencyRunLiveEvent {
  id: string;
  runId: string;
  taskId: string | null;
  traceId: string;
  sequence: number;
  domain: string;
  mutationType: string;
  targetKind: string;
  targetId: string;
  agentId: string | null;
  taskLineageId: string | null;
  summary: string;
  output: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface DependencyRunExecutorStatus {
  queuedTaskCount: number;
  runningTaskCount: number;
  succeededTaskCount: number;
  failedTaskCount: number;
  blockedTaskCount: number;
  inReviewCount: number;
  active: boolean;
  lastActivityAt: string | null;
}

export interface DependencyRunLiveFeedbackOutput {
  projectId: string;
  traceId: string;
  runGroupId: string;
  fetchedAt: string;
  executorStatus: DependencyRunExecutorStatus;
  runs: DependencyRunLiveRun[];
  events: DependencyRunLiveEvent[];
  latestEvent: DependencyRunLiveEvent | null;
}

export interface DependencyRunLifecycleEventInput {
  projectId: string;
  traceId?: string | null;
  runId: string;
  taskId?: string | null;
  status: string;
  domain: string;
  mutationType: string;
  targetKind: string;
  targetId: string;
  agentId?: string | null;
  taskLineageId?: string | null;
  summary?: string | null;
  output?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface DependencyRunLifecycleEventOutput {
  run: {
    id: string;
    taskId: string | null;
    traceId: string;
    status: string;
  };
  event: DependencyRunLiveEvent;
}

export interface DependencyRunWorkerTickInput {
  projectId: string;
  traceId?: string | null;
  runGroupId?: string | null;
  workerId?: string | null;
  cwd?: string | null;
  copyToWorktree?: string[] | null;
}

export interface DependencyRunWorkerRunContext extends AgentRunRequest {
  projectId: string;
  taskId: string | null;
  traceId: string;
  agent: string;
  model: string | null;
  dependencyIds: string[];
  queuePosition: number;
}

export interface DependencyRunWorkerTickOutput {
  projectId: string;
  traceId: string;
  runGroupId: string;
  workerId: string;
  processedRun: {
    id: string;
    taskId: string | null;
    traceId: string;
    agent: string;
    status: "succeeded" | "failed" | "queued";
    output: string;
    jobId: string;
  } | null;
  skippedReason: string | null;
  feedback: DependencyRunLiveFeedbackOutput;
}

export interface DependencyRunWorkerTickDeps {
  runAgent?: (request: DependencyRunWorkerRunContext) => Promise<AgentRunResult>;
}

export type AutomatedFeedbackLoopStopReason =
  | "automated_feedback_exhausted"
  | "agent_run_failed"
  | "max_iterations_reached"
  | "manual_review_required"
  | "reviewer_unavailable"
  | "worker_waiting";

export interface AutomatedFeedbackLoopInput {
  workspaceId?: string | null;
  workspaceSlug?: string | null;
  workspaceName?: string | null;
  projectId: string;
  projectSlug?: string | null;
  projectName?: string | null;
  traceId?: string | null;
  runGroupId?: string | null;
  reviewType?: ReviewType;
  reviewerAgent?: string | null;
  feedbackAgent?: string | null;
  feedbackModel?: string | null;
  workerId?: string | null;
  maxIterations?: number | null;
  cwd?: string | null;
  copyToWorktree?: string[] | null;
}

export interface AutomatedFeedbackLoopProcessedRun {
  id: string;
  taskId: string | null;
  status: "succeeded" | "failed" | "queued";
  output: string;
}

export interface AutomatedFeedbackReviewInput {
  iteration: number;
  projectId: string;
  traceId: string;
  tick: DependencyRunWorkerTickOutput;
  feedback: DependencyRunLiveFeedbackOutput;
}

export interface AutomatedFeedbackReviewResult {
  reviewText: string;
  reviewerAgent?: string | null;
  summary?: string | null;
}

export interface AutomatedFeedbackLoopDeps extends DependencyRunWorkerTickDeps {
  reviewAgent?: (request: DependencyRunWorkerRunContext) => Promise<AgentRunResult>;
  reviewTaskRun?: (input: AutomatedFeedbackReviewInput) => Promise<AutomatedFeedbackReviewResult>;
}

export interface AutomatedFeedbackLoopOutput {
  projectId: string;
  traceId: string;
  runGroupId: string;
  iterations: number;
  processedRuns: AutomatedFeedbackLoopProcessedRun[];
  reviews: TaskQaReviewOutput[];
  exhausted: boolean;
  stopReason: AutomatedFeedbackLoopStopReason;
  feedback: DependencyRunLiveFeedbackOutput;
}

export type TaskQaReviewNextAction =
  | "ready_for_final_review"
  | "feedback_run_scheduled"
  | "manual_review_required";

export interface TaskQaSuccessCriterion {
  id: string;
  text: string;
}

export interface TaskQaReviewInput {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
  taskId: string;
  runId?: string | null;
  traceId?: string;
  reviewType: ReviewType;
  reviewerAgent?: string | null;
  reviewText: string;
  feedbackAgent?: string | null;
  feedbackModel?: string | null;
  baseline?: string | null;
  checkpointId?: string | null;
  summary?: string | null;
}

export interface TaskQaFeedbackRun {
  id: string;
  taskId: string;
  agent: string;
  status: string;
}

export interface TaskQaReviewOutput {
  taskId: string;
  runId: string | null;
  traceId?: string;
  reviewType: ReviewType;
  reviewerAgent: string;
  verdict: ReviewVerdict;
  nextAction: TaskQaReviewNextAction;
  successCriteria: TaskQaSuccessCriterion[];
  feedbackRun: TaskQaFeedbackRun | null;
  recoveryPlan: RethinkRecoveryPlan | null;
}

export class DependencyRunService {
  constructor(private readonly dataSource?: DataSource) {}

  async previewDependencyRun(
    input: DependencyRunPreviewRequest,): Promise<DependencyRunPreviewOutput> {
    if (Array.isArray(input.tasks)) {
      return buildDependencyRunPreview({
        mode: input.mode,
        targetTaskIds: input.targetTaskIds,
        traceId: input.traceId,
        tasks: input.tasks,
      });
    }
    if (!this.dataSource || !input.projectId) {
      throw new Error("Dependency run preview requires tasks or a configured project.");
    }
    const traceId = input.traceId ?? executionWorkflowId("trace", input.projectId, input.targetTaskIds.join("-"));
    return await this.dataSource.transaction(async (manager) =>
      await buildPersistedDependencyPreview(manager, {
        projectId: input.projectId!,
        mode: input.mode,
        targetTaskIds: input.targetTaskIds,
      }, traceId)
    );
  }

  async dispatchDependencyRun(
    input: DependencyRunDispatchInput,): Promise<DependencyRunDispatchOutput> {
    if (!this.dataSource) {
      throw new Error("DependencyRunService requires a TypeORM DataSource to dispatch dependency runs.");
    }
    if (!input.agent.trim()) {
      throw new Error("Dependency run agent is required.");
    }

    const runGroupId = input.traceId ?? executionWorkflowId("trace", input.projectId, input.targetTaskIds.join("-"));
    return await this.dataSource.transaction(async (manager) => {
      await ensureExecutionWorkspaceProject(manager, input, runGroupId);
      const preview = await buildPersistedDependencyPreview(manager, input, runGroupId);
      if (preview.blocked) {
        throw new Error(`Cannot dispatch dependency run: ${preview.warnings.join(" ") || "preview is blocked."}`);
      }

      const activeTasks = preview.tasks.filter((task) => task.column === "in-progress");
      if (activeTasks.length > 0) {
        throw new Error(`Cannot dispatch dependency run: task(s) already in progress: ${activeTasks.map((task) => task.id).join(", ")}`);
      }

      const scheduledRuns: DependencyRunScheduledRun[] = [];
      const skippedTasks: DependencyRunSkippedTask[] = [];
      for (const task of preview.tasks) {
        if (isSatisfiedColumn(task.column)) {
          skippedTasks.push({
            id: task.id,
            title: task.title,
            column: task.column,
            reason: "already satisfied",
          });
          continue;
        }
        if (!isQueueableColumn(task.column)) {
          skippedTasks.push({
            id: task.id,
            title: task.title,
            column: task.column,
            reason: "not queueable",
          });
          continue;
        }

        const queuePosition = scheduledRuns.length + 1;
        const run = {
          id: executionWorkflowId("run", runGroupId, String(queuePosition), task.id),
          projectId: input.projectId,
          taskId: task.id,
          traceId: runGroupId,
          status: "queued",
          dependencyTree: [...task.dependencyIds],
        };
        await manager.getRepository(FulcrumAgentRunEntity).save(run);
        await enqueueAgentRunJob(manager, {
          orgId: input.workspaceId,
          projectId: input.projectId,
          runId: run.id,
          taskId: run.taskId,
          traceId: runGroupId,
          agent: input.agent,
          model: input.model ?? null,
          prompt: input.prompt ?? null,
        });
        scheduledRuns.push({
          id: run.id,
          taskId: task.id,
          agent: input.agent,
          status: run.status,
          queuePosition,
          dependencyIds: [...task.dependencyIds],
        });
      }

      const auditRun = scheduledRuns[0];
      if (auditRun) {
        await manager.getRepository(FulcrumRunEventEntity).save({
          id: executionWorkflowId("event", runGroupId, "dependency-tree-dispatched"),
          projectId: input.projectId,
          runId: auditRun.id,
          taskId: auditRun.taskId,
          traceId: runGroupId,
          sequence: 1,
          domain: "executor",
          mutationType: "dependency_tree_dispatched",
          targetKind: "task",
          targetId: preview.targetTaskIds[0] ?? auditRun.taskId,
          agentId: input.agent,
          taskLineageId: runGroupId,
          payload: {
            runGroupId,
            mode: preview.mode,
            targetTaskIds: preview.targetTaskIds,
            orderedTaskIds: preview.orderedTaskIds,
            scheduledTaskIds: scheduledRuns.map((run) => run.taskId),
            scheduledRunIds: scheduledRuns.map((run) => run.id),
            skippedTaskIds: skippedTasks.map((task) => task.id),
            warnings: preview.warnings,
            model: input.model ?? null,
            prompt: input.prompt ?? null,
          },
        });
      }

      return {
        runGroupId,
        preview,
        scheduledRuns,
        skippedTasks,
        warnings: preview.warnings,
      };
    });
  }

  async recordTaskQaReview(
    input: TaskQaReviewInput,): Promise<TaskQaReviewOutput> {
    if (!this.dataSource) {
      throw new Error("DependencyRunService requires a TypeORM DataSource to record QA reviews.");
    }
    if (!input.taskId.trim()) throw new Error("QA review taskId is required.");
    if (!input.reviewText.trim()) throw new Error("QA review text is required.");

    const traceId = input.traceId ?? input.runId ?? executionWorkflowId("trace", input.projectId, input.taskId, "qa");
    return await this.dataSource.transaction(async (manager) => {
      await ensureExecutionWorkspaceProject(manager, input, traceId);
      const task = await manager.getRepository(FulcrumTaskEntity).findOneBy({
        id: input.taskId,
        projectId: input.projectId,
      });
      if (!task) throw new Error(`Task not found: ${input.taskId}`);

      const reviewerAgent = input.reviewerAgent?.trim() || "qa-reviewer";
      const verdict = extractReviewVerdict(input.reviewText);
      const successCriteria = task.successCriteria.map((text, index) => ({
        id: `criterion-${index + 1}`,
        text,
      }));
      let nextAction: TaskQaReviewNextAction = "manual_review_required";
      let feedbackRun: TaskQaFeedbackRun | null = null;
      let recoveryPlan: RethinkRecoveryPlan | null = null;

      if (verdict === "APPROVE") {
        await assertTypeOrmTaskCanBeQaApproved(manager, input.projectId, task.id);
        await manager.getRepository(FulcrumTaskEntity).save({...task,
          status: "in-review",
        });
        nextAction = "ready_for_final_review";
      } else if (verdict === "REVISE" || verdict === "RETHINK") {
        if (verdict === "RETHINK") {
          recoveryPlan = planRethinkRecovery({
            stepIndex: 0,
            reviewType: input.reviewType,
            baseline: input.baseline ?? null,
            checkpointId: input.checkpointId ?? null,
            review: input.reviewText,
            summary: input.summary ?? null,
          });
        }
        const run = {
          id: executionWorkflowId("run", traceId, "feedback", task.id),
          projectId: input.projectId,
          taskId: task.id,
          traceId,
          status: "queued",
          dependencyTree: [],
        };
        await manager.getRepository(FulcrumAgentRunEntity).save(run);
        await enqueueAgentRunJob(manager, {
          orgId: input.workspaceId,
          projectId: input.projectId,
          runId: run.id,
          taskId: run.taskId,
          traceId,
          agent: input.feedbackAgent?.trim() || "codex",
          model: input.feedbackModel ?? null,
          prompt: qaFeedbackPrompt(input, verdict, successCriteria),
        });
        feedbackRun = {
          id: run.id,
          taskId: task.id,
          agent: input.feedbackAgent?.trim() || "codex",
          status: run.status,
        };
        nextAction = "feedback_run_scheduled";
      }

      const qaReviewRunId = feedbackRun?.id ?? input.runId ?? null;
      if (qaReviewRunId) {
        await manager.getRepository(FulcrumRunEventEntity).save({
          id: executionWorkflowId("event", traceId, "qa-review-recorded", task.id),
          projectId: input.projectId,
          runId: qaReviewRunId,
          taskId: task.id,
          traceId,
          sequence: await nextRunEventSequence(manager, qaReviewRunId),
          domain: "review",
          mutationType: "qa_review_recorded",
          targetKind: "task",
          targetId: task.id,
          agentId: reviewerAgent,
          taskLineageId: traceId,
          payload: {
            traceId,
            runId: input.runId ?? null,
            reviewType: input.reviewType,
            verdict,
            nextAction,
            reviewerAgent,
            feedbackRunId: feedbackRun?.id ?? null,
            feedbackAgent: feedbackRun?.agent ?? null,
            feedbackModel: input.feedbackModel ?? null,
            successCriteria: successCriteria.map((criterion) => criterion.text),
            recoveryPlan,
            feedbackPrompt: qaFeedbackPrompt(input, verdict, successCriteria),
          },
        });
      }

      return {
        taskId: task.id,
        runId: input.runId ?? null,...(input.traceId ? { traceId } : {}),
        reviewType: input.reviewType,
        reviewerAgent,
        verdict,
        nextAction,
        successCriteria,
        feedbackRun,
        recoveryPlan,
      };
    });
  }

  async recordDependencyRunLifecycleEvent(
    input: DependencyRunLifecycleEventInput,): Promise<DependencyRunLifecycleEventOutput> {
    if (!this.dataSource) {
      throw new Error("DependencyRunService requires a TypeORM DataSource to record run lifecycle events.");
    }
    if (!input.projectId.trim()) throw new Error("Dependency run projectId is required.");
    if (!input.runId.trim()) throw new Error("Dependency run runId is required.");
    if (!input.status.trim()) throw new Error("Dependency run status is required.");
    if (!input.domain.trim()) throw new Error("Dependency run event domain is required.");
    if (!input.mutationType.trim()) throw new Error("Dependency run event mutationType is required.");
    if (!input.targetKind.trim()) throw new Error("Dependency run event targetKind is required.");
    if (!input.targetId.trim()) throw new Error("Dependency run event targetId is required.");

    return await this.dataSource.transaction(async (manager) => {
      const { event, run: updatedRun } = await persistDependencyRunLifecycleEvent(manager, input);
      return {
        run: {
          id: updatedRun.id,
          taskId: updatedRun.taskId,
          traceId: updatedRun.traceId,
          status: updatedRun.status,
        },
        event,
      };
    });
  }

  async runDependencyRunWorkerTick(
    input: DependencyRunWorkerTickInput,
    deps: DependencyRunWorkerTickDeps = {},
  ): Promise<DependencyRunWorkerTickOutput> {
    if (!this.dataSource) {
      throw new Error("DependencyRunService requires a TypeORM DataSource to run dependency workers.");
    }
    if (!input.projectId.trim()) throw new Error("Dependency run projectId is required.");
    const projectId = input.projectId;
    const traceId = input.traceId?.trim() || input.runGroupId?.trim();
    if (!traceId) throw new Error("Dependency run traceId is required.");
    const workerId = input.workerId?.trim() || "dependency-run-worker";
    const before = await this.loadDependencyRunLiveFeedback({ projectId, traceId });
    const candidate = firstEligibleQueuedRun(before.runs);
    if (!candidate) {
      return {
        projectId,
        traceId,
        runGroupId: traceId,
        workerId,
        processedRun: null,
        skippedReason: "no eligible queued dependency run",
        feedback: before,
      };
    }

    const claimed = await this.dataSource.transaction(async (manager) => {
      const project = await manager.getRepository(FulcrumProjectEntity).findOneBy({ id: projectId });
      if (!project) throw new Error(`Dependency run project not found: ${projectId}`);
      const job = await claimAgentRunJob(manager, {
        orgId: project.workspaceId,
        projectId,
        runId: candidate.id,
        workerId,
      });
      if (!job) return null;
      const run = await manager.getRepository(FulcrumAgentRunEntity).findOneBy({
        id: candidate.id,
        projectId,
      });
      if (!run) {
        await failAgentRunJob(manager, job, "agent run row missing");
        throw new Error(`Dependency run not found: ${candidate.id}`);
      }
      await updateTaskStatus(manager, projectId, run.taskId, "in-progress");
      const lifecycle = await persistDependencyRunLifecycleEvent(manager, {
        projectId,
        traceId,
        runId: run.id,
        taskId: run.taskId,
        status: "running",
        domain: "executor",
        mutationType: "agent_run_started",
        targetKind: run.taskId ? "task" : "agent_run",
        targetId: run.taskId ?? run.id,
        agentId: jobPayloadString(job.payload, "agent") ?? "agent",
        taskLineageId: traceId,
        summary: `Started ${run.taskId ?? run.id}`,
        output: `worker=${workerId}`,
        payload: { jobId: job.id, queuePosition: candidate.queuePosition },
      });
      return { job, run: lifecycle.run };
    });

    if (!claimed) {
      return {
        projectId,
        traceId,
        runGroupId: traceId,
        workerId,
        processedRun: null,
        skippedReason: "no queued job for eligible dependency run",
        feedback: before,
      };
    }

    try {
      const request = buildWorkerRunRequest({
        input,
        projectId,
        traceId,
        run: claimed.run,
        job: claimed.job,
        liveRun: candidate,
      });
      const result = await (deps.runAgent ?? defaultRunAgent)(request);
      const succeeded = result.exitCode === 0 && result.exitReason === "complete";
      const output = result.transcript.trim() || result.exitReason;
      if (succeeded) {
        await this.dataSource.transaction(async (manager) => {
          await completeAgentRunJob(manager, claimed.job.id);
          await updateTaskStatus(manager, projectId, claimed.run.taskId, "in-review");
          await persistDependencyRunLifecycleEvent(manager, {
            projectId,
            traceId,
            runId: claimed.run.id,
            taskId: claimed.run.taskId,
            status: "succeeded",
            domain: "executor",
            mutationType: "agent_run_completed",
            targetKind: claimed.run.taskId ? "task" : "agent_run",
            targetId: claimed.run.taskId ?? claimed.run.id,
            agentId: jobPayloadString(claimed.job.payload, "agent") ?? "agent",
            taskLineageId: traceId,
            summary: "Agent run completed",
            output,
            payload: {
              jobId: claimed.job.id,
              exitCode: result.exitCode,
              exitReason: result.exitReason,
              durationMs: result.durationMs,
              iterationCount: result.iterationCount,
              tokenUsed: result.tokenUsed ?? null,
              transcriptPath: result.transcriptPath ?? null,
              workspaceDiffPath: result.workspaceDiffPath ?? null,
            },
          });
        });
        return await this.workerTickOutput({
          projectId,
          traceId,
          workerId,
          run: claimed.run,
          job: claimed.job,
          status: "succeeded",
          output,
        });
      }

      const status = await this.failClaimedRun(projectId, traceId, claimed, output, result);
      return await this.workerTickOutput({
        projectId,
        traceId,
        workerId,
        run: claimed.run,
        job: claimed.job,
        status,
        output,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = await this.failClaimedRun(projectId, traceId, claimed, message, null);
      return await this.workerTickOutput({
        projectId,
        traceId,
        workerId,
        run: claimed.run,
        job: claimed.job,
        status,
        output: message,
      });
    }
  }

  private async failClaimedRun(
    projectId: string,
    traceId: string,
    claimed: { job: FulcrumJob; run: FulcrumAgentRun },
    output: string,
    result: AgentRunResult | null,
  ): Promise<"queued" | "failed"> {
    return await this.dataSource!.transaction(async (manager) => {
      const status = await failAgentRunJob(manager, claimed.job, output);
      await persistDependencyRunLifecycleEvent(manager, {
        projectId,
        traceId,
        runId: claimed.run.id,
        taskId: claimed.run.taskId,
        status,
        domain: "executor",
        mutationType: status === "queued" ? "agent_run_retry_queued" : "agent_run_failed",
        targetKind: claimed.run.taskId ? "task" : "agent_run",
        targetId: claimed.run.taskId ?? claimed.run.id,
        agentId: jobPayloadString(claimed.job.payload, "agent") ?? "agent",
        taskLineageId: traceId,
        summary: status === "queued" ? "Agent run queued for retry" : "Agent run failed",
        output,
        payload: {
          jobId: claimed.job.id,
          exitCode: result?.exitCode ?? null,
          exitReason: result?.exitReason ?? null,
        },
      });
      return status;
    });
  }

  private async workerTickOutput(
    input: {
      projectId: string;
      traceId: string;
      workerId: string;
      run: FulcrumAgentRun;
      job: FulcrumJob;
      status: "succeeded" | "failed" | "queued";
      output: string;
    },
  ): Promise<DependencyRunWorkerTickOutput> {
    return {
      projectId: input.projectId,
      traceId: input.traceId,
      runGroupId: input.traceId,
      workerId: input.workerId,
      processedRun: {
        id: input.run.id,
        taskId: input.run.taskId,
        traceId: input.traceId,
        agent: jobPayloadString(input.job.payload, "agent") ?? "codex",
        status: input.status,
        output: input.output,
        jobId: input.job.id,
      },
      skippedReason: null,
      feedback: await this.loadDependencyRunLiveFeedback({
        projectId: input.projectId,
        traceId: input.traceId,
      }),
    };
  }

  async runAutomatedFeedbackLoop(
    input: AutomatedFeedbackLoopInput,
    deps: AutomatedFeedbackLoopDeps = {},
  ): Promise<AutomatedFeedbackLoopOutput> {
    if (!this.dataSource) {
      throw new Error("DependencyRunService requires a TypeORM DataSource to run automated feedback loops.");
    }
    if (!input.projectId.trim()) throw new Error("Automated feedback projectId is required.");
    const traceId = input.traceId?.trim() || input.runGroupId?.trim();
    if (!traceId) throw new Error("Automated feedback traceId is required.");
    const maxIterations = input.maxIterations ?? 10;
    if (!Number.isInteger(maxIterations) || maxIterations < 1) {
      throw new Error("Automated feedback maxIterations must be at least 1.");
    }

    const metadata = await this.loadWorkflowMetadata(input);
    const processedRuns: AutomatedFeedbackLoopProcessedRun[] = [];
    const reviews: TaskQaReviewOutput[] = [];
    let feedback = await this.loadDependencyRunLiveFeedback({ projectId: input.projectId, traceId });
    let stopReason: AutomatedFeedbackLoopStopReason = "automated_feedback_exhausted";
    let iterations = 0;

    for (let index = 0; index < maxIterations; index += 1) {
      iterations = index + 1;
      const tick = await this.runDependencyRunWorkerTick({
        projectId: input.projectId,
        traceId,
        workerId: input.workerId ?? null,
        cwd: input.cwd ?? null,
        copyToWorktree: input.copyToWorktree ?? null,
      }, deps);
      feedback = tick.feedback;

      if (!tick.processedRun) {
        stopReason = feedback.executorStatus.active ? "worker_waiting" : "automated_feedback_exhausted";
        break;
      }

      processedRuns.push({
        id: tick.processedRun.id,
        taskId: tick.processedRun.taskId,
        status: tick.processedRun.status,
        output: tick.processedRun.output,
      });

      if (tick.processedRun.status === "failed") {
        stopReason = "agent_run_failed";
        break;
      }
      if (tick.processedRun.status === "queued") {
        stopReason = "worker_waiting";
        continue;
      }
      if (!tick.processedRun.taskId) {
        stopReason = feedback.executorStatus.active ? "worker_waiting" : "automated_feedback_exhausted";
        continue;
      }

      const review = deps.reviewTaskRun
        ? await deps.reviewTaskRun({ iteration: iterations, projectId: input.projectId, traceId, tick, feedback })
        : await this.runAutomatedReviewer(input, { iteration: iterations, projectId: input.projectId, traceId, tick, feedback }, deps.reviewAgent);
      if (!review.reviewText.trim()) {
        stopReason = "reviewer_unavailable";
        break;
      }

      const qa = await this.recordTaskQaReview({
        ...metadata,
        taskId: tick.processedRun.taskId,
        runId: tick.processedRun.id,
        traceId,
        reviewType: input.reviewType ?? "code",
        reviewerAgent: review.reviewerAgent ?? input.reviewerAgent ?? "qa-reviewer",
        reviewText: review.reviewText,
        feedbackAgent: input.feedbackAgent ?? null,
        feedbackModel: input.feedbackModel ?? null,
        summary: review.summary ?? null,
      });
      reviews.push(qa);
      feedback = await this.loadDependencyRunLiveFeedback({ projectId: input.projectId, traceId });
      if (qa.nextAction === "manual_review_required") {
        stopReason = "manual_review_required";
        break;
      }
      stopReason = qa.nextAction === "feedback_run_scheduled" ? "worker_waiting" : "automated_feedback_exhausted";
      if (!feedback.executorStatus.active && qa.nextAction === "ready_for_final_review") break;
    }

    if (iterations >= maxIterations && stopReason === "worker_waiting") {
      stopReason = "max_iterations_reached";
    }

    feedback = await this.loadDependencyRunLiveFeedback({ projectId: input.projectId, traceId });
    return {
      projectId: input.projectId,
      traceId,
      runGroupId: traceId,
      iterations,
      processedRuns,
      reviews,
      exhausted: stopReason === "automated_feedback_exhausted",
      stopReason,
      feedback,
    };
  }

  private async loadWorkflowMetadata(input: AutomatedFeedbackLoopInput): Promise<{
    workspaceId: string;
    workspaceSlug: string;
    workspaceName: string;
    projectId: string;
    projectSlug: string;
    projectName: string;
  }> {
    const project = await this.dataSource!.manager.getRepository(FulcrumProjectEntity).findOneBy({ id: input.projectId });
    if (!project) throw new Error(`Automated feedback project not found: ${input.projectId}`);
    const workspace = await this.dataSource!.manager.getRepository(FulcrumWorkspaceEntity).findOneBy({ id: project.workspaceId });
    return {
      workspaceId: input.workspaceId?.trim() || project.workspaceId,
      workspaceSlug: input.workspaceSlug?.trim() || workspace?.slug || project.workspaceId,
      workspaceName: input.workspaceName?.trim() || workspace?.name || project.workspaceId,
      projectId: input.projectId,
      projectSlug: input.projectSlug?.trim() || project.slug,
      projectName: input.projectName?.trim() || project.name,
    };
  }

  private async runAutomatedReviewer(
    loopInput: AutomatedFeedbackLoopInput,
    reviewInput: AutomatedFeedbackReviewInput,
    reviewAgent: ((request: DependencyRunWorkerRunContext) => Promise<AgentRunResult>) | undefined,
  ): Promise<AutomatedFeedbackReviewResult> {
    const processedRun = reviewInput.tick.processedRun;
    if (!processedRun?.taskId) return { reviewText: "", reviewerAgent: reviewerLabel(loopInput) };
    const task = await this.dataSource!.manager.getRepository(FulcrumTaskEntity).findOneBy({
      id: processedRun.taskId,
      projectId: reviewInput.projectId,
    });
    if (!task) return { reviewText: "", reviewerAgent: reviewerLabel(loopInput), summary: "Task not found." };
    const liveRun = reviewInput.feedback.runs.find((run) => run.id === processedRun.id);
    const resolved = resolveReviewerConfig(loopInput.reviewerAgent, loopInput.feedbackModel);
    const request: DependencyRunWorkerRunContext = {
      runId: `review-${processedRun.id}-${reviewInput.iteration}`,
      projectId: reviewInput.projectId,
      taskId: processedRun.taskId,
      traceId: reviewInput.traceId,
      agent: resolved.agentName,
      model: loopInput.feedbackModel ?? null,
      dependencyIds: liveRun?.dependencyIds ?? [],
      queuePosition: liveRun?.queuePosition ?? 1,
      worktree: {
        cwd: loopInput.cwd ?? process.cwd(),
        branch: `agent/review-${safeWorkflowSegment(processedRun.id)}-${reviewInput.iteration}`,
        ...(loopInput.copyToWorktree ? { copyToWorktree: loopInput.copyToWorktree } : {}),
      },
      agentProfile: resolved.profile,
      prompt: automatedReviewerPrompt({
        reviewType: loopInput.reviewType ?? "code",
        reviewerAgent: reviewerLabel(loopInput),
        task,
        processedRun,
        feedback: reviewInput.feedback,
      }),
      contextBundle: {
        projectId: reviewInput.projectId,
        taskId: processedRun.taskId,
        traceId: reviewInput.traceId,
        reviewType: loopInput.reviewType ?? "code",
        processedRun,
        executorStatus: reviewInput.feedback.executorStatus,
        dependencyIds: liveRun?.dependencyIds ?? [],
        queuePosition: liveRun?.queuePosition ?? 1,
      },
      timeout: resolved.profile.defaultTimeout,
    };
    const result = await (reviewAgent ?? runAgent)(request);
    if (result.exitCode !== 0 || result.exitReason !== "complete") {
      return {
        reviewerAgent: reviewerLabel(loopInput),
        reviewText: "",
        summary: result.transcript.trim() || result.exitReason,
      };
    }
    return { reviewerAgent: reviewerLabel(loopInput), reviewText: result.transcript.trim() };
  }

  async loadDependencyRunLiveFeedback(
    input: DependencyRunLiveFeedbackInput,): Promise<DependencyRunLiveFeedbackOutput> {
    if (!this.dataSource) {
      throw new Error("DependencyRunService requires a TypeORM DataSource to load dependency run feedback.");
    }
    if (!input.projectId.trim()) throw new Error("Dependency run projectId is required.");

    const manager = this.dataSource.manager;
    const runRepo = manager.getRepository(FulcrumAgentRunEntity);
    const eventRepo = manager.getRepository(FulcrumRunEventEntity);
    const seedRun = input.runId
      ? await runRepo.findOneBy({
        id: input.runId,
        projectId: input.projectId,
      })
      : null;
    const traceId = input.traceId?.trim() || input.runGroupId?.trim() || seedRun?.traceId;
    if (!traceId) throw new Error("Dependency run traceId or runId is required.");

    const runs = await runRepo.find({
      where: {
        projectId: input.projectId,
        traceId,...(input.taskId ? { taskId: input.taskId } : {}),...(input.runId ? { id: input.runId } : {}),
      },
      order: { createdAt: "ASC", id: "ASC" },
    });
    const events = await eventRepo.find({
      where: {
        projectId: input.projectId,
        traceId,...(input.taskId ? { taskId: input.taskId } : {}),...(input.runId ? { runId: input.runId } : {}),
      },
      order: { createdAt: "ASC", runId: "ASC", sequence: "ASC" },
    });
    const liveEvents = events.map(toLiveEvent);
    const latestByRunId = new Map<string, DependencyRunLiveEvent>;
    for (const event of liveEvents) latestByRunId.set(event.runId, event);
    const liveRuns = runs.map((run, index): DependencyRunLiveRun => {
      const latestEvent = latestByRunId.get(run.id) ?? null;
      return {
        id: run.id,
        taskId: run.taskId,
        traceId: run.traceId,
        status: run.status,
        queuePosition: index + 1,
        dependencyIds: normalizeStringArray(run.dependencyTree),
        latestEventSummary: latestEvent?.summary ?? null,
        lastActivityAt: latestEvent?.createdAt ?? isoOrNull(run.updatedAt ?? run.createdAt ?? null),
      };
    });
    const latestEvent = liveEvents.at(-1) ?? null;
    const executorStatus = buildExecutorStatus(liveRuns, latestEvent);

    return {
      projectId: input.projectId,
      traceId,
      runGroupId: traceId,
      fetchedAt: new Date().toISOString(),
      executorStatus,
      runs: liveRuns,
      events: liveEvents,
      latestEvent,
    };
  }
}

Injectable()(DependencyRunService);
Inject(DataSource)(DependencyRunService, undefined, 0);

function resolveReviewerConfig(
  reviewerAgent: string | null | undefined,
  model: string | null | undefined,
): ReturnType<typeof resolveAgentRunConfig> {
  const requested = reviewerAgent?.trim();
  const candidates = requested ? [requested, "codex"] : ["codex"];
  for (const candidate of candidates) {
    try {
      return resolveAgentRunConfig({
        requestedAgent: candidate,
        workflowOverride: { ...(model?.trim() ? { model: model.trim() } : {}) },
      });
    } catch (error) {
      if (candidate === "codex") throw error;
    }
  }
  return resolveAgentRunConfig({ requestedAgent: "codex", workflowOverride: {} });
}

function reviewerLabel(input: AutomatedFeedbackLoopInput): string {
  return input.reviewerAgent?.trim() || "qa-reviewer";
}

function automatedReviewerPrompt(input: {
  reviewType: ReviewType;
  reviewerAgent: string;
  task: FulcrumTask;
  processedRun: NonNullable<DependencyRunWorkerTickOutput["processedRun"]>;
  feedback: DependencyRunLiveFeedbackOutput;
}): string {
  const latestEvents = input.feedback.events.slice(-5).map((event) =>
    `- ${event.mutationType}: ${event.summary}${event.output ? ` (${truncate(event.output, 280)})` : ""}`
  );
  return [
    `You are ${input.reviewerAgent}. Review the completed ${input.reviewType} task run against the task description and success criteria.`,
    "Return a review with exactly one verdict heading: `### Verdict: APPROVE`, `### Verdict: REVISE`, or `### Verdict: RETHINK`.",
    "Use APPROVE only when the run output demonstrates the task success criteria. Use REVISE when focused corrective feedback can finish it. Use RETHINK when the task direction or plan must change.",
    `Task: ${input.task.title} (${input.task.id})`,
    `Task status: ${input.task.status}`,
    `Task description:\n${truncate(input.task.descriptionText || input.task.description || "(empty)", 2400)}`,
    `Success criteria:\n${input.task.successCriteria.map((criterion) => `- ${criterion}`).join("\n") || "- (none)"}`,
    `Processed run: ${input.processedRun.id}`,
    `Run status: ${input.processedRun.status}`,
    `Run output:\n${truncate(input.processedRun.output || "(empty)", 3600)}`,
    `Executor status: ${JSON.stringify(input.feedback.executorStatus)}`,
    latestEvents.length ? `Recent run events:\n${latestEvents.join("\n")}` : "Recent run events: none",
  ].join("\n\n");
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function safeWorkflowSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 64) || "run";
}

async function enqueueAgentRunJob(
  manager: EntityManager,
  input: {
    orgId: string;
    projectId: string;
    runId: string;
    taskId: string | null;
    traceId: string;
    agent: string;
    model: string | null;
    prompt: string | null;
  },
): Promise<void> {
  await manager.getRepository(FulcrumJobEntity).save({
    id: executionWorkflowId("job", input.traceId, input.runId),
    orgId: input.orgId,
    projectId: input.projectId,
    queue: "agent-runs",
    kind: "agent_run",
    payload: {
      run_id: input.runId,
      runId: input.runId,
      task_id: input.taskId,
      taskId: input.taskId,
      traceId: input.traceId,
      agent: input.agent,
      model: input.model,
      prompt: input.prompt,
    },
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
    availableAt: new Date(),
    lockedBy: null,
    lockedAt: null,
    lastError: null,
  });
}

async function claimAgentRunJob(
  manager: EntityManager,
  input: { orgId: string; projectId: string; runId: string; workerId: string },
): Promise<FulcrumJob | null> {
  const candidates = await manager.getRepository(FulcrumJobEntity).find({
    where: {
      orgId: input.orgId,
      projectId: input.projectId,
      queue: "agent-runs",
      kind: "agent_run",
      status: "queued",
    },
    order: { availableAt: "ASC", createdAt: "ASC", id: "ASC" },
  });
  const now = Date.now();
  const job = candidates.find((candidate) =>
    candidate.availableAt.getTime() <= now && jobPayloadString(candidate.payload, "run_id") === input.runId
  );
  if (!job) return null;
  job.status = "running";
  job.attempts += 1;
  job.lockedBy = input.workerId;
  job.lockedAt = new Date();
  return await manager.getRepository(FulcrumJobEntity).save(job);
}

async function completeAgentRunJob(
  manager: EntityManager,
  id: string,
): Promise<void> {
  await manager.getRepository(FulcrumJobEntity).update(id, {
    status: "succeeded",
    lockedBy: null,
    lockedAt: null,
  });
}

async function failAgentRunJob(
  manager: EntityManager,
  job: FulcrumJob,
  error: string,
): Promise<"queued" | "failed"> {
  const nextStatus = job.attempts < job.maxAttempts ? "queued" : "failed";
  await manager.getRepository(FulcrumJobEntity).update(job.id, {
    status: nextStatus,
    lockedBy: null,
    lockedAt: null,
    lastError: error.slice(0, 500),
    availableAt: new Date(),
  });
  return nextStatus;
}

async function updateTaskStatus(
  manager: EntityManager,
  projectId: string,
  taskId: string | null,
  status: string,
): Promise<void> {
  if (!taskId) return;
  await manager.getRepository(FulcrumTaskEntity).update({ id: taskId, projectId }, { status });
}

async function persistDependencyRunLifecycleEvent(
  manager: EntityManager,
  input: DependencyRunLifecycleEventInput,
): Promise<{ event: DependencyRunLiveEvent; run: FulcrumAgentRun }> {
  const runRepo = manager.getRepository(FulcrumAgentRunEntity);
  const eventRepo = manager.getRepository(FulcrumRunEventEntity);
  const run = await runRepo.findOneBy({
    id: input.runId,
    projectId: input.projectId,
  });
  if (!run) throw new Error(`Dependency run not found: ${input.runId}`);

  const traceId = input.traceId?.trim() || run.traceId;
  const taskId = input.taskId === undefined ? run.taskId : input.taskId;
  const latest = await eventRepo.findOne({
    where: { runId: input.runId },
    order: { sequence: "DESC" },
  });
  const sequence = (latest?.sequence ?? 0) + 1;
  const event = await eventRepo.save({
    id: executionWorkflowId("event", traceId, input.runId, String(sequence), input.mutationType),
    projectId: input.projectId,
    runId: input.runId,
    taskId: taskId ?? null,
    traceId,
    sequence,
    domain: input.domain,
    mutationType: input.mutationType,
    targetKind: input.targetKind,
    targetId: input.targetId,
    agentId: input.agentId?.trim() || null,
    taskLineageId: input.taskLineageId?.trim() || traceId,
    payload: lifecycleEventPayload(input),
  });
  const updatedRun = await runRepo.save({...run,
    taskId: taskId ?? null,
    traceId,
    status: input.status,
  });
  return { event: toLiveEvent(event), run: updatedRun };
}

async function ensureExecutionWorkspaceProject(
  manager: EntityManager,
  input: {
    workspaceId: string;
    workspaceSlug: string;
    workspaceName: string;
    projectId: string;
    projectSlug: string;
    projectName: string;
  },
  traceId: string,): Promise<void> {
  const workspaces = manager.getRepository(FulcrumWorkspaceEntity);
  const projects = manager.getRepository(FulcrumProjectEntity);
  const workspace = await workspaces.findOneBy({ id: input.workspaceId });
  if (!workspace) {
    await workspaces.save({
      id: input.workspaceId,
      slug: input.workspaceSlug,
      name: input.workspaceName,
    });
  }
  const project = await projects.findOneBy({ id: input.projectId });
  if (project) {
    await projects.save({ ...project, traceId });
    return;
  }
  await projects.save({
    id: input.projectId,
    workspaceId: input.workspaceId,
    slug: input.projectSlug,
    name: input.projectName,
    traceId,
  });
}

async function buildPersistedDependencyPreview(
  manager: EntityManager,
  input: {
    projectId: string;
    mode: DependencyRunMode;
    targetTaskIds: string[];
  },
  traceId: string,): Promise<DependencyRunPreview> {
  const tasks = await manager.getRepository(FulcrumTaskEntity).find({
    where: { projectId: input.projectId },
  });
  const dependencies = await manager.getRepository(FulcrumTaskDependencyEntity).find({
    where: { projectId: input.projectId },
  });
  const blockedBy = new Map<string, string[]>;
  const blocks = new Map<string, string[]>;
  for (const dependency of dependencies) {
    blockedBy.set(dependency.taskId, [...(blockedBy.get(dependency.taskId) ?? []), dependency.dependsOnTaskId]);
    blocks.set(dependency.dependsOnTaskId, [...(blocks.get(dependency.dependsOnTaskId) ?? []), dependency.taskId]);
  }

  return buildDependencyRunPreview({
    mode: input.mode,
    targetTaskIds: input.targetTaskIds,
    traceId,
    tasks: tasks.map((task): DependencyRunPreviewTask => ({
      id: task.id,
      title: task.title,
      column: taskStatusToColumn(task.status),
      blockedBy: task.status === "blocked" ? "status is blocked" : null,
      dependencies: {
        blocked_by: blockedBy.get(task.id) ?? [],
        blocks: blocks.get(task.id) ?? [],
      },
    })),
  });
}

function taskStatusToColumn(status: string | null): Column {
  const normalized = (status ?? "").trim().toLowerCase().replaceAll("_", "-");
  if (["done", "completed", "complete", "closed", "succeeded"].includes(normalized)) return "done";
  if (["in-review", "review", "reviewing"].includes(normalized)) return "in-review";
  if (["in-progress", "running", "active", "started"].includes(normalized)) return "in-progress";
  if (["archived", "cancelled", "canceled"].includes(normalized)) return "archived";
  if (normalized === "triage") return "triage";
  return "todo";
}

function isSatisfiedColumn(column: Column): boolean {
  return column === "done" || column === "in-review" || column === "archived";
}

function isQueueableColumn(column: Column): boolean {
  return column === "todo" || column === "triage";
}

async function assertTypeOrmTaskCanBeQaApproved(
  manager: EntityManager,
  projectId: string,
  taskId: string,): Promise<void> {
  const dependencies = await manager.getRepository(FulcrumTaskDependencyEntity).find({
    where: { projectId, taskId },
  });
  for (const dependency of dependencies) {
    const dependencyTask = await manager.getRepository(FulcrumTaskEntity).findOneBy({
      id: dependency.dependsOnTaskId,
      projectId,
    });
    const column = taskStatusToColumn(dependencyTask?.status ?? null);
    if (!isSatisfiedColumn(column)) {
      throw new Error(`Cannot approve QA review: unresolved dependencies: ${dependency.dependsOnTaskId}`);
    }
  }
}

async function nextRunEventSequence(manager: EntityManager, runId: string): Promise<number> {
  const row = await manager.getRepository(FulcrumRunEventEntity)
    .createQueryBuilder("event")
    .select("MAX(event.sequence)", "max")
    .where("event.runId = :runId", { runId })
    .getRawOne<{ max: string | number | null }>();
  const max = row?.max == null ? 0 : Number(row.max);
  return Number.isFinite(max) ? max + 1 : 1;
}

function qaFeedbackPrompt(
  input: TaskQaReviewInput,
  verdict: ReviewVerdict,
  criteria: TaskQaSuccessCriterion[],): string {
  const criteriaText = criteria.length
    ? ` criteria=${criteria.map((criterion) => criterion.text).join(" | ")}`
    : "";
  const response = buildReviewToolResponse({
    stepIndex: 1,
    stepName: "Fulcrum task QA",
    reviewType: input.reviewType,
    verdict,
    review: input.reviewText,
  });
  return [
    `QA feedback trace=${input.traceId ?? "none"}`,
    `task=${input.taskId}`,
    `verdict=${verdict}`,
    criteriaText,
    response,
  ].join(" ").replace(/\s+/g, " ").slice(0, 255);
}

function lifecycleEventPayload(input: DependencyRunLifecycleEventInput): Record<string, unknown> {
  return {...(input.payload ?? {}),
    status: input.status,...(input.summary?.trim() ? { summary: input.summary.trim() } : {}),...(input.output?.trim() ? { output: input.output.trim() } : {}),
  };
}

function toLiveEvent(event: {
  id: string;
  runId: string;
  taskId: string | null;
  traceId: string;
  sequence: number;
  domain: string;
  mutationType: string;
  targetKind: string;
  targetId: string;
  agentId: string | null;
  taskLineageId: string | null;
  payload: Record<string, unknown>;
  createdAt?: Date;
}): DependencyRunLiveEvent {
  const payload = event.payload ?? {};
  return {
    id: event.id,
    runId: event.runId,
    taskId: event.taskId,
    traceId: event.traceId,
    sequence: event.sequence,
    domain: event.domain,
    mutationType: event.mutationType,
    targetKind: event.targetKind,
    targetId: event.targetId,
    agentId: event.agentId,
    taskLineageId: event.taskLineageId,
    summary: typeof payload.summary === "string" ? payload.summary : humanizeMutationType(event.mutationType),
    output: typeof payload.output === "string" ? payload.output : null,
    payload,
    createdAt: isoOrNull(event.createdAt ?? null) ?? new Date(0).toISOString(),
  };
}

function buildExecutorStatus(
  runs: DependencyRunLiveRun[],
  latestEvent: DependencyRunLiveEvent | null,): DependencyRunExecutorStatus {
  const counts = {
    queuedTaskCount: 0,
    runningTaskCount: 0,
    succeededTaskCount: 0,
    failedTaskCount: 0,
    blockedTaskCount: 0,
    inReviewCount: 0,
  };
  for (const run of runs) {
    const status = normalizeStatus(run.status);
    if (status === "queued") counts.queuedTaskCount += 1;
    else if (status === "running") counts.runningTaskCount += 1;
    else if (status === "succeeded") counts.succeededTaskCount += 1;
    else if (status === "failed") counts.failedTaskCount += 1;
    else if (status === "blocked") counts.blockedTaskCount += 1;
    else if (status === "in-review") counts.inReviewCount += 1;
  }
  return {...counts,
    active: counts.queuedTaskCount + counts.runningTaskCount > 0,
    lastActivityAt: latestEvent?.createdAt ?? runs.at(-1)?.lastActivityAt ?? null,
  };
}

function firstEligibleQueuedRun(runs: DependencyRunLiveRun[]): DependencyRunLiveRun | null {
  const statusByTaskId = new Map<string, string>;
  for (const run of runs) {
    if (run.taskId) statusByTaskId.set(run.taskId, normalizeStatus(run.status));
  }
  for (const run of runs) {
    if (normalizeStatus(run.status) !== "queued") continue;
    const dependenciesReady = run.dependencyIds.every((dependencyId) => {
      const dependencyStatus = statusByTaskId.get(dependencyId);
      return !dependencyStatus || dependencyStatus === "succeeded" || dependencyStatus === "in-review";
    });
    if (dependenciesReady) return run;
  }
  return null;
}

function buildWorkerRunRequest(input: {
  input: DependencyRunWorkerTickInput;
  projectId: string;
  traceId: string;
  run: FulcrumAgentRun;
  job: FulcrumJob;
  liveRun: DependencyRunLiveRun;
}): DependencyRunWorkerRunContext {
  const agent = jobPayloadString(input.job.payload, "agent") ?? "codex";
  const model = jobPayloadString(input.job.payload, "model");
  const resolved = resolveAgentRunConfig({
    requestedAgent: agent,
    workflowOverride: {...(model ? { model } : {}) },
  });
  const prompt = jobPayloadString(input.job.payload, "prompt")
    ?? `Run dependency task ${input.run.taskId ?? input.run.id}`;
  return {
    runId: input.run.id,
    projectId: input.projectId,
    taskId: input.run.taskId,
    traceId: input.traceId,
    agent,
    model,
    dependencyIds: input.liveRun.dependencyIds,
    queuePosition: input.liveRun.queuePosition,
    worktree: {
      cwd: input.input.cwd ?? process.cwd(),
      branch: `agent/${input.run.id}`,...(input.input.copyToWorktree ? { copyToWorktree: input.input.copyToWorktree } : {}),
    },
    agentProfile: resolved.profile,
    prompt,
    contextBundle: {
      projectId: input.projectId,
      taskId: input.run.taskId,
      traceId: input.traceId,
      dependencyIds: input.liveRun.dependencyIds,
      queuePosition: input.liveRun.queuePosition,
    },
    timeout: resolved.profile.defaultTimeout,
  };
}

async function defaultRunAgent(request: DependencyRunWorkerRunContext): Promise<AgentRunResult> {
  return await runAgent(request);
}

function jobPayloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeStatus(status: string | null | undefined): "queued" | "running" | "succeeded" | "failed" | "blocked" | "in-review" | "other" {
  const normalized = (status ?? "").trim().toLowerCase().replaceAll("_", "-");
  if (["queued", "pending", "scheduled"].includes(normalized)) return "queued";
  if (["running", "in-progress", "active", "started"].includes(normalized)) return "running";
  if (["succeeded", "success", "completed", "complete", "done"].includes(normalized)) return "succeeded";
  if (["failed", "error", "timed-out", "retry-exhausted"].includes(normalized)) return "failed";
  if (["blocked", "stuck"].includes(normalized)) return "blocked";
  if (["in-review", "review", "reviewing"].includes(normalized)) return "in-review";
  return "other";
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function humanizeMutationType(value: string): string {
  const words = value.replaceAll(":", "_").replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function executionWorkflowId(prefix: string,...parts: string[]): string {
  const normalized = parts.join("-").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").toLowerCase();
  return `${prefix}-${normalized}`.slice(0, 128);
}
