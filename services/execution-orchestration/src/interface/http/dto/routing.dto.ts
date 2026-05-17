import type { FulcrumRoutingRuleSource } from "@execution-orchestration/infrastructure/database/routing.entities.ts";

export class RoutingScopeQueryDto {
  orgId!: string;
  userId!: string;
  projectId?: string;
  status?: string;
}

export class RoutingIdParamsDto {
  id!: string;
}

export class RoutingRuleCreateDto {
  orgId!: string;
  userId!: string;
  projectId?: string | null;
  name!: string;
  conditionsJson!: Record<string, unknown>;
  actionAgent!: string;
  actionSkillSet?: string[];
  priority?: number;
  enabled?: boolean;
  source?: FulcrumRoutingRuleSource;
}

export class RoutingRuleUpdateDto {
  orgId!: string;
  userId!: string;
  projectId?: string | null;
  name?: string;
  conditionsJson?: Record<string, unknown>;
  actionAgent?: string;
  actionSkillSet?: string[];
  priority?: number;
  enabled?: boolean;
  source?: FulcrumRoutingRuleSource;
}

export class RoutingDecisionDryRunDto {
  orgId!: string;
  userId!: string;
  taskJson!: Record<string, unknown>;
}

export class RoutingDecisionTestDto {
  orgId!: string;
  userId!: string;
  taskId!: string;
}

export class RoutingLlmGateDto {
  orgId!: string;
  userId!: string;
  enabled?: boolean;
  inputMode?: "task_facts" | "task_plus_history" | "full_context";
}

export class RoutingDraftUpdateDto {
  orgId!: string;
  userId!: string;
  conditionsJson?: Record<string, unknown>;
  actionAgent?: string;
  actionSkillSet?: string[];
}
