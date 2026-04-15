import type Database from 'better-sqlite3'

// MIGRATION_045 — agent_definitions: add allow_dispatch + icon_url columns.
//
// GAP-AGENTDEF-7: AgentProfile had allow_dispatch; AgentDefinition never got it.
//   allow_dispatch controls whether external routers may dispatch this role.
//   Defaults to 1 (true) for all built-in roles — the existing behaviour is
//   "dispatch anything"; this migration preserves that while making it explicit.
//
// GAP-AGENTDEF-9: Add icon_url for A2A AgentCard rendering.
export function runM045(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '045_agent_definitions_dispatch_icon'").get()
  if (already) return

  const cols = db.prepare("PRAGMA table_info(agent_definitions)").all() as Array<{ name: string }>
  const names = new Set(cols.map(c => c.name))

  if (!names.has('allow_dispatch')) {
    db.exec(`ALTER TABLE agent_definitions ADD COLUMN allow_dispatch INTEGER NOT NULL DEFAULT 1`)
  }
  if (!names.has('icon_url')) {
    db.exec(`ALTER TABLE agent_definitions ADD COLUMN icon_url TEXT`)
  }

  db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('045_agent_definitions_dispatch_icon')").run()
}
