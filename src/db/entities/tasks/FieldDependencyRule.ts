import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

import { Org } from "../auth/Org.ts";

@Entity({ tableName: "field_dependency_rules" })
@Index({ name: "field_dependency_rules_project", properties: ["projectId"] })
export class FieldDependencyRule {
  [OptionalProps]?: "createdAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @Property({ type: "uuid", fieldName: "project_id" })
  projectId!: string;

  @Property({ type: "uuid", fieldName: "source_field_id" })
  sourceFieldId!: string;

  @Property({ type: "string", fieldName: "source_value" })
  sourceValue!: string;

  @Property({ type: "uuid", fieldName: "target_field_id" })
  targetFieldId!: string;

  @Property({ type: "string" })
  action!: string;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
