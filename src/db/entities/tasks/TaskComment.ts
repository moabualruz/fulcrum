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

@Entity({ tableName: "task_comments" })
@Index({ name: "task_comments_task_id", properties: ["taskId"] })
@Index({ name: "task_comments_org_task", properties: ["org", "taskId"] })
export class TaskComment {
  [OptionalProps]?:
    | "createdAt"
    | "updatedAt"
    | "resolved"
    | "resolvedAt"
    | "resolvedBy"
    | "parentCommentId"
    | "body";

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

  @Property({ type: "uuid", fieldName: "author_id" })
  authorId!: string;

  @Property({ type: "json", nullable: true })
  body: object | null = null;

  @Property({ type: "uuid", fieldName: "parent_comment_id", nullable: true })
  parentCommentId: string | null = null;

  @Property({ type: "boolean", default: false })
  resolved: boolean = false;

  @Property({ type: "uuid", fieldName: "resolved_by", nullable: true })
  resolvedBy: string | null = null;

  @Property({ type: "datetime", fieldName: "resolved_at", nullable: true })
  resolvedAt: Date | null = null;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
