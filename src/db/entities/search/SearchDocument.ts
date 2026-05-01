/**
 * SearchDocument entity — search domain (Pillar 11 stub).
 *
 * Stub: only the columns required for the FK + composite index land here.
 * Pillar 11 (Search) will ADD additional columns (text, tokens, embedding,
 * lastIndexedAt, …) via its own migration class.
 *
 * C2: Composite (org_id, entity_kind, entity_id) index from day 1 — find
 *     the search row for any (kind, id) pair within an org.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 * C8: @Entity({ repository }) wires SearchDocumentRepository.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
} from "@mikro-orm/decorators/es";
import { Org } from "../auth/Org.ts";
import { SearchDocumentRepository } from "../../repositories/search/SearchDocumentRepository.ts";

@Entity({
  tableName: "search_documents",
  repository: () => SearchDocumentRepository,
})
@Index({
  name: "idx_search_documents_org_subject",
  properties: ["org", "entityKind", "entityId"],
})
export class SearchDocument {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  /** Source entity kind: "task", "doc", "memory", … (set by Pillar 11). */
  @Property({ type: "string", fieldName: "entity_kind" })
  entityKind!: string;

  /** Source entity ID (UUID of the row in its native table). */
  @Property({ type: "string", fieldName: "entity_id" })
  entityId!: string;
}
