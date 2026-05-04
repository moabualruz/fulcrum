/**
 * NotificationMute entity — notifications domain (Pillar 12).
 *
 * Silences a user's notifications for a specific subject.
 * null mutedUntil = permanent mute.
 *
 * C2: org_id FK cascade.
 * C7: MikroORM v7 ES Stage-3 decorator pattern.
 */

import {
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
import { Org } from "../auth/Org.ts";

@Entity({ tableName: "notification_mutes" })
@Unique({
  name: "uq_notification_mutes_user_subject",
  properties: ["userId", "subjectKind", "subjectId"],
})
export class NotificationMute {
  [OptionalProps]?: "mutedUntil";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @Property({ type: "uuid", fieldName: "user_id" })
  userId!: string;

  @Property({ type: "string", fieldName: "subject_kind" })
  subjectKind!: string;

  @Property({ type: "uuid", fieldName: "subject_id" })
  subjectId!: string;

  /** null = muted permanently; Date = muted until this timestamp. */
  @Property({ type: "datetime", fieldName: "muted_until", nullable: true })
  mutedUntil: Date | null = null;
}
