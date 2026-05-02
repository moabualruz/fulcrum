/**
 * ModelCache entity — main Fulcrum DB metadata for locally managed models.
 *
 * Rust owns inference-cache.db; this table only tracks model files/status.
 */

import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
import { Org } from "../auth/Org.ts";
import { ModelCacheRepository } from "../../repositories/inference/ModelCacheRepository.ts";

export type ModelCacheKind = "embed" | "generate" | "classify";
export type ModelCacheSource = "bundled" | "huggingface" | "local";

@Entity({ tableName: "model_cache", repository: () => ModelCacheRepository })
@Unique({ name: "model_cache_org_model_id", properties: ["org", "modelId"] })
@Index({ name: "model_cache_org_kind_active", properties: ["org", "kind", "active"] })
export class ModelCache {
  [OptionalProps]?:
    | "localPath"
    | "sizeBytes"
    | "sha256"
    | "downloaded"
    | "active"
    | "createdAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  @Property({ type: "string", fieldName: "model_id" })
  modelId!: string;

  @Property({ type: "string" })
  kind!: ModelCacheKind;

  @Property({ type: "string" })
  source!: ModelCacheSource;

  @Property({ type: "string", fieldName: "local_path", nullable: true })
  localPath?: string;

  @Property({ type: "bigint", fieldName: "size_bytes", nullable: true })
  sizeBytes?: bigint;

  @Property({ type: "string", nullable: true })
  sha256?: string;

  @Property({ type: "boolean", default: false })
  downloaded = false;

  @Property({ type: "boolean", default: false })
  active = false;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
