import {
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  JoinColumn,
} from "typeorm";

import { Org } from "../auth/Org.ts";

@Entity("task_watchers")
@Unique("task_watchers_task_user_uniq", ["taskId", "userId"])
export class TaskWatcher {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "task_id" })
  taskId!: string;

  @Column({ name: "user_id" })
  userId!: string;

  @Column({ default: "manual" })
  source: string = "manual";

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
