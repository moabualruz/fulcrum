/**
 * Edge entity — cross-domain relationship graph (P4#03/Q32).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  Unique,
  JoinColumn,
} from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

@Entity("edges")
@Unique("edges_from_to_kind", ["org", "fromKind", "fromId", "toKind", "toId", "kind"])
@Index("edges_to_lookup", ["org", "toKind", "toId", "kind"])
export class Edge {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE", eager: true })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar", name: "from_kind" })
  fromKind!: string;

  @Column({ type: "varchar", name: "from_id" })
  fromId!: string;

  @Column({ type: "varchar", name: "to_kind" })
  toKind!: string;

  @Column({ type: "varchar", name: "to_id" })
  toId!: string;

  @Column({ type: "varchar" })
  kind!: string;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
