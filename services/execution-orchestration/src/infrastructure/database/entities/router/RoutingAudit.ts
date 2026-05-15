/**
 * RoutingAudit entity — audit trail for routing operations (Pillar 5, RTR-02).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

@Entity("routing_audit_events")
@Index("idx_routing_audit_org_created", ["org", "createdAt"])
export class RoutingAudit {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar", name: "event_type" })
  eventType!: string;

  @Column({ type: "varchar", name: "subject_type" })
  subjectType!: string;

  @Column({ type: "varchar", name: "subject_id" })
  subjectId!: string;

  @Column({ type: "jsonb", name: "payload_json" })
  payloadJson: Record<string, unknown> = {};

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
