/**
 * Invitation entity — auth domain.
 *
 * C2: Composite (org_id, email) index.
 * C6/C7: defineEntity + p builder.
 */

import { defineEntity, p, type InferEntity } from "@mikro-orm/postgresql";

export const InvitationSchema = defineEntity({
  name: "Invitation",
  tableName: "invitations",
  indexes: [
    {
      name: "idx_invitations_org_email",
      properties: ["orgId", "email"],
    },
  ],
  uniques: [
    {
      name: "uq_invitations_token",
      properties: ["token"],
    },
  ],
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    orgId: p.uuid().fieldName("org_id"),
    email: p.string(),
    role: p.string().default("member"),
    token: p.string(),
    // Who sent the invite (nullable — system-generated invites have no user)
    invitedById: p.uuid().fieldName("invited_by").nullable(),
    acceptedAt: p.datetime().fieldName("accepted_at").nullable(),
    expiresAt: p.datetime().fieldName("expires_at"),
    createdAt: p.datetime().fieldName("created_at").defaultRaw("now()"),
  },
});

export type Invitation = InferEntity<typeof InvitationSchema>;
