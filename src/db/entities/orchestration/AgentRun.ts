/**
 * AgentRun entity — orchestration domain (Pillar 3 stub).
 *
 * Stub: only the columns required for the FK + composite index land here.
 * Pillar 3 (Orchestration / agent execution) will ADD additional columns
 * (agent, status, model, tokens, finishedAt, error, …) via its own migration.
 *
 * C2: Composite (org_id, started_at desc) index from day 1 — recent runs.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 * C8: @Entity({ repository }) wires AgentRunRepository.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
  Check,
} from "@mikro-orm/decorators/es";
import { Org } from "../auth/Org.ts";
import { Task } from "../tasks/Task.ts";
import { AgentRunRepository } from "../../repositories/orchestration/AgentRunRepository.ts";

export const AGENT_RUN_ORCHESTRATION_STATES = [
  "unclaimed",
  "claimed",
  "running",
  "retry_queued",
  "released",
  "succeeded",
  "failed",
  "timed_out",
  "stalled",
  "cancelled",
] as const;

export type AgentRunOrchestrationState =
  (typeof AGENT_RUN_ORCHESTRATION_STATES)[number];

@Entity({ tableName: "agent_runs", repository: () => AgentRunRepository })
@Index({
  name: "idx_agent_runs_org_started",
  properties: ["org", "startedAt"],
})
export class AgentRun {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  @ManyToOne(() => Task, { fieldName: "task_id", nullable: true })
  task?: Task;

  @Property({ type: "datetime", fieldName: "started_at", defaultRaw: "now()" })
  startedAt!: Date;

  @Property({
    type: "string",
    fieldName: "orchestration_state",
    nullable: true,
    check:
      "orchestration_state in ('unclaimed','claimed','running','retry_queued','released','succeeded','failed','timed_out','stalled','cancelled')",
  })
  @Check({
    name: "agent_runs_claimed_task_id_check",
    expression: `"orchestration_state" <> 'claimed' or "task_id" is not null`,
  })
  orchestrationState?: AgentRunOrchestrationState;

  @Property({ type: "integer", fieldName: "attempt_count", default: 0 })
  attemptCount: number = 0;

  @Property({ type: "datetime", fieldName: "next_retry_at", nullable: true })
  nextRetryAt?: Date;

  @Property({ type: "text", fieldName: "workspace_path", nullable: true })
  workspacePath?: string;

  @Property({ type: "string", fieldName: "last_error_kind", nullable: true })
  lastErrorKind?: string;
}
