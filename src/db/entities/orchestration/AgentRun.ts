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
import { OptionalProps } from "@mikro-orm/core";
import { Org } from "../auth/Org.ts";
import { Task } from "../tasks/Task.ts";
import { SearchDocument } from "../search/SearchDocument.ts";
import { AgentRunRepository } from "../../repositories/orchestration/AgentRunRepository.ts";
import type { AgentRunOrchestrationState } from "./states.ts";

export { AGENT_RUN_ORCHESTRATION_STATES } from "./states.ts";
export type { AgentRunOrchestrationState } from "./states.ts";

@Entity({ tableName: "agent_runs", repository: () => AgentRunRepository })
@Index({
  name: "idx_agent_runs_org_started",
  properties: ["org", "startedAt"],
})
@Index({
  name: "agent_runs_agent_org",
  properties: ["org", "agentName", "status", "createdAt"],
})
export class AgentRun {
  [OptionalProps]?:
    | "task"
    | "startedAt"
    | "createdAt"
    | "status"
    | "orchestrationState"
    | "attemptCount"
    | "nextRetryAt"
    | "workspacePath"
    | "lastErrorKind"
    | "sandboxMode"
    | "iterationCount"
    | "tokenUsed"
    | "transcriptPath"
    | "workspaceDiffPath"
    | "agentName"
    | "agentVersion"
    | "transcriptTruncated"
    | "claimedBy"
    | "searchDoc";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  @ManyToOne(() => Task, { fieldName: "task_id", nullable: true })
  task?: Task;

  @Property({ type: "datetime", fieldName: "started_at", defaultRaw: "now()" })
  startedAt!: Date;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "string", fieldName: "status", nullable: true })
  status?: string;

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

  @Property({
    type: "string",
    fieldName: "sandbox_mode",
    default: "host",
    check: "sandbox_mode in ('host','docker','podman')",
  })
  sandboxMode: "host" | "docker" | "podman" = "host";

  @Property({ type: "integer", fieldName: "iteration_count", default: 0 })
  iterationCount: number = 0;

  @Property({ type: "integer", fieldName: "token_used", nullable: true })
  tokenUsed?: number;

  @Property({ type: "string", fieldName: "transcript_path", nullable: true })
  transcriptPath?: string;

  @Property({ type: "string", fieldName: "workspace_diff_path", nullable: true })
  workspaceDiffPath?: string;

  @Property({ type: "boolean", fieldName: "transcript_truncated", default: false })
  transcriptTruncated: boolean = false;

  @Property({ type: "string", fieldName: "agent_name", nullable: true })
  agentName?: string;

  @Property({ type: "string", fieldName: "agent_version", nullable: true })
  agentVersion?: string;

  @Property({ type: "string", fieldName: "claimed_by", nullable: true })
  claimedBy?: string;

  @ManyToOne(() => SearchDocument, { fieldName: "search_doc_id", nullable: true })
  searchDoc?: SearchDocument;
}
