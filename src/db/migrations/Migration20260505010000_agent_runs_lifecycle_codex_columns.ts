/**
 * Migration: Add run-attempt lifecycle state and Codex timestamp columns.
 *
 * - attempt_lifecycle_state: tracks internal attempt progress (SYM-09).
 *   Distinct from orchestration_state; values from ATTEMPT_LIFECYCLE_STATES.
 * - last_codex_timestamp: last Codex app-server event timestamp (SYM-19).
 *   Stall detection prefers this over started_at when set.
 * - Drops and recreates agent_runs_stall_scan index to include
 *   last_codex_timestamp so the stall scanner can use it in the WHERE/ORDER.
 *
 * C6: addSql() is the sanctioned escape hatch inside Migration class bodies.
 * C9: Migration class file at src/db/migrations/Migration<timestamp>.ts.
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260505010000_agent_runs_lifecycle_codex_columns extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    // Add run-attempt lifecycle state column
    this.addSql(
      `alter table "agent_runs" add column "attempt_lifecycle_state" varchar(255) null`,
    );
    this.addSql(
      `alter table "agent_runs" add constraint "agent_runs_attempt_lifecycle_state_check" check (` +
        `"attempt_lifecycle_state" is null or "attempt_lifecycle_state" in (` +
        `'preparing_workspace','building_prompt','launching_agent_process',` +
        `'initializing_session','streaming_turn','finishing',` +
        `'succeeded','failed','timed_out','stalled','cancelled'))`,
    );

    // Add last Codex event timestamp column
    this.addSql(
      `alter table "agent_runs" add column "last_codex_timestamp" timestamptz null`,
    );

    // Drop old stall scan index (covers only org_id, orchestration_state, started_at)
    this.addSql(`drop index if exists "agent_runs_stall_scan"`);

    // Recreate with last_codex_timestamp support:
    // The scanner uses COALESCE(last_codex_timestamp, started_at) for cutoff;
    // including both columns in the index lets the planner use it for both paths.
    this.addSql(
      `create index "agent_runs_stall_scan" on "agent_runs" ` +
        `("org_id", "orchestration_state", "last_codex_timestamp", "started_at") ` +
        `where "orchestration_state" = 'running'`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "agent_runs_stall_scan"`);
    // Restore original stall scan index
    this.addSql(
      `create index "agent_runs_stall_scan" on "agent_runs" ` +
        `("org_id", "orchestration_state", "started_at") ` +
        `where "orchestration_state" = 'running'`,
    );
    this.addSql(
      `alter table "agent_runs" drop constraint if exists "agent_runs_attempt_lifecycle_state_check"`,
    );
    this.addSql(`alter table "agent_runs" drop column if exists "last_codex_timestamp"`);
    this.addSql(`alter table "agent_runs" drop column if exists "attempt_lifecycle_state"`);
  }
}
