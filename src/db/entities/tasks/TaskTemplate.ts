import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

import { Org } from "../auth/Org.ts";

@Entity({ tableName: "task_templates" })
@Index({ name: "task_templates_org_project", properties: ["org", "projectId"] })
@Index({
  name: "task_templates_one_default_per_project",
  expression:
    'CREATE UNIQUE INDEX "task_templates_one_default_per_project" ON "task_templates" ("org_id", "project_id") WHERE "is_default" = true',
})
export class TaskTemplate {
  [OptionalProps]?:
    | "createdAt"
    | "updatedAt"
    | "isDefault"
    | "description"
    | "projectId"
    | "templateData";

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

  @Property({ type: "string" })
  name!: string;

  @Property({ type: "text", nullable: true })
  description: string | null = null;

  @Property({ type: "json", fieldName: "template_data", nullable: true })
  templateData: object | null = null;

  @Property({ type: "boolean", fieldName: "is_default", default: false })
  isDefault: boolean = false;

  @Property({ type: "uuid", fieldName: "created_by" })
  createdBy!: string;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
