import type { EntityManager } from "typeorm";

import {
  runAutomatedFeedbackLoopForTasks,
  type AutomatedFeedbackLoopDeps,
  type AutomatedFeedbackLoopOutput,
} from "@execution-orchestration/application/automated-feedback-loop.ts";
import { appendEventOrm } from "@platform-core/application/orm-helpers.ts";
import type {
  AppContext,
  BuildFinalQaReportInput,
  FinalQaReportOutput,
} from "@planning-review/domain/review-acceptance.ts";
import { buildFinalQaReport } from "@planning-review/application/reports/final-qa-actions.ts";

export interface BuildFinalQaFeedbackGateInput extends BuildFinalQaReportInput {
  workerId?: string | null;
  reviewerAgent?: string | null;
  feedbackAgent?: string | null;
  feedbackModel?: string | null;
  maxIterations?: number | null;
  cwd?: string | null;
  copyToWorktree?: string[] | null;
}

export interface FinalQaFeedbackGateOutput {
  projectId: string;
  traceId?: string;
  loopAttempted: boolean;
  initialFinalQa: FinalQaReportOutput;
  feedbackLoop: AutomatedFeedbackLoopOutput | null;
  finalQa: FinalQaReportOutput;
  readyForUserAcceptance: boolean;
  nextAction: FinalQaReportOutput["nextAction"];
  eventId: string;
}

export async function buildFinalQaFeedbackGate(
  em: EntityManager,
  ctx: AppContext,
  input: BuildFinalQaFeedbackGateInput,
  deps: AutomatedFeedbackLoopDeps = {},
): Promise<FinalQaFeedbackGateOutput> {
  const scopedCtx = { ...ctx, projectId: input.projectId };
  const initialFinalQa = await buildFinalQaReport(em, scopedCtx, input);
  const feedbackLoop = initialFinalQa.nextAction === "continue_automated_feedback"
    ? await runAutomatedFeedbackLoopForTasks(em, scopedCtx, {
      projectId: input.projectId,
      traceId: input.traceId,
      reviewType: "code",
      workerId: input.workerId ?? null,
      reviewerAgent: input.reviewerAgent ?? null,
      feedbackAgent: input.feedbackAgent ?? null,
      feedbackModel: input.feedbackModel ?? null,
      maxIterations: input.maxIterations ?? null,
      cwd: input.cwd ?? null,
      copyToWorktree: input.copyToWorktree ?? null,
    }, deps)
    : null;
  const finalQa = feedbackLoop
    ? await buildFinalQaReport(em, scopedCtx, input)
    : initialFinalQa;
  const event = await appendEventOrm(em, {
    orgId: scopedCtx.orgId,
    projectId: input.projectId,
    actor: "system",
    subjectKind: "project",
    subjectId: input.projectId,
    verb: "final_qa_feedback_gate_completed",
    payload: {
      traceId: input.traceId,
      loopAttempted: Boolean(feedbackLoop),
      loopStopReason: feedbackLoop?.stopReason ?? null,
      initialStatus: initialFinalQa.status,
      initialNextAction: initialFinalQa.nextAction,
      finalStatus: finalQa.status,
      finalNextAction: finalQa.nextAction,
      readyForUserAcceptance: finalQa.readyForUserAcceptance,
      openFeedbackRunCount: finalQa.summary.openFeedbackRunCount,
    },
  });

  return {
    projectId: input.projectId,
    ...(input.traceId ? { traceId: input.traceId } : {}),
    loopAttempted: Boolean(feedbackLoop),
    initialFinalQa,
    feedbackLoop,
    finalQa,
    readyForUserAcceptance: finalQa.readyForUserAcceptance,
    nextAction: finalQa.nextAction,
    eventId: event.id,
  };
}
