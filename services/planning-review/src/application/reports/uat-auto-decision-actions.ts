import type { EntityManager } from "typeorm";

import { TenantSetting } from "@platform-core/infrastructure/application-database/entities/TenantSetting.ts";
import { AppValidationError } from "@platform-core/domain/errors.ts";
import { appendEventOrm } from "@platform-core/application/orm-helpers.ts";
import { recordUatCodeReviewDecision } from "@planning-review/application/reports/uat-decision-actions.ts";
import type {
  AppContext,
  ApplyConfiguredUatCodeReviewDecisionInput,
  ConfiguredUatCodeReviewDecisionOutput,
  GeneratedE2eRegressionRunner,
  UatCodeReviewAutoDecisionConfig,
  UatCodeReviewDecision,
  UatCodeReviewDecisionOutput,
  UatCodeReviewSessionType,
} from "@planning-review/domain/review-acceptance.ts";

export const UAT_CODE_REVIEW_AUTO_DECISION_SETTING_KEY = "reports.uatCodeReviewAutoDecision";

export async function applyConfiguredUatCodeReviewDecision(
  em: EntityManager,
  ctx: AppContext,
  input: ApplyConfiguredUatCodeReviewDecisionInput,
): Promise<ConfiguredUatCodeReviewDecisionOutput> {
  const setting = await em.findOne(TenantSetting, { where: {
    orgId: ctx.orgId,
    key: UAT_CODE_REVIEW_AUTO_DECISION_SETTING_KEY,
  } as never });
  if (!setting) {
    return skipped(em, ctx, input, {
      status: "not_configured",
      nextAction: "configure_auto_decision",
      config: null,
      reason: "missing_setting",
    });
  }

  const config = parseAutoDecisionConfig(setting.value);
  if (!config.enabled) {
    return skipped(em, ctx, input, {
      status: "disabled",
      nextAction: "manual_review_required",
      config,
      reason: "disabled",
    });
  }

  const decision = await recordUatCodeReviewDecision(em, ctx, {
    projectId: input.projectId,
    traceId: input.traceId,
    decision: config.decision,
    reviewType: config.reviewType,
    feedbackText: config.feedbackText,
    feedbackAgent: config.feedbackAgent,
    feedbackModel: config.feedbackModel,
    taskIds: input.taskIds ?? config.taskIds,
    e2eRunner: config.e2eRunner,
  });
  const status = decision.status === "blocked" ? "blocked" : "applied";
  const event = await appendEventOrm(em, {
    orgId: ctx.orgId,
    projectId: input.projectId,
    actor: ctx.userId ?? "system",
    subjectKind: "project",
    subjectId: input.projectId,
    verb: "uat_code_review_auto_decision_applied",
    payload: {
      traceId: input.traceId,
      settingKey: UAT_CODE_REVIEW_AUTO_DECISION_SETTING_KEY,
      decision: config.decision,
      reviewType: config.reviewType,
      status,
      nextAction: decision.nextAction,
      decisionEventId: decision.eventId,
      generatedE2eArtifactIds: decision.generatedE2eTests.map((test) => test.artifactId),
      feedbackRunIds: decision.feedbackRuns.map((run) => run.id),
    },
  });
  return output(input, {
    config,
    decision,
    eventId: event.id,
    status,
    nextAction: decision.nextAction,
  });
}

async function skipped(
  em: EntityManager,
  ctx: AppContext,
  input: ApplyConfiguredUatCodeReviewDecisionInput,
  skippedInput: {
    status: "not_configured" | "disabled";
    nextAction: "configure_auto_decision" | "manual_review_required";
    config: UatCodeReviewAutoDecisionConfig | null;
    reason: string;
  },
): Promise<ConfiguredUatCodeReviewDecisionOutput> {
  const event = await appendEventOrm(em, {
    orgId: ctx.orgId,
    projectId: input.projectId,
    actor: ctx.userId ?? "system",
    subjectKind: "project",
    subjectId: input.projectId,
    verb: "uat_code_review_auto_decision_skipped",
    payload: {
      traceId: input.traceId,
      settingKey: UAT_CODE_REVIEW_AUTO_DECISION_SETTING_KEY,
      status: skippedInput.status,
      nextAction: skippedInput.nextAction,
      reason: skippedInput.reason,
    },
  });
  return output(input, {
    config: skippedInput.config,
    decision: null,
    eventId: event.id,
    status: skippedInput.status,
    nextAction: skippedInput.nextAction,
  });
}

function parseAutoDecisionConfig(value: unknown): UatCodeReviewAutoDecisionConfig {
  if (!isRecord(value)) throw new AppValidationError("UAT/code-review auto-decision setting must be a JSON object.");
  const enabled = value["enabled"] === true;
  const decision = parseDecision(value["decision"]);
  const reviewType = parseReviewType(value["reviewType"]);
  return {
    enabled,
    decision,
    reviewType,
    ...(stringValue(value["feedbackText"]) ? { feedbackText: stringValue(value["feedbackText"]) } : {}),
    ...(nullableStringValue(value["feedbackAgent"]) !== undefined ? { feedbackAgent: nullableStringValue(value["feedbackAgent"]) } : {}),
    ...(nullableStringValue(value["feedbackModel"]) !== undefined ? { feedbackModel: nullableStringValue(value["feedbackModel"]) } : {}),
    ...(stringArray(value["taskIds"]) ? { taskIds: stringArray(value["taskIds"]) } : {}),
    ...(parseOptionalRunner(value["e2eRunner"]) ? { e2eRunner: parseOptionalRunner(value["e2eRunner"]) } : {}),
  };
}

function parseDecision(value: unknown): UatCodeReviewDecision {
  if (
    value === "start_uat" ||
    value === "start_code_review" ||
    value === "request_changes" ||
    value === "approve_without_manual_review"
  ) return value;
  throw new AppValidationError("UAT/code-review auto-decision setting requires a valid decision.");
}

function parseReviewType(value: unknown): UatCodeReviewSessionType {
  if (value === "uat" || value === "code_review") return value;
  throw new AppValidationError("UAT/code-review auto-decision setting requires reviewType uat or code_review.");
}

function parseOptionalRunner(value: unknown): GeneratedE2eRegressionRunner | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "bun" || value === "playwright") return value;
  throw new AppValidationError("UAT/code-review auto-decision e2eRunner must be bun or playwright.");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nullableStringValue(value: unknown): string | null | undefined {
  if (value === null) return null;
  return stringValue(value);
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  return values.length ? values : undefined;
}

function output(
  input: ApplyConfiguredUatCodeReviewDecisionInput,
  parts: {
    config: UatCodeReviewAutoDecisionConfig | null;
    decision: UatCodeReviewDecisionOutput | null;
    eventId: string;
    status: ConfiguredUatCodeReviewDecisionOutput["status"];
    nextAction: ConfiguredUatCodeReviewDecisionOutput["nextAction"];
  },
): ConfiguredUatCodeReviewDecisionOutput {
  return {
    projectId: input.projectId,
    ...(input.traceId ? { traceId: input.traceId } : {}),
    settingKey: UAT_CODE_REVIEW_AUTO_DECISION_SETTING_KEY,
    status: parts.status,
    nextAction: parts.nextAction,
    config: parts.config,
    decision: parts.decision,
    eventId: parts.eventId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
