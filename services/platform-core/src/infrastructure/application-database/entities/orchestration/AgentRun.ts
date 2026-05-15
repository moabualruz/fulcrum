/**
 * AgentRun entity — orchestration domain (Pillar 3 stub).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  Check,
  JoinColumn,
} from "typeorm";
import { Org } from "../auth/Org.ts";
import { Task } from "../tasks/Task.ts";
import { SearchDocument } from "../search/SearchDocument.ts";
import type { AgentRunOrchestrationState, AttemptLifecycleState } from "./states.ts";

export { AGENT_RUN_ORCHESTRATION_STATES } from "./states.ts";
export type { AgentRunOrchestrationState, AttemptLifecycleState } from "./states.ts";

@Entity("agent_runs")
@Index("idx_agent_runs_org_started", ["org", "startedAt"])
@Index("agent_runs_agent_org", ["org", "agentName", "status", "createdAt"])
@Check("agent_runs_claimed_task_id_check", `"orchestration_state" <> 'claimed' or "task_id" is not null`)
export class AgentRun {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org)
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @ManyToOne(() => Task, { nullable: true })
  @JoinColumn({ name: "task_id" })
  task?: Task;

  @Column({ type: "timestamptz", name: "started_at", default: () => "now()" })
  startedAt!: Date;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ name: "status", nullable: true })
  status?: string;

  @Column({ name: "orchestration_state", nullable: true })
  orchestrationState?: AgentRunOrchestrationState;

  @Column({ type: "integer", name: "attempt_count", default: 0 })
  attemptCount: number = 0;

  @Column({ type: "timestamptz", name: "next_retry_at", nullable: true })
  nextRetryAt?: Date;

  @Column({ type: "text", name: "workspace_path", nullable: true })
  workspacePath?: string;

  @Column({ name: "last_error_kind", nullable: true })
  lastErrorKind?: string;

  @Column({ name: "sandbox_mode", default: "host" })
  sandboxMode: "host" | "docker" | "podman" = "host";

  @Column({ type: "integer", name: "iteration_count", default: 0 })
  iterationCount: number = 0;

  @Column({ type: "integer", name: "token_used", nullable: true })
  tokenUsed?: number;

  @Column({ name: "transcript_path", nullable: true })
  transcriptPath?: string;

  @Column({ name: "workspace_diff_path", nullable: true })
  workspaceDiffPath?: string;

  @Column({ type: "boolean", name: "transcript_truncated", default: false })
  transcriptTruncated: boolean = false;

  @Column({ name: "agent_name", nullable: true })
  agentName?: string;

  @Column({ name: "agent_version", nullable: true })
  agentVersion?: string;

  @Column({ name: "claimed_by", nullable: true })
  claimedBy?: string;

  @Column({ name: "attempt_lifecycle_state", nullable: true })
  attemptLifecycleState?: AttemptLifecycleState;

  @Column({ type: "timestamptz", name: "last_codex_timestamp", nullable: true })
  lastCodexTimestamp?: Date;

  @Column({ name: "thread_id", nullable: true })
  threadId?: string;

  @Column({ name: "turn_id", nullable: true })
  turnId?: string;

  @Column({ name: "session_id", nullable: true })
  sessionId?: string;

  @ManyToOne(() => SearchDocument, { nullable: true })
  @JoinColumn({ name: "search_doc_id" })
  searchDoc?: SearchDocument;
}
