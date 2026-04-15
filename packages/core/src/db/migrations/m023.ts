import type Database from 'better-sqlite3'

// MIGRATION_023 — memories.scope CHECK includes 'task' (H-6)
// Round 1 added 'task' to the TypeScript MemoryScope union but MIGRATION_005
// intended a CHECK(scope IN ('global','project','file')). In practice
// MIGRATION_002 added the `scope` column FIRST (without any CHECK) and
// MIGRATION_005's re-ALTER silently failed with "duplicate column name",
// so no CHECK is enforced on existing DBs at all. Rebuild the memories
// table with a proper CHECK(scope IN ('global','project','file','task')).
//
// Returns false if the runner should stop (i.e. this migration was already done),
// true if execution should continue. This matches the original `if (already023) return`
// early-exit behavior in the monolithic runMigrations function.
export function runM023(db: Database.Database): boolean {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '023_memory_scope_task'").get()
  if (already) return false

  const memoryCols = db.prepare(`PRAGMA table_info(memories)`).all() as {
    name: string
    type: string
    notnull: number
    dflt_value: unknown
    pk: number
  }[]
  if (memoryCols.length === 0) {
    // memories table doesn't exist yet (pre-MIGRATION_001 fresh DB)
    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('023_memory_scope_task')").run()
    return false
  }

  // Collect current indexes so we can recreate them after the rename.
  const memoryIdxRows = db.prepare(`PRAGMA index_list(memories)`).all() as { name: string; origin: string }[]
  const preservedIndexes: string[] = []
  for (const idx of memoryIdxRows) {
    if (idx.origin !== 'c') continue // skip auto-indexes
    const sqlRow = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND name=?`)
      .get(idx.name) as { sql: string | null } | undefined
    if (sqlRow?.sql) preservedIndexes.push(sqlRow.sql)
  }

  // FTS5 triggers on memories reference old rowid; we need to drop and
  // recreate them around the rebuild so INSERT INTO memories_new ... SELECT
  // doesn't fire triggers that touch an FTS shadow table mid-rename.
  const ftsTriggerRows = db
    .prepare(`SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name='memories'`)
    .all() as { name: string; sql: string | null }[]

  const fkPrev023 = db.pragma('foreign_keys', { simple: true }) as number
  db.pragma('foreign_keys = OFF')
  try {
    db.transaction(() => {
      const createSqlRow = db
        .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='memories'`)
        .get() as { sql: string | null } | undefined
      if (!createSqlRow?.sql) return
      const originalSql = createSqlRow.sql

      // Drop FTS triggers on memories first — they reference memories by name
      // and would collide with the rename otherwise.
      for (const trig of ftsTriggerRows) {
        db.exec(`DROP TRIGGER IF EXISTS ${trig.name}`)
      }

      // Build the rebuilt CREATE TABLE statement. Prefer a regex replacement
      // of any existing CHECK(scope IN (...)) clause. If none exists (the
      // typical case on DBs where MIGRATION_002 created `scope` without a
      // CHECK and MIGRATION_005's re-ALTER was swallowed), inject one into
      // the scope column definition.
      const withRenamed = originalSql.replace(/CREATE TABLE\s+memories/i, 'CREATE TABLE memories_new')
      const replaced = withRenamed.replace(
        /CHECK\s*\(\s*scope\s+IN\s*\([^)]*\)\s*\)/i,
        `CHECK(scope IN ('global','project','file','task'))`
      )
      let rebuiltSql: string
      if (replaced !== withRenamed) {
        rebuiltSql = replaced
      } else {
        // No existing CHECK — inject one into the scope column definition.
        // The scope column in the real schema looks like:
        //   scope TEXT NOT NULL DEFAULT 'project'
        // Match that (up to the next comma or closing paren) and append a CHECK.
        const injected = withRenamed.replace(
          /(\bscope\s+TEXT\b[^,)]*)/i,
          `$1 CHECK(scope IN ('global','project','file','task'))`
        )
        if (injected === withRenamed) {
          // Nothing to do — schema has no scope column. Mark migration done.
          db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('023_memory_scope_task')").run()
          return
        }
        rebuiltSql = injected
      }

      db.exec(rebuiltSql)

      // Copy rows, normalizing any invalid legacy scope values to 'project'
      // so they pass the new CHECK.
      const colNames = memoryCols.map(c => c.name)
      const colList = colNames.join(', ')
      const selectList = colNames
        .map(c =>
          c === 'scope'
            ? `CASE WHEN scope IN ('global','project','file','task') THEN scope ELSE 'project' END AS scope`
            : c
        )
        .join(', ')
      db.exec(`INSERT INTO memories_new (${colList}) SELECT ${selectList} FROM memories`)
      db.exec(`DROP TABLE memories`)
      db.exec(`ALTER TABLE memories_new RENAME TO memories`)

      // Recreate preserved indexes and FTS triggers.
      for (const idxSql of preservedIndexes) {
        try {
          db.exec(idxSql)
        } catch {
          // index may already exist via CREATE INDEX IF NOT EXISTS
        }
      }
      for (const trig of ftsTriggerRows) {
        if (trig.sql) {
          try {
            db.exec(trig.sql)
          } catch {
            // trigger may already exist
          }
        }
      }

      // Rebuild the FTS5 index so rowids align with the new memories table.
      try {
        db.exec(`INSERT INTO memories_fts(memories_fts) VALUES ('rebuild')`)
      } catch {
        // memories_fts may not exist on minimal DBs
      }
    })()
  } finally {
    db.pragma(fkPrev023 ? 'foreign_keys = ON' : 'foreign_keys = OFF')
  }
  db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('023_memory_scope_task')").run()

  return true
}
