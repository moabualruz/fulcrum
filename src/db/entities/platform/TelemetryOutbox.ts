/**
 * TelemetryOutbox entity — platform domain (Pillar 17 cross-cutting).
 *
 * Stores batches queued for remote forwarding behind `telemetry-remote` flag.
 * One row per batch; drained (deleted) on successful 200 POST.
 *
 * C1: written only when telemetry-remote flag ON; flag OFF → table stays empty.
 * C2: no org_id FK — outbox is a process-level queue; org context lives inside
 *     batchJson. Keeps the table simple and avoids FK cascade issues.
 * C7: MikroORM v7 ES Stage-3 decorator pattern.
 *
 * status lifecycle: queued → retrying | sent | dead
 * Closes (issue): .scratch/agent-os-vision/17-cross-cutting-platform/issues/16-gated-telemetry-remote.md
 */

import {
  Entity,
  PrimaryKey,
  Property,
  Index,
} from "@mikro-orm/decorators/es";

export type TelemetryOutboxStatus = "queued" | "retrying" | "sent" | "dead";

@Entity({ tableName: "telemetry_outbox" })
@Index({ name: "idx_telemetry_outbox_status", properties: ["status"] })
export class TelemetryOutbox {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  /** Serialised TelemetryBatchPayload JSON. */
  @Property({ type: "text", fieldName: "batch_json" })
  batchJson!: string;

  /** Number of POST attempts made. */
  @Property({ type: "integer", default: 0 })
  attempts: number = 0;

  /** Timestamp of last POST attempt (null if never attempted). */
  @Property({
    type: "datetime",
    fieldName: "last_attempt_at",
    nullable: true,
    default: null,
  })
  lastAttemptAt: Date | null = null;

  /** Current processing status. */
  @Property({ type: "string", default: "queued" })
  status: TelemetryOutboxStatus = "queued";

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
