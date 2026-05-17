import type { EntityManager } from "typeorm";

import type { AppContext } from "@planning-review/domain/review-acceptance.ts";
import type {
  BuildFinalQaReportInput,
  BuildUatCodeReviewHandoffInput,
  RecordUatCodeReviewDecisionInput,
  RunGeneratedE2eRegressionTestsInput,
  ApplyConfiguredUatCodeReviewDecisionInput,
  UatCodeReviewDecision,
  UatCodeReviewSessionType,
  GeneratedE2eRegressionRunner,
} from "@planning-review/domain/review-acceptance.ts";
import type {
  AppendReviewWorkbenchAnnotationInput,
  LoadReviewWorkbenchSessionInput,
  ReviewWorkbenchSessionType,
  SaveReviewWorkbenchSessionInput,
} from "@planning-review/application/reviews/review-workbench-session-actions.ts";
import type { ReviewWorkbenchInput } from "@planning-review/application/reviews/review-workbench.ts";
import type { BuildFinalQaFeedbackGateInput } from "@planning-review/application/reports/final-qa-feedback-gate.ts";

export type {
  AppendReviewWorkbenchAnnotationInput,
  GeneratedE2eRegressionRunner,
  ReviewWorkbenchSessionType,
  UatCodeReviewDecision,
  UatCodeReviewSessionType,
};

export async function buildFinalQaReport(
  em: EntityManager,
  ctx: AppContext,
  input: BuildFinalQaReportInput,
) {
  const service = await import("@planning-review/application/reports/final-qa-actions.ts");
  return service.buildFinalQaReport(em, ctx, input);
}

export async function buildFinalQaFeedbackGate(
  em: EntityManager,
  ctx: AppContext,
  input: BuildFinalQaFeedbackGateInput,
) {
  const service = await import("@planning-review/application/reports/final-qa-feedback-gate.ts");
  return service.buildFinalQaFeedbackGate(em, ctx, input);
}

export async function buildUatCodeReviewHandoff(
  em: EntityManager,
  ctx: AppContext,
  input: BuildUatCodeReviewHandoffInput,
) {
  const service = await import("@planning-review/application/reports/uat-handoff-actions.ts");
  return service.buildUatCodeReviewHandoff(em, ctx, input);
}

export async function recordUatCodeReviewDecision(
  em: EntityManager,
  ctx: AppContext,
  input: RecordUatCodeReviewDecisionInput,
) {
  const service = await import("@planning-review/application/reports/uat-decision-actions.ts");
  return service.recordUatCodeReviewDecision(em, ctx, input);
}

export async function applyConfiguredUatCodeReviewDecision(
  em: EntityManager,
  ctx: AppContext,
  input: ApplyConfiguredUatCodeReviewDecisionInput,
) {
  const service = await import("@planning-review/application/reports/uat-auto-decision-actions.ts");
  return service.applyConfiguredUatCodeReviewDecision(em, ctx, input);
}

export async function runGeneratedE2eRegressionTests(
  em: EntityManager,
  ctx: AppContext,
  input: RunGeneratedE2eRegressionTestsInput,
) {
  const service = await import("@planning-review/application/reports/generated-e2e-run-actions.ts");
  return service.runGeneratedE2eRegressionTests(em, ctx, input);
}

export async function listGeneratedE2eRunHistory(
  em: EntityManager,
  ctx: AppContext,
  input: { projectId: string; limit?: number },
) {
  const service = await import("@planning-review/application/reports/generated-e2e-run-actions.ts");
  return service.listGeneratedE2eRunHistory(em, ctx, input);
}

export async function buildReviewWorkbenchModel(input: ReviewWorkbenchInput) {
  const service = await import("@planning-review/application/reviews/review-workbench.ts");
  return service.buildReviewWorkbenchModel(input);
}

export async function saveReviewWorkbenchSession(
  em: EntityManager,
  ctx: AppContext,
  input: SaveReviewWorkbenchSessionInput,
) {
  const service = await import("@planning-review/application/reviews/review-workbench-session-actions.ts");
  return service.saveReviewWorkbenchSession(em, ctx, input);
}

export async function loadReviewWorkbenchSession(
  em: EntityManager,
  ctx: AppContext,
  input: LoadReviewWorkbenchSessionInput,
) {
  const service = await import("@planning-review/application/reviews/review-workbench-session-actions.ts");
  return service.loadReviewWorkbenchSession(em, ctx, input);
}

export async function appendReviewWorkbenchAnnotation(
  em: EntityManager,
  ctx: AppContext,
  input: AppendReviewWorkbenchAnnotationInput,
) {
  const service = await import("@planning-review/application/reviews/review-workbench-session-actions.ts");
  return service.appendReviewWorkbenchAnnotation(em, ctx, input);
}
