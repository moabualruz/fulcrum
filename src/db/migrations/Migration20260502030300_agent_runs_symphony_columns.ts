/**
 * Migration: AgentRun orchestration state columns + partial indexes.
 *
 * Adds the Symphony orchestration state surface required by Pillar 3 without
 * taking ownership of the full Pillar 4 agent-run payload.
 *
 * C6: addSql(...) strings are the sanctioned escape hatch inside Migration class bodies.
 * C9: Migration class file at src/db/migrations/Migration<timestamp>.ts.
 *
 * Closes (issue): .scratch/agent-os-vision/03-symphony-orchestration/issues/03-schema-agent-runs-symphony-columns.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502030300_agent_runs_symphony_columns extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(`alter table "agent_runs" add column "task_id" uuid null`);
    this.addSql(
      `alter table "agent_runs" add column "orchestration_state" varchar(255) null`,
    );
    this.addSql(
      `alter table "agent_runs" add column "attempt_count" int not null default 0`,
    );
    this.addSql(
      `alter table "agent_runs" add column "next_retry_at" timestamptz null`,
    );
    this.addSql(
      `alter table "agent_runs" add column "workspace_path" text null`,
    );
    this.addSql(
      `alter table "agent_runs" add column "last_error_kind" varchar(255) null`,
    );
    this.addSql(
      `alter table "agent_runs" add constraint "agent_runs_task_org_foreign" foreign key ("task_id", "org_id") references "tasks" ("id", "org_id") on delete set null ("task_id")`,
    );
    this.addSql(
      `alter table "agent_runs" add constraint "agent_runs_orchestration_state_check" check ("orchestration_state" in ('unclaimed', 'claimed', 'running', 'retry_queued', 'released', 'succeeded', 'failed', 'timed_out', 'stalled', 'cancelled'))`,
    );
    this.addSql(
      `alter table "agent_runs" add constraint "agent_runs_claimed_task_id_check" check ("orchestration_state" <> 'claimed' or "task_id" is not null)`,
    );
    this.addSql(
      `create unique index "agent_runs_claimed_unique" on "agent_runs" ("task_id") where "orchestration_state" = 'claimed'`,
    );
    this.addSql(
      `create index "agent_runs_dispatch_poll" on "agent_runs" ("org_id", "orchestration_state", "next_retry_at") where "orchestration_state" in ('unclaimed', 'retry_queued')`,
    );
    this.addSql(
      `create index "agent_runs_stall_scan" on "agent_runs" ("org_id", "orchestration_state", "started_at") where "orchestration_state" = 'running'`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "agent_runs_stall_scan"`);
    this.addSql(`drop index if exists "agent_runs_dispatch_poll"`);
    this.addSql(`drop index if exists "agent_runs_claimed_unique"`);
    this.addSql(
      `alter table "agent_runs" drop constraint if exists "agent_runs_orchestration_state_check"`,
    );
    this.addSql(
      `alter table "agent_runs" drop constraint if exists "agent_runs_claimed_task_id_check"`,
    );
    this.addSql(
      `alter table "agent_runs" drop constraint if exists "agent_runs_task_org_foreign"`,
    );
    this.addSql(`alter table "agent_runs" drop column if exists "last_error_kind"`);
    this.addSql(`alter table "agent_runs" drop column if exists "workspace_path"`);
    this.addSql(`alter table "agent_runs" drop column if exists "next_retry_at"`);
    this.addSql(`alter table "agent_runs" drop column if exists "attempt_count"`);
    this.addSql(
      `alter table "agent_runs" drop column if exists "orchestration_state"`,
    );
    this.addSql(`alter table "agent_runs" drop column if exists "task_id"`);
  }
}
