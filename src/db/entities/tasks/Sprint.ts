import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

import { Org } from "../auth/Org.ts";
import type { SprintStatusValue } from "./schemas.ts";

export enum SprintStatus {
  planned = "planned",
  active = "active",
  completed = "completed",
}

@Entity({ tableName: "sprints" })
@Index({
  name: "sprints_org_project_status",
  properties: ["org", "projectId", "status"],
})
@Index({
  name: "sprints_one_active_per_project",
  expression:
    'CREATE UNIQUE INDEX "sprints_one_active_per_project" ON "sprints" ("project_id") WHERE "status" = \'active\'',
})
export class Sprint {
  [OptionalProps]?:
    | "goal"
    | "status"
    | "capacityPoints"
    | "createdAt";

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

  @Property({ type: "text", nullable: true })
  goal: string | null = null;

  @Property({ type: "date", fieldName: "start_date" })
  startDate!: Date;

  @Property({ type: "date", fieldName: "end_date" })
  endDate!: Date;

  @Property({
    type: "string",
    default: SprintStatus.planned,
    check: "status in ('planned','active','completed')",
  })
  status: SprintStatusValue = SprintStatus.planned;

  @Property({ type: "integer", fieldName: "capacity_points", nullable: true })
  capacityPoints: number | null = null;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
