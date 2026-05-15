/**
 * ContextSnapshot entity — replay/debug store for assembled context bundles.
 */

import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";
import { Org } from "../auth/Org.ts";

@Entity("context_snapshots")
@Index("context_snapshots_run", ["org", "runId"])
@Index("context_snapshots_task", ["org", "taskId"])
export class ContextSnapshot {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "run_id", nullable: true })
  runId: string | null = null;

  @Column({ name: "task_id", nullable: true })
  taskId: string | null = null;

  @Column({ type: "jsonb", name: "bundle_blob" })
  bundleBlob!: Record<string, unknown>;

  @Column({ type: "integer", name: "token_count" })
  tokenCount!: number;

  @Column({ type: "jsonb", name: "slice_sizes" })
  sliceSizes!: Record<string, number>;
}
