import type Database from 'better-sqlite3'

// MIGRATION_029 — add 'conflict' to worktrees.status CHECK (H-4)
// H-4 introduces a 'conflict' status that the merge queue sets when
// `git merge` fails with conflict markers. Older DBs created by
// MIGRATION_008_WORKTREES have a CHECK that only allows the original five
// statuses, so we rebuild the table to widen the constraint. Uses the same
// rebuild-with-preserved-indexes pattern as the other CHECK-widening
// migrations above.
export function runM029(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '029_worktrees_conflict_status'").get()
  if (!already) {
    const wtCols029 = db.prepare(`PRAGMA table_info(worktrees)`).all() as { name: string }[]
    if (wtCols029.length === 0) {
      // worktrees table doesn't exist yet — MIGRATION_008_WORKTREES will run next
      // with the widened CHECK already in place.
      db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('029_worktrees_conflict_status')").run()
    } else {
      const wtCreateRow = db
        .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='worktrees'`)
        .get() as { sql: string | null } | undefined
      if (!wtCreateRow?.sql || wtCreateRow.sql.includes(`'conflict'`) || !wtCreateRow.sql.includes(`'discarded'`)) {
        // Already widened (contains 'conflict') or CHECK removed entirely — nothing to do.
        db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('029_worktrees_conflict_status')").run()
      } else {
        const wtIdxes029 = (db
          .prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='worktrees' AND sql IS NOT NULL`)
          .all() as { sql: string }[]).map(r => r.sql)

        const fkPrev029 = db.pragma('foreign_keys', { simple: true }) as number
        db.pragma('foreign_keys = OFF')
        try {
          db.transaction(() => {
            const withRenamed = wtCreateRow.sql!.replace(/CREATE TABLE\s+"?worktrees"?/i, 'CREATE TABLE worktrees_new')
            const rebuilt = withRenamed.replace(
              /CHECK\s*\(\s*status\s+IN\s*\(\s*'allocated'\s*,\s*'dirty'\s*,\s*'ready_for_merge'\s*,\s*'merged'\s*,\s*'discarded'\s*\)\s*\)/i,
              `CHECK(status IN ('allocated','dirty','ready_for_merge','merged','discarded','conflict'))`
            )
            if (rebuilt === withRenamed) {
              throw new Error('MIGRATION_029: failed to inject widened CHECK on worktrees.status')
            }
            db.exec(rebuilt)

            const colNames = wtCols029.map(c => c.name).join(', ')
            db.exec(`INSERT INTO worktrees_new (${colNames}) SELECT ${colNames} FROM worktrees`)
            db.exec(`DROP TABLE worktrees`)
            db.exec(`ALTER TABLE worktrees_new RENAME TO worktrees`)

            for (const idxSql of wtIdxes029) {
              try { db.exec(idxSql) } catch { /* index may already exist */ }
            }
          })()
        } finally {
          db.pragma(fkPrev029 ? 'foreign_keys = ON' : 'foreign_keys = OFF')
        }
        db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('029_worktrees_conflict_status')").run()
      }
    }
  }
}
