export type PlanningRisk = "low" | "medium" | "high";
export type RequiredReviewType =
  | "lightweight_approval"
  | "prototype_review"
  | "code_review"
  | "security_review"
  | "uat";

export interface PlanningEvidenceRequirement {
  id: string;
  label: string;
  requiredFor: RequiredReviewType[];
}

export interface PlanningTriageOverride {
  approverId: string;
  reason: string;
  createdAt: string;
}

export interface PlanningTriageOutput {
  risk: PlanningRisk;
  requiredReviewTypes: RequiredReviewType[];
  evidenceRequirements: PlanningEvidenceRequirement[];
  reason: string;
  signals: string[];
  override?: PlanningTriageOverride;
}

