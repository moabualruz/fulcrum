// packages/sync/src/schema.ts
import type { Database } from 'better-sqlite3'

export function runMigration010(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_states (
      sync_id          TEXT PRIMARY KEY,
      object_type      TEXT NOT NULL,
      object_id        TEXT NOT NULL,
      workspace_id     TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      sync_target      TEXT NOT NULL DEFAULT 'plane',
      external_id      TEXT,
      last_synced_at   TEXT,
      sync_status      TEXT NOT NULL DEFAULT 'never_synced'
        CHECK(sync_status IN ('never_synced','queued','syncing','synced',
                              'conflicted','failed','disabled')),
      last_sync_hash   TEXT,
      last_sync_error  TEXT,
      direction        TEXT NOT NULL DEFAULT 'local_to_remote'
        CHECK(direction IN ('local_to_remote','remote_to_local','bidirectional')),
      conflict_state   TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(object_id, sync_target)
    );

    CREATE TABLE IF NOT EXISTS sync_conflicts (
      conflict_id  TEXT PRIMARY KEY,
      sync_id      TEXT NOT NULL REFERENCES sync_states(sync_id),
      local_hash   TEXT,
      remote_hash  TEXT,
      detected_at  TEXT NOT NULL DEFAULT (datetime('now')),
      resolution   TEXT CHECK(resolution IN ('local_wins','remote_wins','manual')),
      resolved_at  TEXT,
      resolved_by  TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      queue_id     TEXT PRIMARY KEY,
      sync_id      TEXT NOT NULL REFERENCES sync_states(sync_id),
      operation    TEXT NOT NULL CHECK(operation IN ('upsert','delete')),
      priority     INTEGER NOT NULL DEFAULT 100,
      scheduled_at TEXT NOT NULL DEFAULT (datetime('now')),
      attempts     INTEGER NOT NULL DEFAULT 0,
      last_error   TEXT,
      local_data   TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sync_queue_scheduled ON sync_queue(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_priority  ON sync_queue(priority DESC);
  `)
}
