/**
 * RoutingRule entity - router domain (Pillar 5, R-01).
 *
 * Stores deterministic routing rules evaluated before the gated LLM fallback.
 *
 * C2/Q22: org FK required; composite org-scoped indexes land at table creation.
 * C6/C7: schema via MikroORM v7 decorator class, not app-code SQL.
 * C8/C9: @Entity({ repository }) wires RoutingRuleRepository at router path.
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
import { RoutingRuleRepository } from "../../repositories/router/RoutingRuleRepository.ts";
import {
  ROUTING_RULE_SOURCES,
  RoutingRuleSource,
  type RoutingConditions,
} from "../../../domain/routing/types.ts";
export {
  ROUTING_RULE_SOURCES,
  RoutingRuleSource,
  type RoutingConditions,
} from "../../../domain/routing/types.ts";

@Entity({ tableName: "routing_rules", repository: () => RoutingRuleRepository })
@Index({
  name: "routing_rules_org_priority",
  properties: ["org", "priority", "enabled"],
})
@Index({
  name: "routing_rules_org_project",
  properties: ["org", "project"],
})
export class RoutingRule {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  // Project entity is not in the MikroORM graph yet; keep scope as project_id.
  @Property({ type: "uuid", fieldName: "project_id", nullable: true })
  project: string | null = null;

  @Property({ type: "string" })
  name!: string;

  @Property({ type: "json", fieldName: "conditions_json" })
  conditionsJson: RoutingConditions = {};

  @Property({ type: "string", fieldName: "action_agent" })
  actionAgent!: string;

  @Property({ type: "array", fieldName: "action_skill_set", default: [] })
  actionSkillSet: string[] = [];

  @Property({ type: "integer", default: 100 })
  priority = 100;

  @Property({ type: "boolean", default: true })
  enabled = true;

  @Enum({
    items: () => ROUTING_RULE_SOURCES,
    default: RoutingRuleSource.Manual,
  })
  source: RoutingRuleSource = RoutingRuleSource.Manual;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
