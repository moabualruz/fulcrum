import type {
  PlanningEvidenceRequirement,
  PlanningRisk,
  PlanningTriageOutput,
  PlanningTriageOverride,
  RequiredReviewType,
} from "@planning-review/domain/planning-triage.ts";

export interface ClassifyPlanningTriageInput {
  title?: string;
  markdown: string;
  changedPaths?: string[];
}

export interface ApplyPlanningTriageDecisionInput {
  triage: PlanningTriageOutput;
  selectedReviewTypes: RequiredReviewType[];
  override?: PlanningTriageOverride;
}

export interface PlanningTriageDecision {
  allowed: boolean;
  requiredReviewTypes: RequiredReviewType[];
  missingReviewTypes: RequiredReviewType[];
  override?: PlanningTriageOverride;
  reason: string;
}

const SECURITY_PATTERN = /\b(auth|oauth|passkey|permission|policy|secret|token|session|csrf|xss|ssrf|sql injection|security)\b/i;
const ARCHITECTURE_PATTERN = /\b(architecture|migration|typeorm|database|service boundary|domain|infrastructure|api|trpc|controller)\b/i;
const PROTOTYPE_PATTERN = /\b(prototype|design|ui|web|svelte|component|route|modal|drawer|widget|view)\b/i;
const LIGHTWEIGHT_PATTERN = /\b(typo|copy|docs?|readme|comment|format)\b/i;

const EVIDENCE_BY_REVIEW: Record<RequiredReviewType, PlanningEvidenceRequirement> = {
  lightweight_approval: {
    id: "approval-note",
    label: "Approval note naming changed scope",
    requiredFor: ["lightweight_approval"],
  },
  prototype_review: {
    id: "prototype-drift-proof",
    label: "Prototype or design fixture comparison",
    requiredFor: ["prototype_review"],
  },
  code_review: {
    id: "code-review-feedback",
    label: "Code review verdict with addressed findings",
    requiredFor: ["code_review"],
  },
  security_review: {
    id: "security-review-notes",
    label: "Security review notes for sensitive paths",
    requiredFor: ["security_review"],
  },
  uat: {
    id: "uat-evidence",
    label: "User acceptance evidence with observed result",
    requiredFor: ["uat"],
  },
};

export function classifyPlanningTriage(input: ClassifyPlanningTriageInput): PlanningTriageOutput {
  const haystack = `${input.title ?? ""}\n${input.markdown}\n${(input.changedPaths ?? []).join("\n")}`;
  const signals: string[] = [];
  const reviews = new Set<RequiredReviewType>();

  if (SECURITY_PATTERN.test(haystack)) {
    signals.push("security-sensitive");
    reviews.add("security_review");
    reviews.add("code_review");
    reviews.add("uat");
  }

  if (ARCHITECTURE_PATTERN.test(haystack)) {
    signals.push("architecture-or-service-boundary");
    reviews.add("code_review");
    reviews.add("uat");
  }

  if (PROTOTYPE_PATTERN.test(haystack)) {
    signals.push("prototype-or-ui");
    reviews.add("prototype_review");
    reviews.add("uat");
  }

  if (reviews.size === 0) {
    signals.push(LIGHTWEIGHT_PATTERN.test(haystack) ? "lightweight-change" : "uncategorized-low-risk");
    reviews.add("lightweight_approval");
  }

  const risk = riskForSignals(signals);
  const requiredReviewTypes = orderReviewTypes(reviews);
  const evidenceRequirements = requiredReviewTypes.map((type) => EVIDENCE_BY_REVIEW[type]);

  return {
    risk,
    requiredReviewTypes,
    evidenceRequirements,
    signals,
    reason: buildReason(risk, signals, requiredReviewTypes),
  };
}

export function applyPlanningTriageDecision(input: ApplyPlanningTriageDecisionInput): PlanningTriageDecision {
  const selected = new Set(input.selectedReviewTypes);
  const missingReviewTypes = input.triage.requiredReviewTypes.filter((type) => !selected.has(type));
  const highRiskMissingProtectedGate = input.triage.risk === "high" &&
    (missingReviewTypes.includes("code_review") || missingReviewTypes.includes("uat"));

  if (highRiskMissingProtectedGate && !hasValidOverride(input.override)) {
    return {
      allowed: false,
      requiredReviewTypes: input.triage.requiredReviewTypes,
      missingReviewTypes,
      reason: "high-risk plans require code review and UAT unless a named approver records a waiver reason",
    };
  }

  return {
    allowed: true,
    requiredReviewTypes: input.selectedReviewTypes,
    missingReviewTypes,
    ...(input.override ? { override: input.override } : {}),
    reason: input.override
      ? `manual override by ${input.override.approverId}: ${input.override.reason}`
      : "selected review gates satisfy planning triage",
  };
}

function riskForSignals(signals: string[]): PlanningRisk {
  if (signals.includes("security-sensitive") || signals.includes("architecture-or-service-boundary")) return "high";
  if (signals.includes("prototype-or-ui")) return "medium";
  return "low";
}

function orderReviewTypes(reviews: Set<RequiredReviewType>): RequiredReviewType[] {
  const order: RequiredReviewType[] = ["security_review", "code_review", "prototype_review", "uat", "lightweight_approval"];
  return order.filter((type) => reviews.has(type));
}

function buildReason(risk: PlanningRisk, signals: string[], requiredReviewTypes: RequiredReviewType[]): string {
  return `${risk} risk from ${signals.join(", ")}; requires ${requiredReviewTypes.join(", ")}`;
}

function hasValidOverride(override: PlanningTriageOverride | undefined): override is PlanningTriageOverride {
  return Boolean(override?.approverId.trim() && override.reason.trim() && override.createdAt.trim());
}

