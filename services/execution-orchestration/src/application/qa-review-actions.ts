import type { EntityManager } from "@mikro-orm/postgresql";

import { dispatchTaskRun } from "@execution-orchestration/application/runs/commands.ts";
import { AppValidationError } from "@platform-core/domain/errors.ts";
import { appendEventOrm } from "@platform-core/application/orm-helpers.ts";
import { updateTask } from "@work-management/application/work-item-commands.ts";
import { getTask } from "@work-management/application/work-item-queries.ts";
import type { AppContext, TaskDto } from "@work-management/domain/work-item.ts";
import type { Column } from "@execution-orchestration/domain/dependency-order.ts";
import {
  buildDirectTaskReviewData,
  type TaskReviewData,
} from "@execution-orchestration/domain/review-feed.ts";
import {
  buildReviewToolResponse,
  extractReviewVerdict,
  planRethinkRecovery,
  type RethinkRecoveryPlan,
  type ReviewType,
  type ReviewVerdict,
} from "@execution-orchestration/domain/review-verdicts.ts";
import { getTaskCompletionBlockerForWorkItem } from "@execution-orchestration/domain/task-completion.ts";

export type TaskQaReviewNextAction =
  | "ready_for_final_review"
  | "feedback_run_scheduled"
  | "manual_review_required";

export interface TaskQaSuccessCriterion {
  id: string;
  text: string;
}

export interface RecordTaskQaReviewInput {
  taskId: string;
  runId?: string | null;
  projectId?: string | null;
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
  reviewFeed: TaskReviewData;
}

export async function recordTaskQaReview(
  em: EntityManager,
  ctx: AppContext,
  input: RecordTaskQaReviewInput,): Promise<TaskQaReviewOutput> {
  if (!input.taskId?.trim()) throw new AppValidationError("QA review taskId is required.");
  if (!input.reviewText?.trim()) throw new AppValidationError("QA review text is required.");
  const scopedCtx = {...ctx,
    projectId: input.projectId ?? ctx.projectId ?? null,
  };
  const task = await getTask(em, scopedCtx, input.taskId);
  const reviewerAgent = input.reviewerAgent?.trim() || "qa-reviewer";
  const verdict = extractReviewVerdict(input.reviewText);
  const successCriteria = extractTaskSuccessCriteria(task);
  const reviewFeed = buildDirectTaskReviewData({
    task: {
      id: task.id,
      updatedAt: task.updatedAt.toISOString(),
      log: [{
        timestamp: new Date().toISOString(),
        action: `${input.reviewType} review Step 1: ${verdict}`,
      }],
    },
    agentLogs: [{
      timestamp: new Date().toISOString(),
      taskId: task.id,
      type: "text",
      text: input.reviewText,
      agent: "reviewer",
    }],
  });

  let feedbackRun: TaskQaFeedbackRun | null = null;
  let recoveryPlan: RethinkRecoveryPlan | null = null;
  let nextAction: TaskQaReviewNextAction = "manual_review_required";

  if (verdict === "APPROVE") {
    await assertTaskCanBeQaApproved(em, scopedCtx, task);
    await updateTask(em, scopedCtx, task.id, { status: "in_review" });
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
    const run = await dispatchTaskRun(em, scopedCtx, {
      taskId: task.id,
      agent: input.feedbackAgent?.trim() || "codex",
      model: input.feedbackModel ?? null,
      prompt: qaFeedbackPrompt(input, verdict, successCriteria),
    });
    feedbackRun = {
      id: run.id,
      taskId: task.id,
      agent: run.agent,
      status: run.status,
    };
    nextAction = "feedback_run_scheduled";
  }

  await appendEventOrm(em, {
    orgId: scopedCtx.orgId,
    projectId: scopedCtx.projectId ?? null,
    actor: reviewerAgent,
    subjectKind: "task",
    subjectId: task.id,
    verb: "qa_review_recorded",
    payload: {
      traceId: input.traceId,
      runId: input.runId ?? null,
      reviewType: input.reviewType,
      verdict,
      nextAction,
      reviewerAgent,
      feedbackRunId: feedbackRun?.id ?? null,
      successCriteria: successCriteria.map((criterion) => criterion.text),
      recoveryPlan,
    },
  });

  return {
    taskId: task.id,
    runId: input.runId ?? null,...(input.traceId ? { traceId: input.traceId } : {}),
    reviewType: input.reviewType,
    reviewerAgent,
    verdict,
    nextAction,
    successCriteria,
    feedbackRun,
    recoveryPlan,
    reviewFeed,
  };
}

async function assertTaskCanBeQaApproved(
  em: EntityManager,
  ctx: AppContext,
  task: TaskDto,): Promise<void> {
  const blocker = await getTaskCompletionBlockerForWorkItem(task, {
    resolveTask: async (taskId) => {
      try {
        const dependency = await getTask(em, ctx, taskId);
        return { id: dependency.id, column: taskStatusToColumn(dependency.status) };
      } catch (_error) {
        return null;
      }
    },
  });
  if (blocker) throw new AppValidationError(`Cannot approve QA review: ${blocker}`);
}

function extractTaskSuccessCriteria(task: TaskDto): TaskQaSuccessCriterion[] {
  const lines = task.descriptionText.split(/\r?\n/);
  const criteria: string[] = [];
  let inSuccessSection = false;

  for (const line of lines) {
    if (/^#{1,6}\s+success criteria\b/i.test(line.trim())) {
      inSuccessSection = true;
      continue;
    }
    if (inSuccessSection && /^#{1,6}\s+/.test(line.trim())) {
      inSuccessSection = false;
    }
    if (inSuccessSection) {
      const bullet = line.trim().match(/^[-*]\s+(.+)$/);
      if (bullet?.[1]) criteria.push(bullet[1].trim());
    }
    const inline = line.trim().match(/^success\s*:\s*(.+)$/i);
    if (inline?.[1]) criteria.push(inline[1].trim());
  }

  return [...new Set(criteria)].filter(Boolean).map((text, index) => ({ id: `criterion-${index + 1}`, text }));
}

function qaFeedbackPrompt(
  input: RecordTaskQaReviewInput,
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

function taskStatusToColumn(status: string | null): Column {
  const normalized = (status ?? "").trim().toLowerCase().replaceAll("_", "-");
  if (["done", "completed", "complete", "closed", "succeeded"].includes(normalized)) return "done";
  if (["in-review", "review", "reviewing"].includes(normalized)) return "in-review";
  if (["in-progress", "running", "active", "started"].includes(normalized)) return "in-progress";
  if (["archived", "cancelled", "canceled"].includes(normalized)) return "archived";
  if (normalized === "triage") return "triage";
  return "todo";
}
