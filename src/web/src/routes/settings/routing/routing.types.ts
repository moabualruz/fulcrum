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
