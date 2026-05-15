import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";

import { Org } from "../auth/Org.ts";

@Entity("audit_events")
@Index() // expression index: CREATE INDEX "audit_events_org_project_created" ON "audit_events" ("org_id", "project_id", "created_at" DESC)
@Index("audit_events_subject", ["org", "subjectKind", "subjectId"])
export class AuditEvent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "project_id" })
  projectId!: string;

  @Column({ name: "actor_id" })
  actorId!: string;

  @Column()
  action!: string;

  @Column({ name: "subject_kind" })
  subjectKind!: string;

  @Column({ name: "subject_id" })
  subjectId!: string;

  @Column({ type: "jsonb" })
  payload: Record<string, unknown> = {};

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
