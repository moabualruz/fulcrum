/**
 * Migration: add transcript_truncated column to agent_runs (P4#11).
 *
 * Boolean flag indicates whether transcript JSONL was capped by
 * FULCRUM_MAX_TRANSCRIPT_SIZE and a truncation sentinel appended.
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260503130000_agent_runs_transcript_truncated extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "agent_runs" add column "transcript_truncated" boolean not null default false`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "agent_runs" drop column if exists "transcript_truncated"`,
    );
  }
}
