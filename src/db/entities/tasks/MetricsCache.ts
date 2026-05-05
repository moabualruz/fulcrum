import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

import { Sprint } from "./Sprint.ts";

@Entity({ tableName: "metrics_cache" })
@Index({
  name: "metrics_cache_project_sprint_date",
  properties: ["projectId", "sprint", "date"],
})
@Unique({
  name: "metrics_cache_project_sprint_date_unique",
  properties: ["projectId", "sprint", "date"],
})
export class MetricsCache {
  [OptionalProps]?:
    | "startedCount"
    | "completedCount"
    | "blockedCount"
    | "pointsCompleted"
    | "pointsRemaining"
    | "wipCount"
    | "updatedAt"
    | "scopeType"
    | "pointsTotal"
    | "tasksTotal"
    | "statusCounts";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "uuid", fieldName: "project_id" })
  projectId!: string;

  @ManyToOne(() => Sprint, {
    fieldName: "sprint_id",
    nullable: true,
    deleteRule: "cascade",
  })
  sprint?: Sprint | null;

  @Property({ type: "date" })
  date!: Date;

  @Property({ type: "integer", fieldName: "started_count", default: 0 })
  startedCount: number = 0;

  @Property({ type: "integer", fieldName: "completed_count", default: 0 })
  completedCount: number = 0;

  @Property({ type: "integer", fieldName: "blocked_count", default: 0 })
  blockedCount: number = 0;

  @Property({ type: "integer", fieldName: "points_completed", default: 0 })
  pointsCompleted: number = 0;

  @Property({ type: "integer", fieldName: "points_remaining", default: 0 })
  pointsRemaining: number = 0;

  @Property({ type: "integer", fieldName: "wip_count", default: 0 })
  wipCount: number = 0;

  @Property({
    type: "datetime",
    fieldName: "updated_at",
    defaultRaw: "now()",
    onUpdate: () => new Date(),
  })
  updatedAt!: Date;

  // Phase 5 columns added by Migration20260505100000 (HIGH-01 fix)
  @Property({ type: "string", fieldName: "scope_type", default: "sprint" })
  scopeType: "sprint" | "project" | "epic" | "workspace" = "sprint";

  @Property({ type: "integer", fieldName: "points_total", default: 0 })
  pointsTotal: number = 0;

  @Property({ type: "integer", fieldName: "tasks_total", default: 0 })
  tasksTotal: number = 0;

  @Property({ type: "json", fieldName: "status_counts", nullable: true })
  statusCounts: Record<string, number> | null = null;
}
