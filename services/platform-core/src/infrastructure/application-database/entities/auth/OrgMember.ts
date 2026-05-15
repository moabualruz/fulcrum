/**
 * OrgMember entity — auth domain.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
} from "typeorm";

@Entity("org_members")
@Index("idx_org_members_org_user", ["orgId", "userId"])
@Index("idx_org_members_user", ["userId"])
@Unique("uq_org_members_org_user", ["orgId", "userId"])
export class OrgMember {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "org_id" })
  orgId!: string;

  @Column({ name: "user_id" })
  userId!: string;

  @Column()
  role: string = "member";

  @Column({ type: "timestamptz", name: "joined_at", default: () => "now()" })
  joinedAt!: Date;
}
