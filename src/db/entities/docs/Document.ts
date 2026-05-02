/**
 * Document entity — docs domain.
 *
 * C2/Q22: org-scoped composite indexes cover tenant-local doc tree/list paths.
 * C6/C7: schema via MikroORM v7 ES decorator entity.
 * C8: @Entity({ repository }) wires DocumentRepository.
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
import { DocumentRepository } from "../../repositories/docs/DocumentRepository.ts";
import type { DocType, Scope } from "./enums.ts";
import { VectorType } from "../../types/VectorType.ts";

@Entity({ tableName: "documents", repository: () => DocumentRepository })
@Index({
  name: "idx_documents_org_updated",
  properties: ["org", "updatedAt"],
})
@Index({
  name: "docs_org_project_scope",
  properties: ["org", "projectId", "scope"],
})
@Index({
  name: "docs_org_doc_type",
  properties: ["org", "docType"],
})
@Index({
  name: "docs_org_parent",
  properties: ["org", "parent"],
})
@Index({
  name: "docs_org_external_id",
  expression:
    'CREATE UNIQUE INDEX "docs_org_external_id" ON "documents" ("org_id", "external_id") WHERE "external_id" IS NOT NULL',
})
export class Document {
  [OptionalProps]?:
    | "parent"
    | "projectId"
    | "scope"
    | "docType"
    | "frontmatter"
    | "bodyMd"
    | "contentJson"
    | "sortPosition"
    | "archived"
    | "externalId"
    | "embedding"
    | "updatedAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  @ManyToOne(() => Document, {
    fieldName: "parent_id",
    nullable: true,
    deleteRule: "set null",
  })
  parent: Document | null = null;

  @Property({ type: "uuid", fieldName: "project_id", nullable: true })
  projectId: string | null = null;

  @Property({
    type: "string",
    fieldName: "scope",
    default: "project",
    check: "scope in ('project','global')",
  })
  scope: Scope = "project";

  @Property({
    type: "string",
    fieldName: "doc_type",
    default: "note",
    check:
      "doc_type in ('spec','adr','wiki','runbook','meeting','postmortem','rfc','note','scratch')",
  })
  docType: DocType = "note";

  @Property({ type: "json", fieldName: "frontmatter", defaultRaw: "'{}'::jsonb" })
  frontmatter: Record<string, unknown> = {};

  @Property({ type: "text", fieldName: "body_md", default: "" })
  bodyMd: string = "";

  @Property({ type: "json", fieldName: "content_json", defaultRaw: "'{}'::jsonb" })
  contentJson: Record<string, unknown> = {};

  @Property({ type: "float", fieldName: "sort_position", default: 0 })
  sortPosition: number = 0;

  @Property({ type: "boolean", fieldName: "archived", default: false })
  archived: boolean = false;

  @Property({ type: "string", fieldName: "external_id", nullable: true })
  externalId: string | null = null;

  @Property({ type: VectorType, length: 384, nullable: true })
  embedding?: number[];

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
