/**
 * FeatureFlagRollout entity — platform domain (Pillar 17 cross-cutting).
 *
 * Keeps rollout/cohort/audit data OUTSIDE Pillar 1's base FeatureFlag entity
 * (per issue acceptance criterion: "FeatureFlagRollout links to Pillar 1
 *  FeatureFlag and keeps rollout/cohort data outside the base flag entity").
 * Pillar 1 owns the boolean flag; Pillar 17 owns the rollout policy.
 *
 * UNIQUE (org, flag) — one rollout policy per (org, flag) pair.
 * Q22: org FK NOT NULL, composite axes (org, flag) covered by the UNIQUE
 *      constraint's underlying b-tree index.
 * C2: org_id NOT NULL cascade; flag cascade; updated_by nullable set-null.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 * C8: @Entity({ repository }) wires FeatureFlagRolloutRepository.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Unique,
  Check,
} from "@mikro-orm/decorators/es";
import { Org } from "../auth/Org.ts";
import { User } from "../auth/User.ts";
import { FeatureFlag } from "../auth/FeatureFlag.ts";
import { FeatureFlagRolloutRepository } from "../../repositories/platform/FeatureFlagRolloutRepository.ts";

@Entity({
  tableName: "feature_flag_rollouts",
  repository: () => FeatureFlagRolloutRepository,
})
@Unique({
  name: "uq_feature_flag_rollouts_org_flag",
  properties: ["org", "flag"],
})
export class FeatureFlagRollout {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  /** Pillar 1 base flag — rollout policy lives only in this row, not on the flag. */
  @ManyToOne(() => FeatureFlag, {
    fieldName: "flag_id",
    nullable: false,
    deleteRule: "cascade",
  })
  flag!: FeatureFlag;

  /** Per-user rollout percentage 0..100. */
  @Check({
    name: "feature_flag_rollouts_rollout_percent_check",
    expression: '"rollout_percent" >= 0 and "rollout_percent" <= 100',
  })
  @Property({ type: "integer", fieldName: "rollout_percent" })
  rolloutPercent: number = 100;

  /**
   * Cohort filter shape:
   *   include_user_ids? string[]
   *   exclude_user_ids? string[]
   *   org_plan?         string[]
   *   created_after?    string (ISO8601)
   *   variants?         string[]   — A/B variant pool when used by experiments
   */
  @Property({ type: "json", fieldName: "cohort_rules" })
  cohortRules: Record<string, unknown> = {};

  /** Last user who updated this rollout — nullable for system-driven changes. */
  @ManyToOne(() => User, {
    fieldName: "updated_by",
    nullable: true,
    deleteRule: "set null",
  })
  updatedBy?: User;

  @Property({
    type: "datetime",
    fieldName: "updated_at",
    defaultRaw: "now()",
    onUpdate: () => new Date(),
  })
  updatedAt!: Date;
}
