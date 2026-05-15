/**
 * FeatureFlagRollout entity — platform domain (Pillar 17 cross-cutting).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Unique,
  Check,
  UpdateDateColumn,
  JoinColumn,
} from "typeorm";
import { Org } from "../auth/Org.ts";
import { User } from "../auth/User.ts";
import { FeatureFlag } from "../auth/FeatureFlag.ts";

@Entity("feature_flag_rollouts")
@Unique("uq_feature_flag_rollouts_org_flag", ["org", "flag"])
@Check("feature_flag_rollouts_rollout_percent_check", '"rollout_percent" >= 0 and "rollout_percent" <= 100')
export class FeatureFlagRollout {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @ManyToOne(() => FeatureFlag, { onDelete: "CASCADE" })
  @JoinColumn({ name: "flag_id" })
  flag!: FeatureFlag;

  @Column({ type: "integer", name: "rollout_percent" })
  rolloutPercent: number = 100;

  @Column({ type: "jsonb", name: "cohort_rules" })
  cohortRules: Record<string, unknown> = {};

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "updated_by" })
  updatedBy?: User;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
