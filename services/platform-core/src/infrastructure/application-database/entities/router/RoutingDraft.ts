/**
 * RoutingDraft entity — disabled learned draft persistence (Pillar 5, RTR-02).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";
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

@Entity("routing_drafts")
@Index("idx_routing_drafts_org_status", ["org", "status"])
@Index("idx_routing_drafts_org_created", ["org", "createdAt"])
export class RoutingDraft {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "project_id", nullable: true })
  projectId: string | null = null;

  @Column({ type: "enum", enum: DraftStatus })
  status: DraftStatus = DraftStatus.ReviewNeeded;

  @Column({ type: "boolean", default: false })
  enabled = false;

  @Column({ type: "jsonb", name: "task_facts_json" })
  taskFactsJson: Record<string, unknown> = {};

  @Column({ type: "text", name: "no_match_reason" })
  noMatchReason!: string;

  @Column({ type: "jsonb", name: "proposed_conditions_json" })
  proposedConditionsJson: Record<string, unknown> = {};

  @Column({ type: "jsonb", name: "proposed_actions_json" })
  proposedActionsJson: Record<string, unknown> = {};

  @Column({ type: "enum", enum: DraftSource })
  source: DraftSource = DraftSource.NoMatch;

  @Column({ type: "float" })
  confidence = 0;

  @Column({ nullable: true })
  backend: string | null = null;

  @Column({ nullable: true })
  model: string | null = null;

  @Column({ type: "jsonb", name: "matching_active_rule_ids_json" })
  matchingActiveRuleIdsJson: string[] = [];

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;
}
