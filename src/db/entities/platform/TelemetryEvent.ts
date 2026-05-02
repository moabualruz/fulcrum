/**
 * TelemetryEvent entity — platform domain (Pillar 17 cross-cutting).
 *
 * Local-first usage telemetry. Rows written ONLY when the user opts in via
 * `tenant_settings.telemetry.local-collection = true` (always-on opt-in form),
 * remote forwarding gated behind `FULCRUM_FEATURES=telemetry-remote`.
 *
 * Q22: org FK NOT NULL + composite indexes at table-creation time.
 *      (org, occurred_at DESC) — recent-events timeline query.
 *      (org, user, kind)        — per-user event-kind aggregation.
 * C2: org_id NOT NULL cascade; user_id nullable set-null (user deletion does
 *     not destroy aggregate telemetry — anonymised on user removal).
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 * C8: @Entity({ repository }) wires TelemetryEventRepository.
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
import { TelemetryEventRepository } from "../../repositories/platform/TelemetryEventRepository.ts";

@Entity({
  tableName: "telemetry_events",
  repository: () => TelemetryEventRepository,
})
@Index({
  name: "idx_telemetry_events_org_occurred",
  expression:
    'CREATE INDEX "idx_telemetry_events_org_occurred" ON "telemetry_events" ("org_id", "occurred_at" DESC)',
})
@Index({
  name: "idx_telemetry_events_org_user_kind",
  properties: ["org", "user", "kind"],
})
export class TelemetryEvent {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  /** Acting user — nullable; system-emitted telemetry rows have no user. */
  @ManyToOne(() => User, {
    fieldName: "user_id",
    nullable: true,
    deleteRule: "set null",
  })
  user?: User;

  /** Event kind verb (e.g. "task.created", "agent.run.dispatched"). */
  @Property({ type: "string" })
  kind!: string;

  /**
   * Aggregate-only payload — no titles/bodies/file paths. Pillar 17 scrubber
   * enforces shape before insert.
   */
  @Property({ type: "json" })
  payload: Record<string, unknown> = {};

  @Property({ type: "datetime", fieldName: "occurred_at", defaultRaw: "now()" })
  occurredAt!: Date;
}
