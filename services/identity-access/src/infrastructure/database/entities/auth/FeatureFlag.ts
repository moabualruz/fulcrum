/**
 * FeatureFlag entity — auth domain.
 *
 * Per-org/per-user feature flag overrides. Env var is always checked first
 * (FlagRegistry in services/platform-core/src/application/feature-flags/registry.ts); this entity stores DB overrides.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
} from "typeorm";

@Entity("feature_flags")
@Index("idx_feature_flags_org_flag", ["orgId", "flag"])
@Unique("uq_feature_flags_org_user_flag", ["orgId", "userId", "flag"])
@Index() // expression: CREATE UNIQUE INDEX "uq_feature_flags_global_flag" ON "feature_flags" ("flag") WHERE "org_id" IS NULL AND "user_id" IS NULL
@Index() // expression: CREATE UNIQUE INDEX "uq_feature_flags_org_flag" ON "feature_flags" ("org_id", "flag") WHERE "org_id" IS NOT NULL AND "user_id" IS NULL
export class FeatureFlag {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // Nullable: global flag rows have no org (apply to all orgs)
  @Column({ name: "org_id", nullable: true })
  orgId: string | null = null;

  // Nullable: org-level flags have no user (apply to all users in the org)
  @Column({ name: "user_id", nullable: true })
  userId: string | null = null;

  // Flag name — must match ^[a-z][a-z0-9-]*$ (D5 constraint, enforced in FlagRegistry)
  @Column()
  flag!: string;

  @Column({ type: "boolean" })
  enabled: boolean = false;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
