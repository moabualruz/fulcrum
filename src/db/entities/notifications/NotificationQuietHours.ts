/**
 * NotificationQuietHours entity — notifications domain (Pillar 12).
 *
 * Per-user quiet window; gated delivery channels are suppressed in the window.
 * In-app notifications are unaffected.
 *
 * C2: org_id FK cascade; UNIQUE per user (one quiet-hours config per user).
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

@Entity({ tableName: "notification_quiet_hours" })
@Unique({ name: "uq_notification_quiet_hours_user", properties: ["userId"] })
export class NotificationQuietHours {
  [OptionalProps]?: "tz" | "daysOfWeek";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @Property({ type: "uuid", fieldName: "user_id" })
  userId!: string;

  /** IANA timezone (e.g. "America/New_York"). */
  @Property({ type: "string", default: "UTC" })
  tz: string = "UTC";

  /** Hour of day (0–23) when quiet window begins. */
  @Property({ type: "integer", fieldName: "start_hour" })
  startHour!: number;

  /** Hour of day (0–23) when quiet window ends. */
  @Property({ type: "integer", fieldName: "end_hour" })
  endHour!: number;

  /**
   * ISO weekday numbers (0=Sunday … 6=Saturday) when quiet hours apply.
   * Stored as Postgres integer[]. Default: all days.
   */
  @Property({ type: "array", fieldName: "days_of_week", default: [0, 1, 2, 3, 4, 5, 6] })
  daysOfWeek: number[] = [0, 1, 2, 3, 4, 5, 6];
}
