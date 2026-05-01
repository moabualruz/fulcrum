/**
 * Session entity — auth domain.
 *
 * C2: Composite (org_id, user_id) index.
 * C6/C7: defineEntity + p builder.
 */

import { defineEntity, p, type InferEntity } from "@mikro-orm/postgresql";

export const SessionSchema = defineEntity({
  name: "Session",
  tableName: "sessions",
  indexes: [
    {
      name: "idx_sessions_user_expires",
      properties: ["userId", "expiresAt"],
    },
    {
      name: "idx_sessions_org",
      properties: ["orgId"],
    },
  ],
  properties: {
    // Sessions use text PK (opaque token) compatible with Better-Auth
    id: p.string().primary(),
    userId: p.uuid().fieldName("user_id"),
    orgId: p.uuid().fieldName("org_id"),
    // Nullable: users may be in multiple orgs; active org tracks context
    activeOrganizationId: p
      .uuid()
      .fieldName("active_organization_id")
      .nullable(),
    expiresAt: p.datetime().fieldName("expires_at"),
    ipAddress: p.string().fieldName("ip_address").nullable(),
    userAgent: p.string().fieldName("user_agent").nullable(),
    createdAt: p.datetime().fieldName("created_at").defaultRaw("now()"),
  },
});

export type Session = InferEntity<typeof SessionSchema>;
