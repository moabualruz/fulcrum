/**
 * EventRetentionPolicy entity — notifications domain (Pillar 12).
 *
 * One row per (org, project) scope. null project = org-wide default.
 * retainDays = 0 means keep forever; > 0 means prune events older than N days.
 *
 * A4 default: local org seeded with retain_days=365.
 *
 * C2: org_id FK cascade; UNIQUE (org_id, project_id) NULLS NOT DISTINCT.
 * C7: MikroORM v7 ES Stage-3 decorator pattern.
 */

import {
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
import { Org } from "../auth/Org.ts";

@Entity({ tableName: "event_retention_policy" })
@Unique({
  name: "uq_event_retention_policy_org_project",
  properties: ["org", "projectId"],
})
export class EventRetentionPolicy {
  [OptionalProps]?: "projectId" | "retainDays";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  /** null = org-wide policy; UUID = project-scoped override. */
  @Property({ type: "uuid", fieldName: "project_id", nullable: true })
  projectId: string | null = null;

  /**
   * Days to retain events. 0 = keep forever.
   * A4 default for local org: 365.
   */
  @Property({ type: "integer", fieldName: "retain_days", default: 0 })
  retainDays: number = 0;
}
