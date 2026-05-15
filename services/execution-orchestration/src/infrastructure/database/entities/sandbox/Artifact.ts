/**
 * Artifact entity — Sandcastle harvested run artifacts (P4#03).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { AgentRun } from "../orchestration/AgentRun.ts";
import { Task } from "@work-management/infrastructure/database/entities/tasks/Task.ts";

@Entity("artifacts")
@Index("idx_artifacts_org_path", ["org", "path"])
@Index("artifacts_org_run", ["org", "run"])
@Index("artifacts_org_task", ["org", "task"])
export class Artifact {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @ManyToOne(() => AgentRun, { onDelete: "CASCADE" })
  @JoinColumn({ name: "run_id" })
  run!: AgentRun;

  @ManyToOne(() => Task, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "task_id" })
  task?: Task;

  @Column()
  filename!: string;

  @Column({ nullable: true })
  mime?: string;

  @Column({ type: "bigint", name: "size_bytes", nullable: true })
  sizeBytes?: bigint;

  @Column()
  path!: string;

  @Column({ name: "checksum_sha256", nullable: true })
  checksumSha256?: string;

  @Column({ type: "timestamptz", name: "retention_until", nullable: true })
  retentionUntil?: Date;

  @Column({ type: "jsonb", name: "metadata_json", nullable: true })
  metadataJson?: Record<string, unknown>;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
