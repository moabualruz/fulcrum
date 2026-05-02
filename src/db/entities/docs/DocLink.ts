/**
 * DocLink entity — wikilinks, task/run refs, and mentions extracted from docs.
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
import { Document } from "./Document.ts";
import { DocLinkRepository } from "../../repositories/docs/DocLinkRepository.ts";
import type { LinkKind } from "./enums.ts";

@Entity({ tableName: "doc_links", repository: () => DocLinkRepository })
@Index({
  name: "doc_links_org_from",
  properties: ["org", "fromDoc"],
})
@Index({
  name: "doc_links_org_to",
  properties: ["org", "toDoc"],
})
export class DocLink {
  [OptionalProps]?: "toDoc" | "linkKind" | "anchor" | "createdAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @ManyToOne(() => Document, {
    fieldName: "from_doc_id",
    nullable: false,
    deleteRule: "cascade",
  })
  fromDoc!: Document;

  @ManyToOne(() => Document, {
    fieldName: "to_doc_id",
    nullable: true,
    deleteRule: "set null",
  })
  toDoc: Document | null = null;

  @Property({ type: "string", fieldName: "to_slug" })
  toSlug!: string;

  @Property({
    type: "string",
    fieldName: "link_kind",
    default: "wikilink",
    check: "link_kind in ('wikilink','task_ref','run_ref','mention')",
  })
  linkKind: LinkKind = "wikilink";

  @Property({ type: "string", fieldName: "anchor", nullable: true })
  anchor: string | null = null;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
