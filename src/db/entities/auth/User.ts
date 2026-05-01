/**
 * User entity — auth domain.
 *
 * C2: Composite (org_id, email) index for tenant-scoped queries.
 * C6: No plaintext SQL — schema via defineEntity + p builder.
 * C7: MikroORM v7 defineEntity pattern.
 */

import { defineEntity, p, type InferEntity } from "@mikro-orm/postgresql";

export const UserSchema = defineEntity({
  name: "User",
  tableName: "users",
  indexes: [
    {
      name: "idx_users_org_email",
      properties: ["orgId", "email"],
    },
  ],
  uniques: [
    {
      name: "uq_users_org_email",
      properties: ["orgId", "email"],
    },
  ],
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    orgId: p.uuid().fieldName("org_id"),
    email: p.string(),
    name: p.string().nullable(),
    avatarUrl: p.string().fieldName("avatar_url").nullable(),
    // role enum: owner | admin | member | guest
    role: p
      .enum(() => ["owner", "admin", "member", "guest"] as const)
      .default("member"),
    createdAt: p.datetime().fieldName("created_at").defaultRaw("now()"),
    updatedAt: p.datetime().fieldName("updated_at").defaultRaw("now()"),
  },
});

export type User = InferEntity<typeof UserSchema>;
