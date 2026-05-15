/**
 * Invitation entity — auth domain.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
} from "typeorm";

@Entity("invitations")
@Index("idx_invitations_org_email", ["orgId", "email"])
@Unique("uq_invitations_token", ["token"])
export class Invitation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "org_id" })
  orgId!: string;

  @Column()
  email!: string;

  @Column()
  role: string = "member";

  @Column()
  token!: string;

  // Who sent the invite (nullable — system-generated invites have no user)
  @Column({ name: "invited_by", nullable: true })
  invitedById?: string;

  @Column({ type: "timestamptz", name: "accepted_at", nullable: true })
  acceptedAt?: Date;

  @Column({ type: "timestamptz", name: "expires_at" })
  expiresAt!: Date;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
