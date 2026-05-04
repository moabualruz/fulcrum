import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

import { Org } from "../auth/Org.ts";
import { SprintRepository } from "../../repositories/tasks/SprintRepository.ts";
import type { SprintStatusValue } from "./schemas.ts";

export enum SprintStatus {
  planned = "planned",
  active = "active",
  completed = "completed",
}

export interface MetricsSnapshot {
  capacity_points: number | null;
  completed_points: number;
  total_tasks: number;
  completed_tasks: number;
  velocity: number;
}

@Entity({ tableName: "sprints", repository: () => SprintRepository })
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
    | "createdAt"
    | "updatedAt"
    | "closedAt"
    | "metricsSnapshot"
    | "retroDocId";

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

  @Property({ type: "datetime", fieldName: "closed_at", nullable: true })
  closedAt: Date | null = null;

  @Property({ type: "json", fieldName: "metrics_snapshot", nullable: true })
  metricsSnapshot: MetricsSnapshot | null = null;

  @Property({ type: "string", fieldName: "retro_doc_id", nullable: true })
  retroDocId: string | null = null;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
