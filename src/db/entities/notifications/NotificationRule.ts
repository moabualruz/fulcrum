/**
 * NotificationRule entity — notifications domain (Pillar 12 full expansion).
 *
 * Expands the stub `notification_rules` table created by
 * Migration20260501130100_flag_stubs with per-user declarative rule fields.
 *
 * C2: Composite (org_id, user_id) + (org_id, enabled) indexes.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 * C9: Entity lives at src/db/entities/notifications/NotificationRule.ts.
 */

import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
import { Org } from "../auth/Org.ts";

@Entity({ tableName: "notification_rules" })
@Index({ name: "notification_rules_org_user", properties: ["org", "userId"] })
@Index({ name: "notification_rules_org_enabled", properties: ["org", "enabled"] })
export class NotificationRule {
  [OptionalProps]?: "eventPattern" | "channels" | "enabled" | "createdAt" | "updatedAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  /**
   * User this rule belongs to.
   * nullable: stub rows seeded without a user; P12 rows always have a user.
   */
  @Property({ type: "uuid", fieldName: "user_id", nullable: true })
  userId: string | null = null;

  /** Entity kind (stub column kept for backward-compat). */
  @Property({ type: "string", fieldName: "subject_kind", nullable: true })
  subjectKind: string | null = null;

  /** Legacy stub "active" column. Kept; mirrors `enabled`. */
  @Property({ type: "boolean", fieldName: "active", default: true })
  active: boolean = true;

  /** Human-readable label (e.g. "assignment-to-me"). */
  @Property({ type: "string", nullable: true })
  name: string | null = null;

  /**
   * Jsonb AST: { subject_kind, verb, payload_path_eq[], project_id?, sprint_id? }.
   * Rule engine matches incoming events against this pattern.
   */
  @Property({ type: "json", fieldName: "event_pattern", nullable: true })
  eventPattern: Record<string, unknown> | null = null;

  /**
   * Delivery channels: "in-app" | "email" | "webhook" | "slack" | "discord" | "push".
   * Stored as Postgres text[].
   */
  @Property({ type: "array", fieldName: "channels", nullable: true })
  channels: string[] | null = null;

  /** True = rule is evaluated; false = silenced. Pillar 12 preferred field. */
  @Property({ type: "boolean", fieldName: "enabled", default: true })
  enabled: boolean = true;

  @Property({ type: "datetime", fieldName: "created_at", nullable: true })
  createdAt: Date | null = null;

  @Property({ type: "datetime", fieldName: "updated_at", nullable: true })
  updatedAt: Date | null = null;
}
