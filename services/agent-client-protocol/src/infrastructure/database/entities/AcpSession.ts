/**
 * AcpSession entity — persisted ACP bridge session for restart survival.
 *
 * Maps to the existing `fulcrum_acp_sessions` table (created by
 * WorkflowSpine1778623200001), extended with bridge-specific columns
 * added by Migration20260516AcpSessionColumns.
 */

import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("fulcrum_acp_sessions")
export class AcpSession {
  @PrimaryColumn({ type: "varchar", length: 128 })
  id!: string;

  @Column({ name: "org_id", type: "varchar", nullable: true })
  orgId!: string | null;

  @Column({ name: "project_id", type: "varchar", length: 128, nullable: true })
  projectId!: string | null;

  @Column({ name: "trace_id", type: "varchar", length: 160 })
  traceId!: string;

  @Column({ name: "agent_name", type: "varchar", length: 160 })
  agentName!: string;

  @Column({ type: "varchar", nullable: true })
  cwd!: string | null;

  @Column({ type: "varchar", length: 80, default: "active" })
  status!: string;

  @Column({ type: "varchar", length: 80 })
  mode!: string;

  @Column({ type: "varchar", length: 160, nullable: true })
  model!: string | null;

  @Column({ name: "mode_id", type: "varchar", nullable: true })
  modeId!: string | null;

  @Column({ name: "model_id", type: "varchar", nullable: true })
  modelId!: string | null;

  @Column({ name: "permission_mode", type: "varchar", nullable: true })
  permissionMode!: string | null;

  @Column({ name: "paused_at", type: "timestamptz", nullable: true })
  pausedAt!: Date | null;

  @Column({ name: "paused_reason", type: "varchar", nullable: true })
  pausedReason!: string | null;

  @Column({ name: "current_checkpoint_id", type: "varchar", length: 128, nullable: true })
  currentCheckpointId!: string | null;

  @Column({ name: "abort_reason", type: "varchar", nullable: true })
  abortReason!: string | null;

  @Column({ name: "abort_note", type: "text", nullable: true })
  abortNote!: string | null;

  @Column({ name: "artifacts_path", type: "varchar", nullable: true })
  artifactsPath!: string | null;

  @Column({ name: "checkpoint_mode_override", type: "varchar", nullable: true })
  checkpointModeOverride!: string | null;

  @Column({ type: "jsonb", name: "traffic_log", default: () => "'[]'::jsonb" })
  trafficLog!: unknown[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
