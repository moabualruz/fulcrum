/**
 * Event entity — core domain (canonical audit log).
 *
 * Every user or system action emits an Event row. The events table is the
 * foundation for burndown, velocity, audit-log (A4), notification rules (Q26),
 * and on-demand metrics queries (Q8).
 *
 * C2: org FK required from day one; composite (org, createdAt desc) index mandatory.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 * C8: @Entity({ repository }) wires EventRepository.
 * D4: Well-known local org UUID `00000000-0000-0000-0000-000000000001` used
 *     in backfill if any legacy rows exist with org = null.
 * Q22: Composite (org, createdAt desc) + (org, subjectKind, subjectId, createdAt desc)
 *      indexes required at table-creation time (per locked decision Q22).
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
} from "@mikro-orm/decorators/es";
import { Org } from "../auth/Org.ts";
import { User } from "../auth/User.ts";
import { EventRepository } from "../../repositories/core/EventRepository.ts";

@Entity({ tableName: "events", repository: () => EventRepository })
// Composite index for timeline queries: events per org sorted by recency.
// expression form required to encode "created_at DESC" direction, since
// MikroORM v7 @Index({ properties }) doesn't support per-property ordering.
@Index({
  name: "idx_events_org_created",
  expression: 'CREATE INDEX "idx_events_org_created" ON "events" ("org_id", "created_at" DESC)',
})
// Composite index for subject-scoped queries: audit trail for a specific entity.
// Same rationale: expression form preserves "created_at DESC" in ORM metadata.
@Index({
  name: "idx_events_subject",
  expression: 'CREATE INDEX "idx_events_subject" ON "events" ("org_id", "subject_kind", "subject_id", "created_at" DESC)',
})
export class Event {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  /**
   * Owning org — NOT NULL. Backfill: any legacy rows with org = null
   * are set to well-known UUID (D4) by the events-backfill migration.
   */
  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  /**
   * Acting user — nullable (system/automation events have no user actor).
   */
  @ManyToOne(() => User, { fieldName: "user_id", nullable: true })
  user?: User;

  /** String actor identifier (e.g. "system", user email). Nullable for pure user-FK events. */
  @Property({ type: "string", nullable: true })
  actor?: string;

  /** Project scope — nullable for org-wide events. */
  @Property({ type: "uuid", fieldName: "project_id", nullable: true })
  projectId?: string;

  /** Action verb: domain.past-tense-noun (e.g. "task.created", "sprint.closed"). */
  @Property({ type: "string" })
  verb!: string;

  /** Entity kind that this event is about (e.g. "task", "doc", "agent_run"). */
  @Property({ type: "string", fieldName: "subject_kind" })
  subjectKind!: string;

  /** Entity ID that this event is about. Nullable for system-level events. */
  @Property({ type: "string", fieldName: "subject_id", nullable: true })
  subjectId?: string;

  /** Arbitrary structured payload — event-type-specific data. */
  @Property({ type: "json", nullable: true })
  payload?: Record<string, unknown>;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
