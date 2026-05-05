/**
 * RoutingDraft entity — disabled learned draft persistence (Pillar 5, RTR-02).
 *
 * Stores no-match learned routing rules as disabled draft/review-needed rules.
 * Never stores active/enabled rules — drafts are disabled until explicitly approved.
 *
 * C2/Q22: org FK required; composite org-scoped indexes land at migration.
 * C6/C7: schema via MikroORM v7 decorator class, not app-code SQL.
 * D-09: drafts always disabled (enabled=false) until explicit promotion.
 * D-10: full decision evidence stored in JSON columns.
 * D-12: conflict state + matchingActiveRuleIds when overlap with active rules.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
  Enum,
} from "@mikro-orm/decorators/es";
import { Org } from "../auth/Org.ts";

export enum DraftStatus {
  ReviewNeeded = "review_needed",
  Conflict = "conflict",
  Abstained = "abstained",
}

export const DRAFT_STATUSES = [
  DraftStatus.ReviewNeeded,
  DraftStatus.Conflict,
  DraftStatus.Abstained,
] as const;

export enum DraftSource {
  NoMatch = "no_match",
  Llm = "llm",
}

export const DRAFT_SOURCES = [
  DraftSource.NoMatch,
  DraftSource.Llm,
] as const;

@Entity({ tableName: "routing_drafts" })
@Index({
  name: "idx_routing_drafts_org_status",
  properties: ["org", "status"],
})
@Index({
  name: "idx_routing_drafts_org_created",
  properties: ["org", "createdAt"],
})
export class RoutingDraft {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @Property({ type: "uuid", fieldName: "project_id", nullable: true })
  projectId: string | null = null;

  @Enum({
    items: () => DRAFT_STATUSES,
  })
  status: DraftStatus = DraftStatus.ReviewNeeded;

  /** Drafts are always disabled — never active until explicitly approved (D-09). */
  @Property({ type: "boolean", default: false })
  enabled = false;

  @Property({ type: "json", fieldName: "task_facts_json" })
  taskFactsJson: Record<string, unknown> = {};

  @Property({ type: "text", fieldName: "no_match_reason" })
  noMatchReason!: string;

  @Property({ type: "json", fieldName: "proposed_conditions_json" })
  proposedConditionsJson: Record<string, unknown> = {};

  @Property({ type: "json", fieldName: "proposed_actions_json" })
  proposedActionsJson: Record<string, unknown> = {};

  @Enum({
    items: () => DRAFT_SOURCES,
  })
  source: DraftSource = DraftSource.NoMatch;

  @Property({ type: "float" })
  confidence = 0;

  @Property({ type: "string", nullable: true })
  backend: string | null = null;

  @Property({ type: "string", nullable: true })
  model: string | null = null;

  /** JSON array of active rule IDs this draft overlaps with (D-12). */
  @Property({ type: "json", fieldName: "matching_active_rule_ids_json", default: "[]" })
  matchingActiveRuleIdsJson: string[] = [];

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
