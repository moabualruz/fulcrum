/**
 * NotificationQuietHours entity — notifications domain (Pillar 12).
 */

import {
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  JoinColumn,
} from "typeorm";
import { Org } from "../auth/Org.ts";

@Entity("notification_quiet_hours")
@Unique("uq_notification_quiet_hours_user", ["userId"])
export class NotificationQuietHours {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "user_id" })
  userId!: string;

  /** IANA timezone (e.g. "America/New_York"). */
  @Column({ default: "UTC" })
  tz: string = "UTC";

  @Column({ type: "integer", name: "start_hour" })
  startHour!: number;

  @Column({ type: "integer", name: "end_hour" })
  endHour!: number;

  @Column({ type: "simple-array", name: "days_of_week" })
  daysOfWeek: number[] = [0, 1, 2, 3, 4, 5, 6];
}
