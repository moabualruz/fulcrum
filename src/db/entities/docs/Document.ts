/**
 * Document entity — docs domain (Pillar 7 stub).
 *
 * Stub: only the columns required for the FK + composite index land here.
 * Pillar 7 (Docs) will ADD additional columns (title, body, version, …)
 * via its own migration class.
 *
 * C2: Composite (org_id, updated_at desc) index from day 1 — recent-doc lists.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 * C8: @Entity({ repository }) wires DocumentRepository.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
} from "@mikro-orm/decorators/es";
import { Org } from "../auth/Org.ts";
import { DocumentRepository } from "../../repositories/docs/DocumentRepository.ts";

@Entity({ tableName: "documents", repository: () => DocumentRepository })
@Index({
  name: "idx_documents_org_updated",
  properties: ["org", "updatedAt"],
})
export class Document {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
