/**
 * Session entity — auth domain.
 */

import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
} from "typeorm";

@Entity("sessions")
@Index("idx_sessions_user_expires", ["userId", "expiresAt"])
@Index("idx_sessions_org", ["orgId"])
export class Session {
  // Sessions use text PK (opaque token) compatible with Better-Auth
  @PrimaryColumn()
  id!: string;

  @Column({ name: "user_id" })
  userId!: string;

  @Column({ name: "org_id" })
  orgId!: string;

  // Nullable: users may be in multiple orgs; active org tracks context
  @Column({ name: "active_organization_id", nullable: true })
  activeOrganizationId?: string;

  @Column({ type: "timestamptz", name: "expires_at" })
  expiresAt!: Date;

  @Column({ name: "ip_address", nullable: true })
  ipAddress?: string;

  @Column({ name: "user_agent", nullable: true })
  userAgent?: string;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
