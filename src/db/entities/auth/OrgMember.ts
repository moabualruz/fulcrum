/**
 * OrgMember entity — auth domain.
 *
 * C2: Composite (org_id, user_id) index + unique constraint.
 * C6/C7: defineEntity + p builder.
 */

import { defineEntity, p, type InferEntity } from "@mikro-orm/postgresql";

export const OrgMemberSchema = defineEntity({
  name: "OrgMember",
  tableName: "org_members",
  indexes: [
    {
      name: "idx_org_members_org_user",
      properties: ["orgId", "userId"],
    },
    {
      name: "idx_org_members_user",
      properties: ["userId"],
    },
  ],
  uniques: [
    {
      // Prevent duplicate membership rows
      name: "uq_org_members_org_user",
      properties: ["orgId", "userId"],
    },
  ],
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    orgId: p.uuid().fieldName("org_id"),
    userId: p.uuid().fieldName("user_id"),
    role: p.string().default("member"),
    joinedAt: p.datetime().fieldName("joined_at").defaultRaw("now()"),
  },
});

export type OrgMember = InferEntity<typeof OrgMemberSchema>;
