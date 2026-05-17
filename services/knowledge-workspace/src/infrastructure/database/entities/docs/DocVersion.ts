/**
 * DocVersion entity — snapshot+delta version history for documents.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  Unique,
  JoinColumn,
} from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { User } from "@identity-access/infrastructure/database/entities/auth/User.ts";
import { Document } from "./Document.ts";

@Entity("doc_versions")
@Index() // expression: CREATE UNIQUE INDEX "doc_versions_id_org_unique" ON "doc_versions" ("id", "org_id")
@Unique("doc_versions_doc_version_unique", ["doc", "versionNum"])
@Index("doc_versions_org_doc_version", ["org", "doc", "versionNum"])
@Index("doc_versions_author", ["author"])
export class DocVersion {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @ManyToOne(() => Document, { onDelete: "CASCADE" })
  @JoinColumn({ name: "doc_id" })
  doc!: Document;

  @Column({ type: "integer", name: "version_num" })
  versionNum!: number;

  @Column({ type: "jsonb", name: "snapshot", nullable: true })
  snapshot: Record<string, unknown> | null = null;

  @Column({ type: "jsonb", name: "delta", nullable: true })
  delta: Record<string, unknown> | null = null;

  @Column({ type: "text", name: "body_md_snapshot", nullable: true })
  bodyMdSnapshot: string | null = null;

  /** Yjs binary state vector; written by Hocuspocus persistence when collab flag ON. */
  @Column({ type: "bytea", name: "yjs_state", nullable: true })
  yjsState: Buffer | null = null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "author_id" })
  author: User | null = null;

  @ManyToOne(() => DocVersion, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "restore_of" })
  restoreOf: DocVersion | null = null;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
