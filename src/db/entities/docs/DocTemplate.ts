/**
 * DocTemplate entity — org/project-scoped default content per doc type.
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
import { DocTemplateRepository } from "../../repositories/docs/DocTemplateRepository.ts";
import type { DocType } from "./enums.ts";

@Entity({ tableName: "doc_templates", repository: () => DocTemplateRepository })
@Unique({
  name: "doc_templates_org_project_type_name_unique",
  properties: ["org", "projectId", "docType", "name"],
})
@Index({
  name: "doc_templates_org_project_type",
  properties: ["org", "projectId", "docType"],
})
export class DocTemplate {
  [OptionalProps]?:
    | "projectId"
    | "frontmatterTemplate"
    | "bodyTemplate"
    | "isDefault"
    | "createdAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @Property({ type: "uuid", fieldName: "project_id", nullable: true })
  projectId: string | null = null;

  @Property({
    type: "string",
    fieldName: "doc_type",
    check:
      "doc_type in ('spec','adr','wiki','runbook','meeting','postmortem','rfc','note','scratch')",
  })
  docType!: DocType;

  @Property({ type: "string", fieldName: "name" })
  name!: string;

  @Property({
    type: "json",
    fieldName: "frontmatter_template",
    defaultRaw: "'{}'::jsonb",
  })
  frontmatterTemplate: Record<string, unknown> = {};

  @Property({ type: "text", fieldName: "body_template", default: "" })
  bodyTemplate: string = "";

  @Property({ type: "boolean", fieldName: "is_default", default: false })
  isDefault: boolean = false;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
