import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

import { Org } from "../auth/Org.ts";

@Entity({ tableName: "domain_event_outbox" })
@Index({
  name: "domain_event_outbox_pending",
  expression: 'CREATE INDEX "domain_event_outbox_pending" ON "domain_event_outbox" ("processed_at", "created_at") WHERE "processed_at" IS NULL',
})
@Index({
  name: "domain_event_outbox_event_key_unique",
  expression: 'CREATE UNIQUE INDEX "domain_event_outbox_event_key_unique" ON "domain_event_outbox" ("event_key")',
})
export class DomainEventOutbox {
  [OptionalProps]?: "createdAt" | "processedAt" | "attempts";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false, deleteRule: "cascade" })
  org!: Org;

  @Property({ type: "string", fieldName: "project_id", nullable: true })
  projectId?: string | null;

  @Property({ type: "string" })
  verb!: string;

  @Property({ type: "string", fieldName: "subject_kind" })
  subjectKind!: string;

  @Property({ type: "string", fieldName: "subject_id", nullable: true })
  subjectId?: string | null;

  @Property({ type: "string", fieldName: "event_key" })
  eventKey!: string;

  @Property({ type: "json" })
  payload: Record<string, unknown> = {};

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "processed_at", nullable: true })
  processedAt: Date | null = null;

  @Property({ type: "integer", default: 0 })
  attempts: number = 0;
}
