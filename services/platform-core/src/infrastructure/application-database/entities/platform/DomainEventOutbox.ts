import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

@Entity("domain_event_outbox")
@Index() // expression: CREATE INDEX "domain_event_outbox_pending" ON "domain_event_outbox" ("processed_at", "created_at") WHERE "processed_at" IS NULL
@Index() // expression: CREATE UNIQUE INDEX "domain_event_outbox_event_key_unique" ON "domain_event_outbox" ("event_key")
export class DomainEventOutbox {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar", name: "project_id", nullable: true })
  projectId?: string | null;

  @Column({ type: "varchar" })
  verb!: string;

  @Column({ type: "varchar", name: "subject_kind" })
  subjectKind!: string;

  @Column({ type: "varchar", name: "subject_id", nullable: true })
  subjectId?: string | null;

  @Column({ type: "varchar", name: "event_key" })
  eventKey!: string;

  @Column({ type: "jsonb" })
  payload: Record<string, unknown> = {};

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "processed_at", nullable: true })
  processedAt: Date | null = null;

  @Column({ type: "integer", default: 0 })
  attempts: number = 0;
}
