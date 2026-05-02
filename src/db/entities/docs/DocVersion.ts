/**
 * DocVersion entity — snapshot+delta version history for documents.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
  Unique,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
import { Org } from "../auth/Org.ts";
import { User } from "../auth/User.ts";
import { Document } from "./Document.ts";
import { DocVersionRepository } from "../../repositories/docs/DocVersionRepository.ts";

@Entity({ tableName: "doc_versions", repository: () => DocVersionRepository })
@Index({
  name: "doc_versions_id_org_unique",
  expression:
    'CREATE UNIQUE INDEX "doc_versions_id_org_unique" ON "doc_versions" ("id", "org_id")',
})
@Unique({
  name: "doc_versions_doc_version_unique",
  properties: ["doc", "versionNum"],
})
@Index({
  name: "doc_versions_org_doc_version",
  properties: ["org", "doc", "versionNum"],
})
@Index({
  name: "doc_versions_author",
  properties: ["author"],
})
export class DocVersion {
  [OptionalProps]?:
    | "snapshot"
    | "delta"
    | "bodyMdSnapshot"
    | "author"
    | "restoreOf"
    | "createdAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @ManyToOne(() => Document, {
    fieldName: "doc_id",
    nullable: false,
    deleteRule: "cascade",
  })
  doc!: Document;

  @Property({ type: "integer", fieldName: "version_num" })
  versionNum!: number;

  @Property({ type: "json", fieldName: "snapshot", nullable: true })
  snapshot: Record<string, unknown> | null = null;

  @Property({ type: "json", fieldName: "delta", nullable: true })
  delta: Record<string, unknown> | null = null;

  @Property({ type: "text", fieldName: "body_md_snapshot", nullable: true })
  bodyMdSnapshot: string | null = null;

  @ManyToOne(() => User, {
    fieldName: "author_id",
    nullable: true,
    deleteRule: "set null",
  })
  author: User | null = null;

  @ManyToOne(() => DocVersion, {
    fieldName: "restore_of",
    nullable: true,
    deleteRule: "set null",
  })
  restoreOf: DocVersion | null = null;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
