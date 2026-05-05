import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

import { Org } from "../auth/Org.ts";

@Entity({ tableName: "task_relationships" })
@Unique({
  name: "task_relationships_uniq",
  properties: ["sourceTaskId", "targetTaskId", "type"],
})
@Index({ name: "task_relationships_source", properties: ["sourceTaskId"] })
@Index({ name: "task_relationships_target", properties: ["targetTaskId"] })
export class TaskRelationship {
  [OptionalProps]?: "createdAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @Property({ type: "uuid", fieldName: "source_task_id" })
  sourceTaskId!: string;

  @Property({ type: "uuid", fieldName: "target_task_id" })
  targetTaskId!: string;

  @Property({ type: "string" })
  type!: string;

  @Property({ type: "uuid", fieldName: "created_by" })
  createdBy!: string;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
