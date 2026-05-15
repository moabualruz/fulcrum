import type { EntityManager } from "@mikro-orm/postgresql";

import { resolveAgentRunConfig } from "@execution-orchestration/application/agent-catalog/resolve-agent-run-config.ts";
import { AppValidationError } from "@platform-core/domain/errors.ts";
import { appendEventOrm } from "@platform-core/application/orm-helpers.ts";
import { getTask } from "@work-management/application/work-item-queries.ts";
import type { AppContext } from "@work-management/domain/work-item.ts";
import { runAgent } from "@execution-orchestration/infrastructure/agent-runtime/sandbox-runner.ts";
import type { AgentRunResult } from "@execution-orchestration/infrastructure/agent-runtime/types.ts";
import {
  loadDependencyRunLiveFeedbackForTasks,
  publishDependencyRunLiveFeedbackForTasks,
  runNextDependencyRunWorkerTickForTasks,
  type DependencyRunLiveFeedbackOutput,
  type DependencyRunWorkerRunContext,
  type DependencyRunWorkerTickOutput,
} from "@execution-orchestration/application/dependency-run-live-feedback.ts";
import {
  recordTaskQaReview,
  type TaskQaReviewOutput,
} from "@execution-orchestration/application/qa-review-actions.ts";
import type { ReviewType } from "@execution-orchestration/domain/review-verdicts.ts";

export type AutomatedFeedbackLoopStopReason =
  | "automated_feedback_exhausted"
  | "agent_run_failed"
  | "max_iterations_reached"
  | "manual_review_required"
  | "reviewer_unavailable"
  | "worker_waiting";

export interface AutomatedFeedbackLoopInput {
  projectId?: string | null;
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

export interface AutomatedFeedbackLoopDeps {
  runAgent?: (request: DependencyRunWorkerRunContext) => Promise<AgentRunResult>;
  reviewAgent?: (request: DependencyRunWorkerRunContext) => Promise<AgentRunResult>;
  reviewTaskRun?: (input: AutomatedFeedbackReviewInput) => Promise<AutomatedFeedbackReviewResult>;
}

export interface AutomatedFeedbackLoopProcessedRun {
  id: string;
  taskId: string | null;
  status: "succeeded" | "failed" | "queued";
  output: string;
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

const DEFAULT_MAX_ITERATIONS = 10;

export async function runAutomatedFeedbackLoopForTasks(
  em: EntityManager,
  ctx: AppContext,
  input: AutomatedFeedbackLoopInput,
  deps: AutomatedFeedbackLoopDeps = {},): Promise<AutomatedFeedbackLoopOutput> {
  const projectId = input.projectId ?? ctx.projectId ?? null;
  if (!projectId) throw new AppValidationError("Automated feedback projectId is required.");
  const traceId = input.traceId?.trim() || input.runGroupId?.trim();
  if (!traceId) throw new AppValidationError("Automated feedback traceId is required.");
  const maxIterations = input.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new AppValidationError("Automated feedback maxIterations must be at least 1.");
  }

  const scopedCtx = {...ctx, projectId };
  const processedRuns: AutomatedFeedbackLoopProcessedRun[] = [];
  const reviews: TaskQaReviewOutput[] = [];
  let feedback = await loadDependencyRunLiveFeedbackForTasks(em, scopedCtx, { projectId, traceId });
  let stopReason: AutomatedFeedbackLoopStopReason = "automated_feedback_exhausted";
  let iterations = 0;

  for (let index = 0; index < maxIterations; index += 1) {
    iterations = index + 1;
    const tick = await runNextDependencyRunWorkerTickForTasks(em, scopedCtx, {
      projectId,
      traceId,
      workerId: input.workerId ?? null,
      cwd: input.cwd ?? null,
      copyToWorktree: input.copyToWorktree ?? null,
    }, {...(deps.runAgent ? { runAgent: deps.runAgent } : {}),
    });
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
    const reviewInput = {
      iteration: iterations,
      projectId,
      traceId,
      tick,
      feedback,
    };
    const review = deps.reviewTaskRun
      ? await deps.reviewTaskRun(reviewInput)
      : await runDefaultReviewerForTaskRun(
        em,
        scopedCtx,
        input,
        reviewInput,
        deps.reviewAgent ?? defaultReviewAgent,);
    if (!review.reviewText?.trim()) {
      stopReason = "reviewer_unavailable";
      break;
    }

    const qa = await recordTaskQaReview(em, scopedCtx, {
      taskId: tick.processedRun.taskId,
      runId: tick.processedRun.id,
      projectId,
      traceId,
      reviewType: input.reviewType ?? "code",
      reviewerAgent: review.reviewerAgent ?? input.reviewerAgent ?? "qa-reviewer",
      reviewText: review.reviewText,
      feedbackAgent: input.feedbackAgent ?? null,
      feedbackModel: input.feedbackModel ?? null,
      summary: review.summary ?? null,
    });
    reviews.push(qa);

    feedback = await publishDependencyRunLiveFeedbackForTasks(em, scopedCtx, { projectId, traceId });
    if (qa.nextAction === "manual_review_required") {
      stopReason = "manual_review_required";
      break;
    }
    stopReason = qa.nextAction === "feedback_run_scheduled"
      ? "worker_waiting"
      : "automated_feedback_exhausted";
    if (!feedback.executorStatus.active && qa.nextAction === "ready_for_final_review") {
      break;
    }
  }

  if (iterations >= maxIterations && stopReason === "worker_waiting") {
    stopReason = "max_iterations_reached";
  }

