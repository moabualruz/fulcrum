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
import type { TaskStatusCategory } from "./schemas.ts";
export {
  TASK_STATUS_CATEGORIES,
  TaskStatusCategorySchema,
  type TaskStatusCategory,
} from "./schemas.ts";

@Entity({ tableName: "task_statuses" })
@Index({
  name: "task_statuses_org_project",
  properties: ["org", "projectId"],
})
@Unique({
  name: "task_statuses_project_name_unique",
  properties: ["projectId", "name"],
})
export class TaskStatus {
  [OptionalProps]?: "color" | "position" | "isDefault";

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

  @Property({ type: "string" })
  name!: string;

  @Property({ type: "string", default: "#6B7280" })
  color: string = "#6B7280";

  @Property({
    type: "string",
    check: "category in ('unstarted','started','completed','cancelled')",
  })
  category!: TaskStatusCategory;

  @Property({ type: "integer", default: 0 })
  position: number = 0;

  @Property({ type: "boolean", fieldName: "is_default", default: false })
  isDefault: boolean = false;
}
