/**
 * WorkflowDefinition entity — orchestration domain (Pillar 3, P3#02).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";
import { Org } from "../auth/Org.ts";

@Entity("workflow_definitions")
@Index("idx_wf_def_org_project", ["org", "projectId"])
@Index() // expression: CREATE UNIQUE INDEX "idx_wf_def_org_project_name_unique" ON "workflow_definitions" ("org_id", COALESCE("project_id", '00000000-0000-0000-0000-000000000000'), "name")
export class WorkflowDefinition {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org)
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "project_id", nullable: true })
  projectId: string | null = null;

  @Column({ name: "name" })
  name!: string;

  @Column({ type: "text", name: "config_yaml" })
  configYaml!: string;

  @Column({ type: "text", name: "prompt_md" })
  promptMd!: string;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;
}
