/**
 * ModelCache entity — main Fulcrum DB metadata for locally managed models.
 */

import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  JoinColumn,
} from "typeorm";
import { Org } from "../auth/Org.ts";

export type ModelCacheKind = "embed" | "generate" | "classify";
export type ModelCacheSource = "bundled" | "huggingface" | "local";

@Entity("model_cache")
@Unique("model_cache_org_model_id", ["org", "modelId"])
@Index("model_cache_org_kind_active", ["org", "kind", "active"])
export class ModelCache {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org)
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "model_id" })
  modelId!: string;

  @Column()
  kind!: ModelCacheKind;

  @Column()
  source!: ModelCacheSource;

  @Column({ name: "local_path", nullable: true })
  localPath?: string;

  @Column({ type: "bigint", name: "size_bytes", nullable: true })
  sizeBytes?: bigint;

  @Column({ nullable: true })
  sha256?: string;

  @Column({ type: "boolean", default: false })
  downloaded = false;

  @Column({ type: "boolean", default: false })
  active = false;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
