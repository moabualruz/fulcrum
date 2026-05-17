import { Migration } from "@mikro-orm/migrations";

/**
 * Add Codex app-server session identity columns to agent_runs (SYM-20, SYM-21).
 *
 * thread_id: persisted for session resume via thread/resume
 * turn_id:   latest turn identifier from the app-server protocol
 * session_id: session identifier for structured log context
 */
export class Migration20260505023000_agent_runs_app_server_ids extends Migration {
  static isLossy = true; // down() drops columns

  override async up(): Promise<void> {
    this.addSql(`
      alter table "agent_runs"
        add column if not exists "thread_id" varchar(255) null,
        add column if not exists "turn_id" varchar(255) null,
        add column if not exists "session_id" varchar(255) null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "agent_runs"
        drop column if exists "thread_id",
        drop column if exists "turn_id",
        drop column if exists "session_id";
    `);
  }
}
