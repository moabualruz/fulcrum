/**
 * FeatureFlag entity — auth domain.
 *
 * Per-org/per-user feature flag overrides. Env var is always checked first
 * (FlagRegistry in src/flags/registry.ts); this entity stores DB overrides.
 *
 * D5: Flag names: lowercase-with-hyphens, validated in FlagRegistry.
 * C2: Composite (org_id, flag) index.
 * C6/C7: defineEntity + p builder.
 */

import { defineEntity, p, type InferEntity } from "@mikro-orm/postgresql";

export const FeatureFlagSchema = defineEntity({
  name: "FeatureFlag",
  tableName: "feature_flags",
  indexes: [
    {
      name: "idx_feature_flags_org_flag",
      properties: ["orgId", "flag"],
    },
  ],
  uniques: [
    {
      // One row per (org, user, flag) combination
      name: "uq_feature_flags_org_user_flag",
      properties: ["orgId", "userId", "flag"],
    },
  ],
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    // Nullable: global flag rows have no org (apply to all orgs)
    orgId: p.uuid().fieldName("org_id").nullable(),
    // Nullable: org-level flags have no user (apply to all users in the org)
    userId: p.uuid().fieldName("user_id").nullable(),
    // Flag name — must match ^[a-z][a-z0-9-]*$ (D5 constraint, enforced in FlagRegistry)
    flag: p.string(),
    enabled: p.boolean().default(false),
    createdAt: p.datetime().fieldName("created_at").defaultRaw("now()"),
  },
});

export type FeatureFlag = InferEntity<typeof FeatureFlagSchema>;
