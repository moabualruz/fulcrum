import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";

import { Org } from "../auth/Org.ts";

@Entity("task_templates")
@Index("task_templates_org_project", ["org", "projectId"])
// Expression index: CREATE UNIQUE INDEX "task_templates_one_default_per_project" ON "task_templates" ("org_id", "project_id") WHERE "is_default" = true
@Index()
export class TaskTemplate {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "project_id", nullable: true })
  projectId: string | null = null;

  @Column()
  name!: string;

  @Column({ type: "text", nullable: true })
  description: string | null = null;

  @Column({ type: "jsonb", name: "template_data", nullable: true })
  templateData: object | null = null;

  @Column({ type: "boolean", name: "is_default", default: false })
  isDefault: boolean = false;

  @Column({ name: "created_by" })
  createdBy!: string;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;
}
