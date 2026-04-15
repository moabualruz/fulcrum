import type Database from 'better-sqlite3'

// MIGRATION_030 — agent_profiles table (L-3)
// Lets chief_of_staff and other authorized callers create DB-backed
// agent profiles at runtime. These extend (don't replace) the 24 hardcoded
// AgentRole values. When listAgentProfiles() is called, core merges the
// hardcoded list with the DB list for the given workspace.
export function runM030(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '030_agent_profiles'").get()
  if (!already) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_profiles (
        profile_id       TEXT PRIMARY KEY,
        workspace_id     TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
        name             TEXT NOT NULL,
        base_role        TEXT NOT NULL DEFAULT 'custom'
          CHECK(base_role IN (
            'chief_of_staff','context_gatherer','prd_planner','implementation_planner',
            'issue_decomposer','software_engineer','research_worker','refactor_worker',
            'browser_worker','data_engineer','ml_engineer','devops_engineer',
            'architecture_reviewer','code_reviewer','qa_engineer','security_reviewer',
            'integration_worker','documentation_writer','memory_curator','tech_lead',
            'product_manager','analyst','orchestrator','custom'
          )),
        description      TEXT NOT NULL,
        system_prompt    TEXT,
        capabilities     TEXT NOT NULL DEFAULT '{}',
        created_by       TEXT,
        created_at       TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_agent_profiles_workspace ON agent_profiles(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_agent_profiles_base_role ON agent_profiles(base_role);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_profiles_ws_name ON agent_profiles(workspace_id, name);
    `)
    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('030_agent_profiles')").run()
  }
}
