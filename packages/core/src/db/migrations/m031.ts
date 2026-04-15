import type Database from 'better-sqlite3'

// MIGRATION_031 — agent_definitions: canonical definition per AgentRole with
// model, tools_allow/deny, executor_uri, A2A card, and typed output contracts.
// Supersedes the `agent_profiles` table for canonical role definitions.
export function runM031(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '031_agent_definitions'").get()
  if (!already) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_definitions (
        id            TEXT PRIMARY KEY,
        role          TEXT NOT NULL UNIQUE,
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
        updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_agent_definitions_role ON agent_definitions(role);
      CREATE INDEX IF NOT EXISTS idx_agent_definitions_stability ON agent_definitions(stability);
    `)
    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('031_agent_definitions')").run()
  }
}
