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
import type { TaskStatusCategory } from "./schemas.ts";
export {
  TASK_STATUS_CATEGORIES,
  TaskStatusCategorySchema,
  type TaskStatusCategory,
} from "./schemas.ts";

@Entity("task_statuses")
@Index("task_statuses_org_project", ["org", "projectId"])
@Unique("task_statuses_project_name_unique", ["projectId", "name"])
export class TaskStatus {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "project_id" })
  projectId!: string;

  @Column()
  name!: string;

  @Column({ default: "#6B7280" })
  color: string = "#6B7280";

  // Note: check constraint "category in ('unstarted','started','completed','cancelled')" — handle in migration
  @Column()
  category!: TaskStatusCategory;

  @Column({ type: "integer", default: 0 })
  position: number = 0;

  @Column({ type: "boolean", name: "is_default", default: false })
  isDefault: boolean = false;
}
