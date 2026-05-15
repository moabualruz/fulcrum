import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

@Entity("task_comments")
@Index("task_comments_task_id", ["taskId"])
@Index("task_comments_org_task", ["org", "taskId"])
export class TaskComment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar", name: "task_id" })
  taskId!: string;

  @Column({ type: "varchar", name: "author_id" })
  authorId!: string;

  @Column({ type: "jsonb", nullable: true })
  body: object | null = null;

  @Column({ type: "varchar", name: "parent_comment_id", nullable: true })
  parentCommentId: string | null = null;

  @Column({ type: "boolean", default: false })
  resolved: boolean = false;

  @Column({ type: "varchar", name: "resolved_by", nullable: true })
  resolvedBy: string | null = null;

  @Column({ type: "timestamptz", name: "resolved_at", nullable: true })
  resolvedAt: Date | null = null;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;
}
