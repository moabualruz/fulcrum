export interface RoutingRuleRow {
  id: string;
  orgId: string;
  projectId: string | null;
  name: string;
  conditionsJson: Record<string, unknown>;
  actionAgent: string;
  actionSkillSet: string[];
  priority: number;
  enabled: boolean;
  source: "manual" | "learned" | "imported";
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface RoutingDecisionRow {
  ruleId: string | null;
  source: string;
  agent: string;
  confidence: number | null;
}

export interface EnrichedDecisionRow {
  status: "matched" | "no_match" | "recommended" | "draft_created" | "conflict" | "abstained";
  matchedRuleId: string | null;
  draftId: string | null;
  factsUsed: Record<string, unknown>;
  confidence: number | null;
  backend: string | null;
  model: string | null;
  whyUnmatched: string | null;
  evidence: string[];
}

export interface DraftRow {
  id: string;
  orgId: string;
  proposedRule: string;
  source: string;
  confidence: number | null;
  conflictState: "review_needed" | "conflict" | "abstained";
  matchingActiveRuleIds: string[];
  createdAt: string | Date;
}

export interface LlmGateConfig {
  inputMode: "task_facts" | "task_plus_history" | "full_context";
  enabled: boolean;
}

export interface MlDraftBackend {
  configured: boolean;
  enabled: boolean;
  status: "running" | "stopped" | "degraded" | "unavailable" | "unconfigured";
  reason: string | null;
  model: string | null;
  embedProbe: "ok" | "fail" | "untested" | null;
  generateProbe: "ok" | "fail" | "untested" | null;
  dimensions: number | null;
  lastChecked: string | null;
}

export interface DimensionMismatchInfo {
  configuredDimension: number;
  schemaDimension: number;
  reason: string;
}
