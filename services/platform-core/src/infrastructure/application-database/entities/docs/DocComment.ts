/**
 * DocComment entity — anchored markdown comment threads for documents.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  UpdateDateColumn,
  JoinColumn,
} from "typeorm";
import { Org } from "../auth/Org.ts";
import { User } from "../auth/User.ts";
import { Document } from "./Document.ts";

@Entity("doc_comments")
@Index() // expression: CREATE UNIQUE INDEX "doc_comments_id_org_unique" ON "doc_comments" ("id", "org_id")
@Index("doc_comments_org_doc", ["org", "doc"])
@Index("doc_comments_author", ["author"])
export class DocComment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @ManyToOne(() => Document, { onDelete: "CASCADE" })
  @JoinColumn({ name: "doc_id" })
  doc!: Document;

  @Column({ type: "jsonb", name: "anchor_range", nullable: true })
  anchorRange: Record<string, unknown> | null = null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "author_id" })
  author: User | null = null;

  @Column({ type: "text", name: "body_md" })
  bodyMd!: string;

  @ManyToOne(() => DocComment, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "parent_comment_id" })
  parentComment: DocComment | null = null;

  @Column({ type: "boolean", name: "resolved", default: false })
  resolved: boolean = false;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
