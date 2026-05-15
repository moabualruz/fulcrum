/**
 * Document entity — docs domain.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";
import { Org } from "../auth/Org.ts";
import type { DocType, Scope } from "./enums.ts";

const vectorTransformer = {
  to(value: number[] | null | undefined): string | null {
    if (value == null) return null;
    return JSON.stringify(value);
  },
  from(value: string | number[] | null | undefined): number[] | null {
    if (value == null) return null;
    if (Array.isArray(value)) return value.map(Number);
    return JSON.parse(value as string) as number[];
  },
};

@Entity("documents")
@Index("idx_documents_org_updated", ["org", "updatedAt"])
@Index() // expression: CREATE UNIQUE INDEX "documents_id_org_unique" ON "documents" ("id", "org_id")
@Index("docs_org_project_scope", ["org", "projectId", "scope"])
@Index("docs_org_doc_type", ["org", "docType"])
@Index("docs_org_parent", ["org", "parent"])
@Index() // expression: CREATE UNIQUE INDEX "docs_org_external_id" ON "documents" ("org_id", "external_id") WHERE "external_id" IS NOT NULL
export class Document {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org)
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @ManyToOne(() => Document, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "parent_id" })
  parent: Document | null = null;

  @Column({ name: "project_id", nullable: true })
  projectId: string | null = null;

  @Column({ name: "scope", default: "project" })
  scope: Scope = "project";

  @Column({ name: "doc_type", default: "note" })
  docType: DocType = "note";

  @Column({ type: "jsonb", name: "frontmatter", default: () => "'{}'" })
  frontmatter: Record<string, unknown> = {};

  @Column({ type: "text", name: "body_md", default: "" })
  bodyMd: string = "";

  @Column({ type: "jsonb", name: "content_json", default: () => "'{}'" })
  contentJson: Record<string, unknown> = {};

  @Column({ type: "float", name: "sort_position", default: 0 })
  sortPosition: number = 0;

  @Column({ type: "boolean", name: "archived", default: false })
  archived: boolean = false;

  @Column({ name: "external_id", nullable: true })
  externalId: string | null = null;

  @Column({ type: "text", nullable: true, transformer: vectorTransformer })
  embedding?: number[];

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;

  @Column({ nullable: true })
  title?: string | null;

  @Column({ type: "jsonb", nullable: true, name: "context_summary" })
  contextSummary?: { headings: string[]; wikilinks: string[]; mentions: string[] } | null;
}
