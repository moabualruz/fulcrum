/**
 * Job entity — jobs domain (Pillar 12 stub).
 *
 * Stub: only the columns required for the FK + composite index land here.
 * Pillar 12 (Jobs / Notifications) will ADD additional columns (kind,
 * payload, attempts, lastError, completedAt, …) via its own migration class.
 *
 * C2: Composite (org_id, status, scheduled_for) index from day 1 — queue
 *     dispatch query: pending jobs ordered by scheduled time.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 * C8: @Entity({ repository }) wires JobRepository.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
} from "@mikro-orm/decorators/es";
import { Org } from "../auth/Org.ts";
import { JobRepository } from "../../repositories/jobs/JobRepository.ts";

@Entity({ tableName: "jobs", repository: () => JobRepository })
@Index({
  name: "idx_jobs_org_status_scheduled",
  properties: ["org", "status", "scheduledFor"],
})
export class Job {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  /** Lifecycle: "pending" | "running" | "succeeded" | "failed" (set by Pillar 12). */
  @Property({ type: "string" })
  status: string = "pending";

  /** When the job is eligible to run. */
  @Property({
    type: "datetime",
    fieldName: "scheduled_for",
    defaultRaw: "now()",
  })
  scheduledFor!: Date;
}
