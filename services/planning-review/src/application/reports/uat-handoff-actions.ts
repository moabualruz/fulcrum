import type { EntityManager } from "@mikro-orm/postgresql";

import { appendEventOrm } from "@platform-core/application/orm-helpers.ts";
import { buildFinalQaReport } from "@planning-review/application/reports/final-qa-actions.ts";
import type {
  AppContext,
  BuildUatCodeReviewHandoffInput,
  FinalQaReportOutput,
  FinalQaTaskResult,
  UatCodeReviewDecisionOption,
  UatCodeReviewHandoffOutput,
  UatCodeReviewSession,
} from "@planning-review/domain/review-acceptance.ts";

export async function buildUatCodeReviewHandoff(
  em: EntityManager,
  ctx: AppContext,
  input: BuildUatCodeReviewHandoffInput,
): Promise<UatCodeReviewHandoffOutput> {
  const finalQa = await buildFinalQaReport(em, ctx, input);
  const ready = finalQa.status === "passed" && finalQa.readyForUserAcceptance;
  const traceId = input.traceId;
  const reviewSessions = ready ? reviewSessionsFor(finalQa, traceId) : [];
  const nextAction = ready ? "prompt_user_for_uat_code_review" : finalQa.nextAction;
  const promptMarkdown = ready ? readyPrompt(finalQa, reviewSessions) : blockedPrompt(finalQa);
  const event = await appendEventOrm(em, {
    orgId: ctx.orgId,
    projectId: input.projectId,
    actor: "system",
    subjectKind: "project",
    subjectId: input.projectId,
    verb: ready ? "uat_code_review_prompted" : "uat_code_review_blocked",
    payload: {
      traceId,
      status: ready ? "ready" : "blocked",
      finalQaStatus: finalQa.status,
      nextAction,
      reviewSessionIds: reviewSessions.map((session) => session.id),
      taskIds: finalQa.taskResults.map((task) => task.taskId),
      summary: finalQa.summary,
    },
  });

  return {
    projectId: input.projectId,
    traceId,
    status: ready ? "ready" : "blocked",
    finalQaStatus: finalQa.status,
    nextAction,
    finalQa,
    reviewSessions,
    decisionOptions: ready ? readyDecisionOptions() : blockedDecisionOptions(finalQa),
    promptMarkdown,
    eventId: event.id,
  };
}

function reviewSessionsFor(finalQa: FinalQaReportOutput, traceId?: string): UatCodeReviewSession[] {
  const taskIds = finalQa.taskResults.map((task) => task.taskId);
  return [
    {
      id: sessionId("uat", finalQa.projectId, traceId),
      type: "uat",
      title: "User Acceptance Testing",
      status: "pending_user_decision",
      traceId,
      taskIds,
      promptMarkdown: uatPrompt(finalQa),
    },
    {
      id: sessionId("code-review", finalQa.projectId, traceId),
      type: "code_review",
      title: "Code Review",
      status: "pending_user_decision",
      traceId,
      taskIds,
      promptMarkdown: codeReviewPrompt(finalQa),
    },
  ];
}

function sessionId(kind: string, projectId: string, traceId?: string): string {
  const source = traceId || projectId;
  return `${kind}-${source.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function readyDecisionOptions(): UatCodeReviewDecisionOption[] {
  return [
    {
      id: "start_uat",
      label: "Start UAT",
      description: "Open the UAT review flow against the final-QA evidence.",
    },
    {
      id: "start_code_review",
      label: "Start Code Review",
      description: "Open the code-review flow against the same trace and task evidence.",
    },
    {
      id: "request_changes",
      label: "Request Changes",
      description: "Send UAT/code-review feedback back into automated agent loops.",
    },
    {
      id: "approve_without_manual_review",
      label: "Approve Without Manual Review",
      description: "Record explicit user approval and continue to real-data E2E generation.",
    },
  ];
}

function blockedDecisionOptions(finalQa: FinalQaReportOutput): UatCodeReviewDecisionOption[] {
  return [
    {
      id: finalQa.nextAction === "continue_automated_feedback" ? "continue_automated_feedback" : "manual_review_required",
      label: finalQa.nextAction === "continue_automated_feedback" ? "Continue Feedback" : "Manual Review Required",
      description: "Resolve final-QA blockers before prompting the user for UAT or code review.",
    },
  ];
}

function readyPrompt(finalQa: FinalQaReportOutput, sessions: UatCodeReviewSession[]): string {
  return [
    "# UAT And Code Review Handoff",
    "",
    `Trace: ${finalQa.traceId ?? "none"}`,
    `Final QA: ${finalQa.status}`,
    `Next action: prompt_user_for_uat_code_review`,
    "",
    "## Review Sessions",
    ...sessions.map((session) => `- ${session.title}: ${session.id} (${session.status})`),
    "",
    "## Final QA Summary",
    `- Tasks: ${finalQa.summary.taskCount}`,
    `- Docs: ${finalQa.summary.docCount}`,
    `- Runs: ${finalQa.summary.runCount}`,
    `- Artifacts: ${finalQa.summary.artifactCount}`,
    `- Open feedback runs: ${finalQa.summary.openFeedbackRunCount}`,
    "",
    "## Success Criteria",
    ...criteriaLines(finalQa.taskResults),
    "",
    "## Decision Options",
    ...readyDecisionOptions().map((option) => `- ${option.id}: ${option.description}`),
  ].join("\n");
}

function blockedPrompt(finalQa: FinalQaReportOutput): string {
  return [
    "# UAT And Code Review Handoff Blocked",
    "",
    "Final QA has not passed.",
    `Trace: ${finalQa.traceId ?? "none"}`,
    `Final QA: ${finalQa.status}`,
    `Next action: ${finalQa.nextAction}`,
    "",
    "## Blocking Checks",
    ...finalQa.checks
      .filter((check) => check.status === "fail")
      .map((check) => `- ${check.id}: ${check.details}`),
  ].join("\n");
}

function uatPrompt(finalQa: FinalQaReportOutput): string {
  return [
    "# User Acceptance Testing",
    "",
    `Trace: ${finalQa.traceId ?? "none"}`,
    "Review the accepted workflow against the success criteria below.",
    "",
    ...criteriaLines(finalQa.taskResults),
    "",
    "Submit approval, requested changes, or skipped-with-reason.",
  ].join("\n");
}

function codeReviewPrompt(finalQa: FinalQaReportOutput): string {
  return [
    "# Code Review",
    "",
    `Trace: ${finalQa.traceId ?? "none"}`,
    "Review implementation evidence, task runs, artifacts, and linked criteria before approval.",
    "",
    ...finalQa.taskResults.map((task) => (
      `- ${task.title} (${task.taskId}): verdict ${task.latestVerdict ?? "none"}, artifacts ${task.artifactIds.length}`
    )),
    "",
    "Submit approval, requested changes, or skipped-with-reason.",
  ].join("\n");
}

function criteriaLines(tasks: FinalQaTaskResult[]): string[] {
  const lines: string[] = [];
  for (const task of tasks) {
    lines.push(`- ${task.title} (${task.taskId})`);
    for (const criterion of task.successCriteria) {
      lines.push(`  - ${criterion}`);
    }
  }
  return lines.length ? lines : ["- No explicit success criteria were found."];
}
