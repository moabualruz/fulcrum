import type Database from 'better-sqlite3'

// MIGRATION_037 — remove tasks.depends_on JSON column (Task 3.3)
// The `task_relations` table is the single source of truth for dependency
// relationships. The `depends_on` JSON column on `tasks` was a dual
// representation that caused drift. This migration drops it via table rebuild,
// preserving all other columns, indexes, and FTS triggers.
export function runM037(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '037_remove_tasks_depends_on'").get()
  if (!already) {
    const tasksCols037 = db.prepare(`PRAGMA table_info(tasks)`).all() as { name: string }[]
    const hasDependsOn = tasksCols037.some(c => c.name === 'depends_on')

    if (hasDependsOn && tasksCols037.length > 0) {
      // Collect indexes and triggers to preserve
      const tasksIdxes037 = (db
        .prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='tasks' AND sql IS NOT NULL`)
        .all() as { sql: string }[]).map(r => r.sql)
      const tasksTriggers037 = db
        .prepare(`SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name='tasks'`)
        .all() as { name: string; sql: string | null }[]

      const fkPrev037 = db.pragma('foreign_keys', { simple: true }) as number
      db.pragma('foreign_keys = OFF')
      try {
        db.transaction(() => {
          // Drop FTS triggers before rename to avoid them firing on INSERT INTO tasks_new SELECT
          for (const trig of tasksTriggers037) {
            db.exec(`DROP TRIGGER IF EXISTS ${trig.name}`)
          }

          // Build new CREATE TABLE without the depends_on column
          const colsWithoutDependsOn = tasksCols037.filter(c => c.name !== 'depends_on')
          const colNames = colsWithoutDependsOn.map(c => c.name)

          // Read the current CREATE TABLE SQL and rebuild without depends_on
          const tasksCreateRow = db
            .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'`)
            .get() as { sql: string | null } | undefined
          if (!tasksCreateRow?.sql) return

          // Rename to tasks_new, remove the depends_on column line
          const withRenamed = tasksCreateRow.sql.replace(
            /CREATE TABLE\s+"?tasks"?/i,
            'CREATE TABLE tasks_new'
          )
          // Remove the depends_on column definition (matches line with depends_on)
          const rebuilt = withRenamed.replace(
            /\s*depends_on\s+TEXT[^\n,)]*[,]?/gi,
            ''
          )
          // Clean up any double commas or trailing commas before closing paren
          const cleaned = rebuilt
            .replace(/,(\s*,)+/g, ',')
            .replace(/,(\s*\))/g, '$1')

          db.exec(cleaned)

          const colList = colNames.join(', ')
          db.exec(`INSERT INTO tasks_new (${colList}) SELECT ${colList} FROM tasks`)
          db.exec(`DROP TABLE tasks`)
          db.exec(`ALTER TABLE tasks_new RENAME TO tasks`)

          // Recreate indexes
          for (const idxSql of tasksIdxes037) {
            try { db.exec(idxSql) } catch { /* may already exist */ }
          }

          // Recreate FTS triggers
          for (const trig of tasksTriggers037) {
            if (trig.sql) {
              try { db.exec(trig.sql) } catch { /* may already exist */ }
            }
          }

          // Rebuild FTS index so rowids align with the new tasks table
          try {
            db.exec(`INSERT INTO tasks_fts(tasks_fts) VALUES ('rebuild')`)
          } catch {
            // tasks_fts may not exist on minimal DBs
          }
        })()
      } finally {
        db.pragma(fkPrev037 ? 'foreign_keys = ON' : 'foreign_keys = OFF')
      }
    }
    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('037_remove_tasks_depends_on')").run()
  }
}
