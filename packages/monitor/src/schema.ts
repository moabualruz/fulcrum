// packages/monitor/src/schema.ts
import type Database from 'better-sqlite3'

export function runMigration009(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_daily (
      id                TEXT PRIMARY KEY,
      workspace_id      TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id        TEXT,
      date              TEXT NOT NULL,
      issues_created    INTEGER NOT NULL DEFAULT 0,
      issues_closed     INTEGER NOT NULL DEFAULT 0,
      tasks_created     INTEGER NOT NULL DEFAULT 0,
      tasks_completed   INTEGER NOT NULL DEFAULT 0,
      tasks_blocked     INTEGER NOT NULL DEFAULT 0,
      runs_started      INTEGER NOT NULL DEFAULT 0,
      runs_finished     INTEGER NOT NULL DEFAULT 0,
      runs_failed       INTEGER NOT NULL DEFAULT 0,
      memory_writes     INTEGER NOT NULL DEFAULT 0,
      memory_recalls    INTEGER NOT NULL DEFAULT 0,
      UNIQUE(workspace_id, project_id, date)
    );

    CREATE TABLE IF NOT EXISTS analytics_cycle (
      id               TEXT PRIMARY KEY,
      workspace_id     TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id       TEXT NOT NULL,
      cycle_id         TEXT NOT NULL,
      committed        INTEGER NOT NULL DEFAULT 0,
      completed        INTEGER NOT NULL DEFAULT 0,
      scope_added      INTEGER NOT NULL DEFAULT 0,
      rolled_over      INTEGER NOT NULL DEFAULT 0,
      avg_cycle_time_h REAL
    );

    CREATE TABLE IF NOT EXISTS analytics_project (
      id               TEXT PRIMARY KEY,
      workspace_id     TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id       TEXT NOT NULL,
      date             TEXT NOT NULL,
      wip_count        INTEGER NOT NULL DEFAULT 0,
      throughput       INTEGER NOT NULL DEFAULT 0,
      lead_time_h      REAL,
      blocked_h        REAL,
      UNIQUE(workspace_id, project_id, date)
    );

    CREATE TABLE IF NOT EXISTS analytics_agent (
      id                   TEXT PRIMARY KEY,
      workspace_id         TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      agent_id             TEXT NOT NULL,
      date                 TEXT NOT NULL,
      runs_started         INTEGER NOT NULL DEFAULT 0,
      runs_completed       INTEGER NOT NULL DEFAULT 0,
      runs_blocked         INTEGER NOT NULL DEFAULT 0,
      runs_failed          INTEGER NOT NULL DEFAULT 0,
      avg_duration_min     REAL,
      handoff_count        INTEGER NOT NULL DEFAULT 0,
      UNIQUE(workspace_id, agent_id, date)
    );

    CREATE TABLE IF NOT EXISTS analytics_team (
      id                    TEXT PRIMARY KEY,
      workspace_id          TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      instance_id           TEXT NOT NULL,
      date                  TEXT NOT NULL,
      tasks_completed       INTEGER NOT NULL DEFAULT 0,
      avg_slot_duration_min REAL,
      concurrency_peak      INTEGER NOT NULL DEFAULT 0,
      UNIQUE(workspace_id, instance_id, date)
    );
  `)
}
