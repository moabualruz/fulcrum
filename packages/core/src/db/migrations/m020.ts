import type Database from 'better-sqlite3'

// MIGRATION_020 — Round 1 gap fixes (G-2, G-4 schema, G-12 schema)
//  - projects: add `type`, `git_url`; enforce CHECK constraints on
//    type/status/write_mode via table rebuild (earlier migrations added
//    status/write_mode/parent_project_id without constraints).
//  - memories: ensure `task_id` column + `idx_memories_task` index.
//  - trace_events: new telemetry span table.
export function runM020(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '020_round_1_gap_fixes'").get()
  if (!already) {
    // Rebuild projects table to add `type`, `git_url` and CHECK constraints on
    // `type`, `status`, `write_mode`. We preserve all existing columns from
    // MIGRATION_002 (project_type, root_path, default_branch, parent_project_id,
    // write_mode, status) and copy their values through.
    // FKs from other tables reference `projects` by name; the DROP + RENAME
    // pattern preserves those text-level references. We disable FK checks
    // around the rebuild to avoid spurious violations during the swap.
    const fkPrev = db.pragma('foreign_keys', { simple: true }) as number
    db.pragma('foreign_keys = OFF')
    try {
      db.transaction(() => {
        db.exec(`
          CREATE TABLE projects_new (
            project_id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            project_type TEXT,
            root_path TEXT,
            default_branch TEXT,
            parent_project_id TEXT REFERENCES projects(project_id) ON DELETE SET NULL,
            write_mode TEXT NOT NULL DEFAULT 'worktree'
              CHECK(write_mode IN ('worktree','in_place','sequential')),
            status TEXT NOT NULL DEFAULT 'active'
              CHECK(status IN ('active','archived','paused')),
            type TEXT NOT NULL DEFAULT 'git'
              CHECK(type IN ('git','non_git','submodule','logical')),
            git_url TEXT
          );
          INSERT INTO projects_new (
            project_id, workspace_id, name, created_at,
            project_type, root_path, default_branch, parent_project_id,
            write_mode, status, type, git_url
          )
          SELECT
            project_id, workspace_id, name, created_at,
            project_type, root_path, default_branch, parent_project_id,
            CASE WHEN write_mode IN ('worktree','in_place','sequential')
                 THEN write_mode ELSE 'worktree' END,
            CASE WHEN status IN ('active','archived','paused')
                 THEN status ELSE 'active' END,
            'git', NULL
          FROM projects;
          DROP TABLE projects;
          ALTER TABLE projects_new RENAME TO projects;
        `)
      })()
    } finally {
      db.pragma(fkPrev ? 'foreign_keys = ON' : 'foreign_keys = OFF')
    }

    // memories.task_id should already exist from MIGRATION_002/005, but we
    // guard with try/catch to remain safe against hand-rolled databases.
    try {
      db.exec(`ALTER TABLE memories ADD COLUMN task_id TEXT`)
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? ''
      if (!msg.includes('duplicate column name') && !msg.includes('already exists')) {
        throw err
      }
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_task ON memories(task_id)`)

    // trace_events — telemetry span storage (G-12 schema).
    db.exec(`
      CREATE TABLE IF NOT EXISTS trace_events (
        span_id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        parent_span_id TEXT,
        name TEXT NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
        run_id TEXT,
        status TEXT NOT NULL DEFAULT 'started'
          CHECK(status IN ('started','ok','error')),
        started_at TEXT NOT NULL,
        ended_at TEXT,
        payload TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_trace_events_trace ON trace_events(trace_id);
      CREATE INDEX IF NOT EXISTS idx_trace_events_workspace ON trace_events(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_trace_events_run ON trace_events(run_id);
    `)

    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('020_round_1_gap_fixes')").run()
  }
}
