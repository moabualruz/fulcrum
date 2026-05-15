/**
 * Org entity — auth domain.
 *
 * Represents an organization (tenant).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique,
} from "typeorm";

@Entity("orgs")
@Unique("uq_orgs_slug", ["slug"])
export class Org {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  /** URL-safe org identifier (e.g. "local", "acme-corp"). */
  @Column()
  slug!: string;

  @Column({ nullable: true, name: "avatar_url" })
  avatarUrl?: string;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;
}
