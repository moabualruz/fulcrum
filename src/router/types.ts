export interface TaskFacts {
  task: {
    kind: string;
    priority: string;
    tags: string[];
    title: string;
  };
}

export type RoutingDecisionSource =
  | "explicit"
  | "rule"
  | "learned"
  | "llm-fallback"
  | "manual";

export interface RoutingDecision {
  ruleId: string | null;
  source: RoutingDecisionSource;
  agent: string;
  confidence: number | null;
}

export interface AutoAssignInput {
  taskId?: string;
  agentOverride?: string;
  taskFacts: TaskFacts;
  orgId: string;
  projectId?: string;
  dryRun?: boolean;
}
