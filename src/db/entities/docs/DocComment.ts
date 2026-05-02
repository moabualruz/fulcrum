/**
 * DocComment entity — anchored markdown comment threads for documents.
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
import { User } from "../auth/User.ts";
import { Document } from "./Document.ts";
import { DocCommentRepository } from "../../repositories/docs/DocCommentRepository.ts";

@Entity({ tableName: "doc_comments", repository: () => DocCommentRepository })
@Index({
  name: "doc_comments_org_doc",
  properties: ["org", "doc"],
})
export class DocComment {
  [OptionalProps]?:
    | "anchorRange"
    | "parentComment"
    | "resolved"
    | "createdAt"
    | "updatedAt";

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

  @Property({ type: "json", fieldName: "anchor_range", nullable: true })
  anchorRange: Record<string, unknown> | null = null;

  @ManyToOne(() => User, { fieldName: "author_id", nullable: false })
  author!: User;

  @Property({ type: "text", fieldName: "body_md" })
  bodyMd!: string;

  @ManyToOne(() => DocComment, {
    fieldName: "parent_comment_id",
    nullable: true,
    deleteRule: "cascade",
  })
  parentComment: DocComment | null = null;

  @Property({ type: "boolean", fieldName: "resolved", default: false })
  resolved: boolean = false;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({
    type: "datetime",
    fieldName: "updated_at",
    defaultRaw: "now()",
    onUpdate: () => new Date(),
  })
  updatedAt!: Date;
}
