/**
 * DocLink entity — wikilinks, task/run refs, and mentions extracted from docs.
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
import { Document } from "./Document.ts";
import type { LinkKind } from "./enums.ts";

@Entity("doc_links")
@Index("doc_links_org_from", ["org", "fromDoc"])
@Index("doc_links_org_to", ["org", "toDoc"])
export class DocLink {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @ManyToOne(() => Document, { onDelete: "CASCADE" })
  @JoinColumn({ name: "from_doc_id" })
  fromDoc!: Document;

  @ManyToOne(() => Document, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "to_doc_id" })
  toDoc: Document | null = null;

  @Column({ name: "to_slug" })
  toSlug!: string;

  @Column({ name: "link_kind", default: "wikilink" })
  linkKind: LinkKind = "wikilink";

  @Column({ name: "anchor", nullable: true })
  anchor: string | null = null;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
