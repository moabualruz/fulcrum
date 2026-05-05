import {
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

import { Org } from "../auth/Org.ts";

@Entity({ tableName: "task_watchers" })
@Unique({ name: "task_watchers_task_user_uniq", properties: ["taskId", "userId"] })
export class TaskWatcher {
  [OptionalProps]?: "createdAt" | "source";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @Property({ type: "uuid", fieldName: "task_id" })
  taskId!: string;

  @Property({ type: "uuid", fieldName: "user_id" })
  userId!: string;

  @Property({ type: "string" })
  source: string = "manual";

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
