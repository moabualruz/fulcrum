/**
 * NotificationRule entity — flags domain (Pillar 12: Notifications stub).
 *
 * Per-org notification rule. Rows are written only when one of
 * `notify-email`/`notify-webhook`/`notify-slack` feature flags is enabled.
 *
 * C2: Composite (org_id, active, subject_kind) index — Pillar 12 dispatch
 *     loop filters per-org active rules by subject kind.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 * C8: @Entity({ repository }) wires NotificationRuleRepository.
 * C10: stub contains only the index-axis columns (id + org FK + subjectKind +
 *      active). Domain-specific fields deferred to Pillar 12 own-migration in
 *      its wave:
 *        - verb: string     — event verb filter (e.g. "created", "*")
 *        - channel: string  — dispatch channel: "email" | "webhook" | "slack"
 *        - target: string   — channel-specific target (email, URL, slack ch)
 *        - createdAt: Date  — audit timestamp
 *      Non-id @Property count: 2 (subjectKind + active). Total non-id: 3 (org FK + 2).
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

  @Property({ type: "boolean" })
  active: boolean = true;
}
