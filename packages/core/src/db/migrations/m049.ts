import type Database from 'better-sqlite3'

// MIGRATION_049 — issues: add blocking_task_id column (PLAN-003).
//
// Adds an optional `blocking_task_id` TEXT column to the issues table so an
// issue can directly reference the single task that is currently blocking it.
// NULL means "not blocked by a specific task" (most common case).
//
// This is a denormalized convenience column — the authoritative blocking graph
// lives in task_relations, but surfaces the primary blocker without a join.
export function runM049(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '049_issues_blocking_task_id'").get()
  if (already) return

  const now = Math.floor(Date.now() / 1000)
  db.exec(`ALTER TABLE issues ADD COLUMN blocking_task_id TEXT REFERENCES tasks(task_id)`)
  db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES ('049_issues_blocking_task_id', ?)")
    .run(now)
}
