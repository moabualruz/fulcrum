/**
 * DocTemplate entity — org/project-scoped default content per doc type.
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
import type { DocType } from "./enums.ts";

@Entity("doc_templates")
@Unique("doc_templates_org_project_type_name_unique", ["org", "projectId", "docType", "name"])
@Index() // expression: CREATE UNIQUE INDEX "doc_templates_org_global_type_name_unique" ON "doc_templates" ("org_id", "doc_type", "name") WHERE "project_id" IS NULL
@Index("doc_templates_org_project_type", ["org", "projectId", "docType"])
export class DocTemplate {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar", name: "project_id", nullable: true })
  projectId: string | null = null;

  @Column({ type: "varchar", name: "doc_type" })
  docType!: DocType;

  @Column({ type: "varchar", name: "name" })
  name!: string;

  @Column({ type: "jsonb", name: "frontmatter_template", default: () => "'{}'" })
  frontmatterTemplate: Record<string, unknown> = {};

  @Column({ type: "text", name: "body_template", default: "" })
  bodyTemplate: string = "";

  @Column({ type: "boolean", name: "is_default", default: false })
  isDefault: boolean = false;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
