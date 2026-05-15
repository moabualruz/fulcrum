import { EntitySchema } from "typeorm";

export type FulcrumRoutingRuleSource = "manual" | "learned" | "imported";
export type FulcrumRoutingDraftStatus = "review_needed" | "conflict" | "abstained" | "approved";

export interface FulcrumRoutingRule {
  id: string;
  orgId: string;
  projectId: string | null;
  name: string;
  conditionsJson: Record<string, unknown>;
  actionAgent: string;
  actionSkillSet: string[];
  priority: number;
  enabled: boolean;
  source: FulcrumRoutingRuleSource;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FulcrumRoutingDraft {
  id: string;
  orgId: string;
  projectId: string | null;
  status: FulcrumRoutingDraftStatus;
  enabled: boolean;
  taskFactsJson: Record<string, unknown>;
  noMatchReason: string;
  proposedConditionsJson: Record<string, unknown>;
  proposedActionsJson: Record<string, unknown>;
  source: string;
  confidence: number;
  backend: string | null;
  model: string | null;
  matchingActiveRuleIdsJson: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

const timestampColumns = {
  createdAt: {
    name: "created_at",
    type: "timestamptz",
    createDate: true,
  },
  updatedAt: {
    name: "updated_at",
    type: "timestamptz",
    updateDate: true,
  },
} as const;

export const FulcrumRoutingRuleEntity = new EntitySchema<FulcrumRoutingRule>({
  name: "FulcrumRoutingRule",
  tableName: "fulcrum_routing_rules",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    projectId: { name: "project_id", type: "varchar", length: 128, nullable: true },
    name: { type: "varchar", length: 220 },
    conditionsJson: {
      name: "conditions_json",
      type: "jsonb",
      default: () => "'{}'::jsonb",
    },
    actionAgent: { name: "action_agent", type: "varchar", length: 160 },
    actionSkillSet: {
      name: "action_skill_set",
      type: "jsonb",
      default: () => "'[]'::jsonb",
    },
    priority: { type: "int", default: 100 },
    enabled: { type: "boolean", default: true },
    source: { type: "varchar", length: 80, default: "manual" },
    ...timestampColumns,
  },
  indices: [
    { name: "fulcrum_routing_rules_org_priority_idx", columns: ["orgId", "priority"] },
    { name: "fulcrum_routing_rules_org_project_idx", columns: ["orgId", "projectId"] },
  ],
});

export const FulcrumRoutingDraftEntity = new EntitySchema<FulcrumRoutingDraft>({
  name: "FulcrumRoutingDraft",
  tableName: "fulcrum_routing_drafts",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    projectId: { name: "project_id", type: "varchar", length: 128, nullable: true },
    status: { type: "varchar", length: 80, default: "review_needed" },
    enabled: { type: "boolean", default: false },
    taskFactsJson: {
      name: "task_facts_json",
      type: "jsonb",
      default: () => "'{}'::jsonb",
    },
    noMatchReason: { name: "no_match_reason", type: "text" },
    proposedConditionsJson: {
      name: "proposed_conditions_json",
      type: "jsonb",
      default: () => "'{}'::jsonb",
    },
    proposedActionsJson: {
      name: "proposed_actions_json",
      type: "jsonb",
      default: () => "'{}'::jsonb",
    },
    source: { type: "varchar", length: 80, default: "no_match" },
    confidence: { type: "float", default: 0 },
    backend: { type: "varchar", length: 160, nullable: true },
    model: { type: "varchar", length: 160, nullable: true },
    matchingActiveRuleIdsJson: {
      name: "matching_active_rule_ids_json",
      type: "jsonb",
      default: () => "'[]'::jsonb",
    },
    ...timestampColumns,
  },
  indices: [
    { name: "fulcrum_routing_drafts_org_status_idx", columns: ["orgId", "status"] },
    { name: "fulcrum_routing_drafts_org_created_idx", columns: ["orgId", "createdAt"] },
  ],
});

export const FULCRUM_ROUTING_ENTITIES = [
  FulcrumRoutingRuleEntity,
  FulcrumRoutingDraftEntity,
];
