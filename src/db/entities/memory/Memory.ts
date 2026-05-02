/**
 * Memory entity — memory domain (Pillar 8 stub).
 *
 * Stub: only the columns required for the FK + composite index land here.
 * Pillar 8 (Memory / RAG) will ADD additional columns (content, embedding,
 * source, …) via its own migration class.
 *
 * C2: Composite (org_id, kind) index from day 1 — kind-filtered scans.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
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

@Entity({ tableName: "memories", repository: () => MemoryRepository })
@Index({
  name: "idx_memories_org_kind",
  properties: ["org", "kind"],
})
export class Memory {
  [OptionalProps]?: "embedding";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  /** Memory bucket: "doc", "task", "chat", "embedding", … (set by Pillar 8). */
  @Property({ type: "string" })
  kind!: string;

  @Property({ type: VectorType, length: 384, nullable: true })
  embedding?: number[];
}
