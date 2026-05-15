/**
 * Event entity — core domain (canonical audit log).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";
import { Org } from "../auth/Org.ts";
import { User } from "../auth/User.ts";

@Entity("events")
@Index() // expression: CREATE INDEX "idx_events_org_created" ON "events" ("org_id", "created_at" DESC)
@Index() // expression: CREATE INDEX "idx_events_subject" ON "events" ("org_id", "subject_kind", "subject_id", "created_at" DESC)
export class Event {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org)
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "user_id" })
  user?: User;

  @Column({ nullable: true })
  actor?: string;

  @Column({ name: "project_id", nullable: true })
  projectId?: string;

  @Column()
  verb!: string;

  @Column({ name: "subject_kind" })
  subjectKind!: string;

  @Column({ name: "subject_id", nullable: true })
  subjectId?: string;

  @Column({ type: "jsonb", nullable: true })
  payload?: Record<string, unknown>;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ name: "field_name", nullable: true })
  fieldName?: string;

  @Column({ type: "jsonb", name: "from_value", nullable: true })
  fromValue?: unknown;

  @Column({ type: "jsonb", name: "to_value", nullable: true })
  toValue?: unknown;
}
