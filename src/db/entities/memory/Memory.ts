/**
 * Memory entity — durable project/global memory for context retrieval.
 *
 * C2/Q22: org-scoped indexes cover project+global retrieval, kind filters,
 * archive filters, global promotion, and local FTS.
 * C7: MikroORM v7 ES Stage-3 decorators require explicit property types.
 * C8: @Entity({ repository }) wires MemoryRepository.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
import { Org } from "../auth/Org.ts";
import { MemoryRepository } from "../../repositories/memory/MemoryRepository.ts";
import { VectorType } from "../../types/VectorType.ts";
import type { MemoryImportance, MemoryKind, MemorySource } from "./enums.ts";

@Entity({ tableName: "memories", repository: () => MemoryRepository })
@Index({
  name: "idx_memories_org_kind",
  properties: ["org", "kind"],
})
@Index({
  name: "memories_org_project_importance",
  properties: ["org", "projectId", "importance"],
})
@Index({
  name: "memories_org_kind",
  properties: ["org", "kind"],
})
@Index({
  name: "memories_org_archived",
  properties: ["org", "archived"],
})
@Index({
  name: "memories_org_global",
  properties: ["org", "global"],
})
@Index({
  name: "memories_body_tsv",
  expression:
    'CREATE INDEX "memories_body_tsv" ON "memories" USING GIN (to_tsvector(\'english\', body))',
})
export class Memory {
  [OptionalProps]?:
    | "orgId"
    | "projectId"
    | "global"
    | "kind"
    | "body"
    | "tags"
    | "importance"
    | "sourceRef"
    | "createdAt"
    | "updatedAt"
    | "archived"
    | "embedding";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  @Property({ type: "uuid", fieldName: "org_id", persist: false })
  orgId!: string;

  @Property({ type: "uuid", fieldName: "project_id", nullable: true })
  projectId: string | null = null;

  @Property({ type: "boolean", fieldName: "global", default: false })
  global: boolean = false;

  @Property({
    type: "string",
    default: "note",
    check:
      "kind in ('note','decision','blocker','file_ref','section_anchor','link','fact')",
  })
  kind: MemoryKind = "note";

  @Property({ type: "text", default: "" })
  body: string = "";

  @Property({ type: "array", default: [] })
  tags: string[] = [];

  @Property({
    type: "string",
    default: "medium",
    check: "importance in ('low','medium','high')",
  })
  importance: MemoryImportance = "medium";

  @Property({
    type: "string",
    check: "source in ('heuristic','llm','manual')",
  })
  source!: MemorySource;

  @Property({ type: "json", fieldName: "source_ref", defaultRaw: "'{}'::jsonb" })
  sourceRef: Record<string, unknown> = {};

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;

  @Property({ type: "boolean", fieldName: "archived", default: false })
  archived: boolean = false;

  @Property({ type: VectorType, length: 384, nullable: true })
  embedding?: number[];
}
