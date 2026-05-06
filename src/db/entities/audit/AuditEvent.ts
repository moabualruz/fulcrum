import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

import { Org } from "../auth/Org.ts";

@Entity({ tableName: "audit_events" })
@Index({
  name: "audit_events_org_project_created",
  expression: 'CREATE INDEX "audit_events_org_project_created" ON "audit_events" ("org_id", "project_id", "created_at" DESC)',
})
@Index({
  name: "audit_events_subject",
  properties: ["org", "subjectKind", "subjectId"],
})
export class AuditEvent {
  [OptionalProps]?: "payload" | "createdAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false, deleteRule: "cascade" })
  org!: Org;

  @Property({ type: "string", fieldName: "project_id" })
  projectId!: string;

  @Property({ type: "string", fieldName: "actor_id" })
  actorId!: string;

  @Property({ type: "string" })
  action!: string;

  @Property({ type: "string", fieldName: "subject_kind" })
  subjectKind!: string;

  @Property({ type: "string", fieldName: "subject_id" })
  subjectId!: string;

  @Property({ type: "json" })
  payload: Record<string, unknown> = {};

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
