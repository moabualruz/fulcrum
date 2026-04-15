import type Database from 'better-sqlite3'

// MIGRATION_026 — memories.kind CHECK alignment with packages/memory (J-4)
// The memory package had three extra MemoryKind values (tool_trace,
// reasoning_step, lesson) that weren't in core's enum or the DB CHECK.
// Aligned everything on the 16-value superset in packages/core/src/types.ts;
// packages/memory/src/types.ts now re-exports from core. Rebuild the memories
// table here so the CHECK on `kind` actually enforces the superset.
//
// Note: MIGRATION_005 tried to ALTER a CHECK onto `kind`, but MIGRATION_002
// had already added the column without any CHECK, so MIGRATION_005's ALTER
// silently failed with "duplicate column name" on every existing DB. As a
// result, there is typically NO CHECK on memories.kind before this point —
// the regex below handles both cases (replace-if-present, inject-if-absent).
//
// Returns false if the runner should stop (i.e. this migration was already done),
// true if execution should continue. This matches the original `if (already026) return`
// early-exit behavior in the monolithic runMigrations function.
export function runM026(db: Database.Database): boolean {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '026_memory_kind_align'").get()
  if (already) return false

  const memoryCols026 = db.prepare(`PRAGMA table_info(memories)`).all() as { name: string }[]
  if (memoryCols026.length === 0) {
    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('026_memory_kind_align')").run()
    return false
  }

  // Collect current user-created indexes so we can recreate them after the rename.
  const memIdxRows026 = db.prepare(`PRAGMA index_list(memories)`).all() as { name: string; origin: string }[]
  const preservedIdx026: string[] = []
  for (const idx of memIdxRows026) {
    if (idx.origin !== 'c') continue // skip auto-indexes
    const sqlRow = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND name=?`)
      .get(idx.name) as { sql: string | null } | undefined
    if (sqlRow?.sql) preservedIdx026.push(sqlRow.sql)
  }

  // FTS5 triggers on `memories` reference the memories rowid; drop them around
  // the rebuild and recreate afterwards (same pattern MIGRATION_023 used).
  const ftsTriggerRows026 = db
    .prepare(`SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name='memories'`)
    .all() as { name: string; sql: string | null }[]

  const fkPrev026 = db.pragma('foreign_keys', { simple: true }) as number
  db.pragma('foreign_keys = OFF')
  try {
    db.transaction(() => {
      const createSqlRow = db
        .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='memories'`)
        .get() as { sql: string | null } | undefined
      if (!createSqlRow?.sql) return
      const originalSql = createSqlRow.sql

      // Drop FTS triggers before the rename so they don't fire on the
      // INSERT INTO memories_new ... SELECT step.
      for (const trig of ftsTriggerRows026) {
        db.exec(`DROP TRIGGER IF EXISTS ${trig.name}`)
      }

      const newKindCheck = `CHECK(kind IN ('fact','summary','symbol','decision','procedure','error','diff','doc','code','task_goal','task_decision','task_failure','task_outcome','tool_trace','reasoning_step','lesson'))`

      // Match both `CREATE TABLE memories` and `CREATE TABLE "memories"` —
      // SQLite quotes the name after a prior ALTER TABLE ... RENAME, and
      // MIGRATION_023 already renamed this table at least once.
      const withRenamed = originalSql.replace(
        /CREATE TABLE\s+"?memories"?/i,
        'CREATE TABLE memories_new'
      )

      // Try to replace an existing CHECK(kind IN (...)) clause first.
      const replaced = withRenamed.replace(
        /CHECK\s*\(\s*kind\s+IN\s*\([^)]*\)\s*\)/i,
        newKindCheck
      )
      let rebuiltSql: string
      if (replaced !== withRenamed) {
        rebuiltSql = replaced
      } else {
        // No existing CHECK — inject one into the kind column definition.
        // The column in the real schema looks like:
        //   kind TEXT NOT NULL DEFAULT 'fact'
        // Match that up to the next comma or closing paren and append the CHECK.
        const injected = withRenamed.replace(
          /(\bkind\s+TEXT\b[^,)]*)/i,
          `$1 ${newKindCheck}`
        )
        if (injected === withRenamed) {
          // Nothing to do — schema has no kind column. Mark migration done.
          db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('026_memory_kind_align')").run()
          return
        }
        rebuiltSql = injected
      }

      db.exec(rebuiltSql)

      // Copy rows, normalizing any legacy kind values outside the 16-value
      // superset to 'fact' so they pass the new CHECK.
      const colNames = memoryCols026.map(c => c.name)
      const colList = colNames.join(', ')
      const selectList = colNames
        .map(c =>
          c === 'kind'
            ? `CASE WHEN kind IN ('fact','summary','symbol','decision','procedure','error','diff','doc','code','task_goal','task_decision','task_failure','task_outcome','tool_trace','reasoning_step','lesson') THEN kind ELSE 'fact' END AS kind`
            : c
        )
        .join(', ')
      db.exec(`INSERT INTO memories_new (${colList}) SELECT ${selectList} FROM memories`)
      db.exec(`DROP TABLE memories`)
      db.exec(`ALTER TABLE memories_new RENAME TO memories`)

      // Recreate preserved indexes and FTS triggers.
      for (const idxSql of preservedIdx026) {
        try { db.exec(idxSql) } catch { /* may already exist */ }
      }
      for (const trig of ftsTriggerRows026) {
        if (trig.sql) {
          try { db.exec(trig.sql) } catch { /* may already exist */ }
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
    db.pragma(fkPrev026 ? 'foreign_keys = ON' : 'foreign_keys = OFF')
  }
  db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('026_memory_kind_align')").run()

  return true
}
