import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

@Entity("project_automations")
@Index("project_automations_project_enabled", ["projectId", "enabled"])
export class ProjectAutomation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar", name: "project_id" })
  projectId!: string;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "varchar", name: "trigger_type" })
  triggerType!: string;

  @Column({ type: "jsonb", name: "trigger_config" })
  triggerConfig: object = {};

  @Column({ type: "jsonb", nullable: true })
  condition: object | null = null;

  @Column({ type: "varchar", name: "action_type" })
  actionType!: string;

  @Column({ type: "jsonb", name: "action_config" })
  actionConfig: object = {};

  @Column({ type: "boolean", default: true })
  enabled: boolean = true;

  @Column({ type: "integer", name: "execution_count", default: 0 })
  executionCount: number = 0;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;
}
