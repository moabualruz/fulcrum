/**
 * RoutingRule entity - router domain (Pillar 5, R-01).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import {
  ROUTING_RULE_SOURCES,
  RoutingRuleSource,
  type RoutingConditions,
} from "@execution-orchestration/domain/routing.ts";
export {
  ROUTING_RULE_SOURCES,
  RoutingRuleSource,
  type RoutingConditions,
} from "@execution-orchestration/domain/routing.ts";

@Entity("routing_rules")
@Index("routing_rules_org_priority", ["org", "priority", "enabled"])
@Index("routing_rules_org_project", ["org", "project"])
export class RoutingRule {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "project_id", nullable: true })
  project: string | null = null;

  @Column()
  name!: string;

  @Column({ type: "jsonb", name: "conditions_json" })
  conditionsJson: RoutingConditions = {};

  @Column({ name: "action_agent" })
  actionAgent!: string;

  @Column({ type: "simple-array", name: "action_skill_set" })
  actionSkillSet: string[] = [];

  @Column({ type: "integer", default: 100 })
  priority = 100;

  @Column({ type: "boolean", default: true })
  enabled = true;

  @Column({ type: "enum", enum: ROUTING_RULE_SOURCES, default: RoutingRuleSource.Manual })
  source: RoutingRuleSource = RoutingRuleSource.Manual;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;
}
