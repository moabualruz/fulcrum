import type Database from 'better-sqlite3'

// MIGRATION_036 — workspace-scope agent_definitions: add workspace_id column,
// migrate unique constraint from (role) to (workspace_id, role).
// Existing rows receive workspace_id = 'default' as a backward-compatible sentinel.
export function runM036(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '036_agent_definitions_workspace_scope'").get()
  if (!already) {
    // Check if workspace_id column already exists
    const cols = db.prepare("PRAGMA table_info(agent_definitions)").all() as { name: string }[]
    const hasWorkspaceId = cols.some(c => c.name === 'workspace_id')

    if (!hasWorkspaceId) {
      // SQLite can't drop UNIQUE constraints directly, so we rebuild the table.
      db.exec(`
        ALTER TABLE agent_definitions RENAME TO agent_definitions_old;

        CREATE TABLE agent_definitions (
          id            TEXT PRIMARY KEY,
          workspace_id  TEXT NOT NULL DEFAULT 'default',
          role          TEXT NOT NULL,
          display_name  TEXT NOT NULL,
          description   TEXT NOT NULL,
          version       TEXT NOT NULL DEFAULT '0.1.0',
          stability     TEXT NOT NULL DEFAULT 'experimental'
                        CHECK(stability IN ('stable','beta','experimental','deprecated')),
          system_prompt TEXT,
          model         TEXT,
          provider      TEXT NOT NULL DEFAULT 'anthropic',
          tools_allow   TEXT,
          tools_deny    TEXT,
          capabilities  TEXT NOT NULL DEFAULT '[]',
          output_schema TEXT,
          executor_uri  TEXT,
          a2a_card      TEXT,
          eval_suites   TEXT NOT NULL DEFAULT '[]',
          created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
          UNIQUE(workspace_id, role)
        );

        INSERT INTO agent_definitions
          (id, workspace_id, role, display_name, description, version, stability,
           system_prompt, model, provider, tools_allow, tools_deny,
           capabilities, output_schema, executor_uri, a2a_card, eval_suites,
           created_at, updated_at)
        SELECT
          id, 'default', role, display_name, description, version, stability,
          system_prompt, model, provider, tools_allow, tools_deny,
          capabilities, output_schema, executor_uri, a2a_card, eval_suites,
          created_at, updated_at
        FROM agent_definitions_old;

        DROP TABLE agent_definitions_old;

        CREATE INDEX IF NOT EXISTS idx_agent_definitions_ws_role ON agent_definitions(workspace_id, role);
        CREATE INDEX IF NOT EXISTS idx_agent_definitions_stability ON agent_definitions(stability);
      `)
    }
    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('036_agent_definitions_workspace_scope')").run()
  }
}
