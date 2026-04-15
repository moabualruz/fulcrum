import type Database from 'better-sqlite3'

// MIGRATION_028 — add worktrees.base_branch column (H-3)
// Records the base branch the worktree was branched from so git subprocess
// operations (worktree add -b <branch> <base>, and later merge) have the
// information they need without the caller having to track it externally.
export function runM028(db: Database.Database): void {
  try {
    const worktreeCols028 = db
      .prepare(`PRAGMA table_info(worktrees)`)
      .all() as Array<{ name: string }>
    if (worktreeCols028.length > 0 && !worktreeCols028.some(c => c.name === 'base_branch')) {
      db.exec(`ALTER TABLE worktrees ADD COLUMN base_branch TEXT`)
    }
  } catch {
    // worktrees table may not exist yet on a DB that hasn't run MIGRATION_008
    // (e.g. a very partial migration set). Safe to skip — MIGRATION_008 will
    // create the column itself when it runs next.
  }
  db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('028_worktrees_base_branch')").run()
}
