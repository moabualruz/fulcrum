/**
 * Migration: AgentRun claimed_by column.
 *
 * Adds claimed_by (orchestrator instance ID) for observability and debugging.
 * The claim lock itself is enforced by agent_runs_claimed_unique partial index
 * (from Migration20260502030300_agent_runs_symphony_columns).
 *
 * C6: addSql(...) strings are the sanctioned escape hatch inside Migration class bodies.
 * C9: Migration class file at services/platform-core/src/infrastructure/application-database/migrations/Migration<timestamp>.ts.
 *
 * Closes (issue): .scratch/agent-os-vision/03-symphony-orchestration/issues/06-state-machine-claim-lock.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502090100_agent_runs_claimed_by extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(
      `alter table "agent_runs" add column "claimed_by" varchar(255) null`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "agent_runs" drop column if exists "claimed_by"`);
  }
}
