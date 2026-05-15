import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  JoinColumn,
} from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

@Entity("task_relationships")
@Unique("task_relationships_uniq", ["sourceTaskId", "targetTaskId", "type"])
@Index("task_relationships_source", ["sourceTaskId"])
@Index("task_relationships_target", ["targetTaskId"])
export class TaskRelationship {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "source_task_id" })
  sourceTaskId!: string;

  @Column({ name: "target_task_id" })
  targetTaskId!: string;

  @Column()
  type!: string;

  @Column({ name: "created_by" })
  createdBy!: string;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
