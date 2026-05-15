/**
 * User entity — auth domain.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
} from "typeorm";

@Entity("users")
@Index("idx_users_org_email", ["orgId", "email"])
@Index() // expression: CREATE UNIQUE INDEX "users_id_org_unique" ON "users" ("id", "org_id")
@Unique("uq_users_org_email", ["orgId", "email"])
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", name: "org_id" })
  orgId!: string;

  @Column({ type: "varchar" })
  email!: string;

  @Column({ type: "varchar", nullable: true })
  name?: string;

  @Column({ type: "varchar", name: "avatar_url", nullable: true })
  avatarUrl?: string;

  @Column({ type: "enum", enum: ["owner", "admin", "member", "guest"] })
  role: "owner" | "admin" | "member" | "guest" = "member";

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;
}
