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
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

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

  @Column({ type: "varchar", name: "model_id" })
  modelId!: string;

  @Column({ type: "varchar" })
  kind!: ModelCacheKind;

  @Column({ type: "varchar" })
  source!: ModelCacheSource;

  @Column({ type: "varchar", name: "local_path", nullable: true })
  localPath?: string;

  @Column({ type: "bigint", name: "size_bytes", nullable: true })
  sizeBytes?: bigint;

  @Column({ type: "varchar", nullable: true })
  sha256?: string;

  @Column({ type: "boolean", default: false })
  downloaded = false;

  @Column({ type: "boolean", default: false })
  active = false;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
