/**
 * FeatureFlag entity — auth domain.
 *
 * Per-org/per-user feature flag overrides. Env var is always checked first
 * (FlagRegistry in src/flags/registry.ts); this entity stores DB overrides.
 *
 * D5: Flag names: lowercase-with-hyphens, validated in FlagRegistry.
 * C2: Composite (org_id, flag) index.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 *     Stage-3 decorators do NOT emit reflect-metadata type info — explicit `type`
 *     is required on every @Property/@PrimaryKey decorator.
 * C8: Class IS the type; @Entity({ repository }) wires FeatureFlagRepository.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  Index,
  Unique,
} from "@mikro-orm/decorators/es";
import { FeatureFlagRepository } from "../../repositories/auth/FeatureFlagRepository.ts";

@Entity({ tableName: "feature_flags", repository: () => FeatureFlagRepository })
@Index({ name: "idx_feature_flags_org_flag", properties: ["orgId", "flag"] })
@Unique({ name: "uq_feature_flags_org_user_flag", properties: ["orgId", "userId", "flag"] })
@Index({
  name: "uq_feature_flags_global_flag",
  expression:
    'CREATE UNIQUE INDEX "uq_feature_flags_global_flag" ON "feature_flags" ("flag") WHERE "org_id" IS NULL AND "user_id" IS NULL',
})
export class FeatureFlag {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  // Nullable: global flag rows have no org (apply to all orgs)
  @Property({ type: "uuid", fieldName: "org_id", nullable: true })
  orgId: string | null = null;

  // Nullable: org-level flags have no user (apply to all users in the org)
  @Property({ type: "uuid", fieldName: "user_id", nullable: true })
  userId: string | null = null;

  // Flag name — must match ^[a-z][a-z0-9-]*$ (D5 constraint, enforced in FlagRegistry)
  @Property({ type: "string" })
  flag!: string;

  @Property({ type: "boolean" })
  enabled: boolean = false;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
