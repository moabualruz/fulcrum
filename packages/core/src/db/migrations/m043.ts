import type Database from 'better-sqlite3'

// MIGRATION_043 — agent_definitions: add workspace_id + workspace-scoped UNIQUE.
//
// GAP-AGENTDEF-10: `role TEXT NOT NULL UNIQUE` is a global constraint.
// Application logic is workspace-scoped; a second workspace seeding the same
// role fails at the DB level.  Fix: `UNIQUE(workspace_id, role)`.
//
// SQLite doesn't support DROP CONSTRAINT, so we recreate the table with the
// correct schema and migrate existing rows (giving them workspace_id = 'global'
// as a backwards-compatible sentinel for pre-workspace data).
export function runM043(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '043_agent_definitions_workspace_unique'").get()
  if (already) return

  // Check if workspace_id column already exists (safe re-run guard).
  const cols = db.prepare("PRAGMA table_info(agent_definitions)").all() as Array<{ name: string }>
  const hasWorkspaceId = cols.some(c => c.name === 'workspace_id')

  // When workspace_id already exists (e.g. added by m036 with sentinel 'default'),
  // migrate those rows to 'global'. m036 used 'default'; m043+ standardises on 'global'.
  if (hasWorkspaceId) {
    db.prepare("UPDATE agent_definitions SET workspace_id = 'global' WHERE workspace_id = 'default'").run()
  }

  if (!hasWorkspaceId) {
    db.exec(`
      -- Step 1: Create new table with correct schema
      CREATE TABLE IF NOT EXISTS agent_definitions_new (
        id            TEXT PRIMARY KEY,
        workspace_id  TEXT NOT NULL DEFAULT 'global',
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

      -- Step 2: Migrate existing rows into the new table
      INSERT OR IGNORE INTO agent_definitions_new
        SELECT id, 'global', role, display_name, description, version, stability,
               system_prompt, model, provider, tools_allow, tools_deny,
               capabilities, output_schema, executor_uri, a2a_card, eval_suites,
               created_at, updated_at
        FROM agent_definitions;

      -- Step 3: Swap tables
      DROP TABLE agent_definitions;
      ALTER TABLE agent_definitions_new RENAME TO agent_definitions;

      -- Step 4: Recreate indexes
      CREATE INDEX IF NOT EXISTS idx_agent_definitions_workspace_role
        ON agent_definitions(workspace_id, role);
      CREATE INDEX IF NOT EXISTS idx_agent_definitions_stability
        ON agent_definitions(stability);
    `)
  }

  db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('043_agent_definitions_workspace_unique')").run()
}
