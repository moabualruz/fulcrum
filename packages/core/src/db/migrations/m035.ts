import type Database from 'better-sqlite3'

// MIGRATION_035 — add 13 missing composite indexes for query performance.
//  - projects(workspace_id): used by listProjects workspace filter
//  - tasks(workspace_id, status): used by listTasks status + workspace filter
//  - tasks(workspace_id, status_category): used by category-grouped task queries
//  - tasks(assigned_run_id): used by run-to-task lookups
//  - agent_runs(workspace_id, status): used by listAgentRuns workspace + status filter
//  - memories(workspace_id, project_id, content_hash): used by dedup checks
//  - events(workspace_id, ts DESC): used by SSE poller and CoS queries
//  - events(workspace_id, evt_type): used by typed event queries
//  - code_chunks(workspace_id, project_id): used by chunk lookups scoped to workspace+project
//  - handoffs(workspace_id, status): used by listHandoffs workspace + status filter
//  - issues(assignee_agent_id): used by agent-scoped issue queries
// Note: idx_memories_task already exists (added in migration 020b).
export function runM035(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '035_composite_indexes'").get()
  if (!already) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_projects_workspace
        ON projects(workspace_id);

      CREATE INDEX IF NOT EXISTS idx_tasks_ws_status
        ON tasks(workspace_id, status);

      CREATE INDEX IF NOT EXISTS idx_tasks_ws_category
        ON tasks(workspace_id, status_category);

      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_run
        ON tasks(assigned_run_id);

      CREATE INDEX IF NOT EXISTS idx_runs_ws_status
        ON agent_runs(workspace_id, status);

      CREATE INDEX IF NOT EXISTS idx_memories_ws_project_hash
        ON memories(workspace_id, project_id, content_hash);

      CREATE INDEX IF NOT EXISTS idx_events_ws_ts
        ON events(workspace_id, ts DESC);

      CREATE INDEX IF NOT EXISTS idx_events_ws_type
        ON events(workspace_id, evt_type);

      CREATE INDEX IF NOT EXISTS idx_chunks_ws_project
        ON code_chunks(workspace_id, project_id);

      CREATE INDEX IF NOT EXISTS idx_handoffs_ws_status
        ON handoffs(workspace_id, status);

      CREATE INDEX IF NOT EXISTS idx_issues_assignee
        ON issues(assignee_agent_id);
    `)
    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('035_composite_indexes')").run()
  }
}