  feedback = await publishDependencyRunLiveFeedbackForTasks(em, scopedCtx, { projectId, traceId });
  await appendEventOrm(em, {
    orgId: scopedCtx.orgId,
    projectId,
    actor: "system",
    subjectKind: "workflow",
    subjectId: traceId,
    verb: "automated_feedback_loop_completed",
    payload: {
      traceId,
      runGroupId: traceId,
      stopReason,
      exhausted: stopReason === "automated_feedback_exhausted",
      iterations,
      processedRunIds: processedRuns.map((run) => run.id),
      reviewedRunIds: reviews.map((review) => review.runId).filter(Boolean),
      executorStatus: feedback.executorStatus,
    },
  });

  return {
    projectId,
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

async function runDefaultReviewerForTaskRun(
  em: EntityManager,
  ctx: AppContext,
  loopInput: AutomatedFeedbackLoopInput,
  input: AutomatedFeedbackReviewInput,
  runReviewAgent: (request: DependencyRunWorkerRunContext) => Promise<AgentRunResult>,): Promise<AutomatedFeedbackReviewResult> {
  const processedRun = input.tick.processedRun;
  if (!processedRun?.taskId) return { reviewText: "", reviewerAgent: reviewerLabel(loopInput) };
  const task = await getTask(em, ctx, processedRun.taskId);
  const liveRun = input.feedback.runs.find((run) => run.id === processedRun.id);
  const resolved = resolveRunnableReviewer(loopInput.reviewerAgent, loopInput.feedbackModel);
  const request: DependencyRunWorkerRunContext = {
    runId: `review-${processedRun.id}-${input.iteration}`,
    projectId: input.projectId,
    taskId: processedRun.taskId,
    traceId: input.traceId,
    agent: resolved.agentName,
    model: loopInput.feedbackModel ?? null,
    dependencyIds: liveRun?.dependencyIds ?? [],
    queuePosition: liveRun?.queuePosition ?? 1,
    worktree: {
      cwd: loopInput.cwd ?? process.cwd(),
      branch: `agent/review-${safeBranchSegment(processedRun.id)}-${input.iteration}`,...(loopInput.copyToWorktree ? { copyToWorktree: loopInput.copyToWorktree } : {}),
    },
    agentProfile: resolved.profile,
    prompt: buildReviewerPrompt({
      reviewType: loopInput.reviewType ?? "code",
      reviewerAgent: reviewerLabel(loopInput),
      task,
      processedRun,
      feedback: input.feedback,
    }),
    contextBundle: {
      projectId: input.projectId,
      taskId: processedRun.taskId,
      traceId: input.traceId,
      reviewType: loopInput.reviewType ?? "code",
      processedRun: {
        id: processedRun.id,
        taskId: processedRun.taskId,
        status: processedRun.status,
        output: processedRun.output,
      },
      executorStatus: input.feedback.executorStatus,
      dependencyIds: liveRun?.dependencyIds ?? [],
      queuePosition: liveRun?.queuePosition ?? 1,
    },
    timeout: resolved.profile.defaultTimeout,
  };
  let result: AgentRunResult;
  try {
    result = await runReviewAgent(request);
  } catch (error) {
    return {
      reviewerAgent: reviewerLabel(loopInput),
      reviewText: "",
      summary: error instanceof Error ? error.message : String(error),
    };
  }
  if (result.exitCode !== 0 || result.exitReason !== "complete") {
    return {
      reviewerAgent: reviewerLabel(loopInput),
      reviewText: "",
      summary: result.transcript.trim() || result.exitReason,
    };
  }
  return {
    reviewerAgent: reviewerLabel(loopInput),
    reviewText: result.transcript.trim(),
  };
}

async function defaultReviewAgent(request: DependencyRunWorkerRunContext): Promise<AgentRunResult> {
  return await runAgent(request);
}

function resolveRunnableReviewer(
  reviewerAgent: string | null | undefined,
  model: string | null | undefined,): ReturnType<typeof resolveAgentRunConfig> {
  const requested = reviewerAgent?.trim();
  const candidates = requested ? [requested, "codex"] : ["codex"];
  for (const candidate of candidates) {
    try {
      return resolveAgentRunConfig({
        requestedAgent: candidate,
        workflowOverride: {...(model?.trim() ? { model: model.trim() } : {}),
        },
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

function buildReviewerPrompt(input: {
  reviewType: ReviewType;
  reviewerAgent: string;
  task: Awaited<ReturnType<typeof getTask>>;
  processedRun: NonNullable<DependencyRunWorkerTickOutput["processedRun"]>;
  feedback: DependencyRunLiveFeedbackOutput;
}): string {
  const latestEvents = input.feedback.events.slice(-5).map((event) => (
    `- ${event.mutationType}: ${event.summary}${event.output ? ` (${truncate(event.output, 280)})` : ""}`));
  return [
    `You are ${input.reviewerAgent}. Review the completed ${input.reviewType} task run against the task description and success criteria.`,
    "Return a review with exactly one verdict heading: `### Verdict: APPROVE`, `### Verdict: REVISE`, or `### Verdict: RETHINK`.",
    "Use APPROVE only when the run output demonstrates the task success criteria. Use REVISE when focused corrective feedback can finish it. Use RETHINK when the task direction or plan must change.",
    `Task: ${input.task.title} (${input.task.id})`,
    `Task status: ${input.task.status}`,
    `Task description:\n${truncate(input.task.descriptionText || "(empty)", 2400)}`,
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

function safeBranchSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 64) || "run";
}
