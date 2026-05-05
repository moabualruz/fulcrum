/**
 * RoutingAudit entity — audit trail for routing operations (Pillar 5, RTR-02).
 *
 * Records every draft/approval/delete event with full payload JSON.
 * Addresses T-04-04-AUDIT (Repudiation): every mutation records
 * event type, subject, and payload.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
} from "@mikro-orm/decorators/es";
import { Org } from "../auth/Org.ts";

@Entity({ tableName: "routing_audit_events" })
@Index({
  name: "idx_routing_audit_org_created",
  properties: ["org", "createdAt"],
})
export class RoutingAudit {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @Property({ type: "string", fieldName: "event_type" })
  eventType!: string;

  @Property({ type: "string", fieldName: "subject_type" })
  subjectType!: string;

  @Property({ type: "string", fieldName: "subject_id" })
  subjectId!: string;

  @Property({ type: "json", fieldName: "payload_json" })
  payloadJson: Record<string, unknown> = {};

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
