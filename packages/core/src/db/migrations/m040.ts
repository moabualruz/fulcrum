import type Database from 'better-sqlite3'

// MIGRATION_040 — drop shadow graph tables (Task 5.2)
// MIGRATION_011 created graph_entities and graph_edges as SQLite shadow tables
// for the Kuzu graph. No application code in @fulcrum/core reads or writes
// these tables — the actual graph operations are handled by @fulcrum/memory
// using Kuzu. Dropping them reduces DB size and avoids confusion.
// FK checks are disabled temporarily because graph_episodes references
// graph_entities — disabling FKs lets us drop graph_entities without also
// dropping graph_episodes (FK enforcement is a read-time check in SQLite,
// not a structural constraint that prevents DDL).
export function runM040(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '040_drop_shadow_graph_tables'").get()
  if (!already) {
    const fkPrev040 = db.pragma('foreign_keys', { simple: true }) as number
    db.pragma('foreign_keys = OFF')
    try {
      db.exec(`
        DROP TABLE IF EXISTS graph_edges;
        DROP TABLE IF EXISTS graph_entities;
      `)
    } finally {
      db.pragma(fkPrev040 ? 'foreign_keys = ON' : 'foreign_keys = OFF')
    }
    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('040_drop_shadow_graph_tables')").run()
  }
}
