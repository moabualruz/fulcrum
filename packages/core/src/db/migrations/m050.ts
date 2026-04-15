import type Database from 'better-sqlite3'

// MIGRATION_050 — issues: add blocking_issue_id column (PLAN-003).
//
// Adds an optional `blocking_issue_id` TEXT column to the issues table so an
// issue can directly reference another issue that is blocking it (issue-to-issue
// dependency). NULL means "not blocked by a specific issue" (most common case).
//
// This complements blocking_task_id (added in m049) which tracks task-level
// blockers. blocking_issue_id captures higher-level issue dependencies.
export function runM050(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '050_issues_blocking_issue_id'").get()
  if (already) return

  const now = Math.floor(Date.now() / 1000)
  db.exec(`ALTER TABLE issues ADD COLUMN blocking_issue_id TEXT REFERENCES issues(issue_id)`)
  db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES ('050_issues_blocking_issue_id', ?)")
    .run(now)
}
