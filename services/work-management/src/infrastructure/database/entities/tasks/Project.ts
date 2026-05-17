/**
 * Project entity — minimal representation for WorkflowService.
 *
 * task workflow migration adds workflow_config, methodology,
 * and enabled_task_types columns to the projects table.
 * This entity models those columns for service-layer access.
 */

import {
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

export type WorkflowConfig = {
  transitions?: Record<string, string[]>;
};

@Entity("projects")
export class Project {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "jsonb", name: "workflow_config", nullable: true })
  workflowConfig: WorkflowConfig | null = null;

  @Column({ type: "varchar", name: "methodology", default: "kanban" })
  methodology: "scrum" | "kanban" | "none" = "kanban";

  @Column({ type: "jsonb", name: "enabled_task_types", nullable: true })
  enabledTaskTypes: string[] | null = null;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;
}
