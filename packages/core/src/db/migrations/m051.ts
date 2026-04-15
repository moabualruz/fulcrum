import type Database from 'better-sqlite3'

// MIGRATION_051 — hook_events: passive trace harvesting (Feature 1).
//
// Every Claude tool call writes one row to hook_events regardless of
// whether a run_id is present. This makes every Claude session visible
// in the monitor even when start_agent_run was never called.
//
// Design notes:
//  - run_id is nullable (absent in normal Claude sessions)
//  - workspace_id = '' is valid (empty-string fallback when CWD is unknown)
//  - Index on (workspace_id, session_id, ts) supports the monitor's
//    per-workspace aggregation and per-session event streams
//  - TTL cleanup: janitor deletes rows older than 30 days
export function runM051(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '051_hook_events'").get()
  if (already) return

  const now = Math.floor(Date.now() / 1000)

  db.exec(`
    CREATE TABLE IF NOT EXISTS hook_events (
      hook_event_id TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL DEFAULT '',
      session_id    TEXT NOT NULL,
      tool_name     TEXT NOT NULL,
      agent_role    TEXT NOT NULL DEFAULT '',
      run_id        TEXT,
      ts            TEXT NOT NULL,
      cli_name      TEXT NOT NULL
    )
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hook_events_workspace_session_ts
      ON hook_events (workspace_id, session_id, ts)
  `)

  db.prepare("INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES ('051_hook_events', ?)")
    .run(now)
}
