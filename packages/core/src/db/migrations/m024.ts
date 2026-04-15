import type Database from 'better-sqlite3'

// MIGRATION_024 — projects.description column
// Python parity: pi_agent_os/models/project.py has `description: str = ""`.
// The TS type already omitted this; add it as a nullable column so existing
// rows are unaffected. Callers that want a default can pass '' explicitly.
//
// Returns false if the runner should stop (i.e. this migration was already done),
// true if execution should continue. This matches the original `if (already024) return`
// early-exit behavior in the monolithic runMigrations function.
export function runM024(db: Database.Database): boolean {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '024_project_description'").get()
  if (already) return false

  const projectCols = db.prepare(`PRAGMA table_info(projects)`).all() as { name: string }[]
  const hasDescription = projectCols.some(c => c.name === 'description')
  if (!hasDescription) {
    db.exec(`ALTER TABLE projects ADD COLUMN description TEXT`)
  }
  db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('024_project_description')").run()

  return true
}
