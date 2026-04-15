import type Database from 'better-sqlite3'

// MIGRATION_034 — missing indices for janitor decay, sync lookups, and workflow project filter.
//  - memories(importance, last_accessed_at): used by decayMemories() WHERE importance < ? AND last_accessed_at <= ?
//  - sync_states(workspace_id): used by all sync lookups
//  - sync_states(workspace_id, object_type, object_id): composite lookup used by getSyncState
//  - workflow_runs(workspace_id, project_id): used by listWorkflowRuns when filtering by project
export function runM034(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '034_missing_indices'").get()
  if (!already) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_memories_importance_access
        ON memories(importance, last_accessed_at);

      CREATE INDEX IF NOT EXISTS idx_sync_states_workspace
        ON sync_states(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_sync_states_object
        ON sync_states(workspace_id, object_type, object_id);

      CREATE INDEX IF NOT EXISTS idx_wf_runs_project
        ON workflow_runs(workspace_id, project_id)
        WHERE project_id IS NOT NULL;
    `)
    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('034_missing_indices')").run()
  }
}
