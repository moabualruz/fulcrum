/**
 * NotificationRule entity — flags domain (Pillar 12: Notifications stub).
 *
 * Per-org notification rule. Rows are written only when one of
 * `notify-email`/`notify-webhook`/`notify-slack` feature flags is enabled.
 * Pillar 12 evaluates rules against incoming events and dispatches via the
 * channel/target pair.
 *
 * C2: Composite (org_id, active, subject_kind) index — Pillar 12 dispatch
 *     loop filters per-org active rules by subject kind.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 * C8: @Entity({ repository }) wires NotificationRuleRepository.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
} from "@mikro-orm/decorators/es";
import { Org } from "../auth/Org.ts";
import { NotificationRuleRepository } from "../../repositories/flags/NotificationRuleRepository.ts";

@Entity({
  tableName: "notification_rules",
  repository: () => NotificationRuleRepository,
})
@Index({
  name: "idx_notification_rules_org_active_subject",
  properties: ["org", "active", "subjectKind"],
})
export class NotificationRule {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  /** Entity kind (e.g. "task", "doc") this rule matches. */
  @Property({ type: "string", fieldName: "subject_kind" })
  subjectKind!: string;

  /** Verb (e.g. "created", "completed") this rule matches; "*" = any. */
  @Property({ type: "string" })
  verb!: string;

  /** Channel: "email" | "webhook" | "slack". */
  @Property({ type: "string" })
  channel!: string;

  /** Channel-specific target (email address, webhook URL, slack channel). */
  @Property({ type: "string" })
  target!: string;

  @Property({ type: "boolean" })
  active: boolean = true;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
