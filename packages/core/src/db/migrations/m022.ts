import type Database from 'better-sqlite3'

// MIGRATION_022 — restore handoffs.handoff_mode CHECK constraint
// MIGRATION_013_HANDOFF_STATUS rebuilt the handoffs table without the CHECK
// constraint on handoff_mode that MIGRATION_008_HANDOFFS originally defined
// (brief / contextual / artifact_first_brief / branched_session). This
// silently made the DB permissive — Round 1 Task 14 (G-13) then shipped a
// TypeScript HandoffMode union with completely unrelated values and the
// tests only passed because the DB accepted anything. Restore the CHECK
// here and align the default with Python spec.
//
// Returns false if the runner should stop (i.e. this migration was already done),
// true if execution should continue. This matches the original `if (already022) return`
// early-exit behavior in the monolithic runMigrations function.
export function runM022(db: Database.Database): boolean {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '022_handoff_mode_check'").get()
  if (already) return false

  const handoffCols = db.prepare(`PRAGMA table_info(handoffs)`).all() as { name: string }[]
  if (handoffCols.length === 0) {
    // Table doesn't exist yet (fresh DB before MIGRATION_008) — nothing to fix up.
    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('022_handoff_mode_check')").run()
    return false
  }

  const fkPrev022 = db.pragma('foreign_keys', { simple: true }) as number
  db.pragma('foreign_keys = OFF')
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE handoffs_new (
          handoff_id           TEXT PRIMARY KEY,
          workspace_id         TEXT NOT NULL,
          project_id           TEXT,
          from_agent_id        TEXT,
          to_agent_id          TEXT,
          task_id              TEXT REFERENCES tasks(task_id),
          issue_id             TEXT REFERENCES issues(issue_id),
          goal                 TEXT NOT NULL,
          task_type            TEXT,
          priority             TEXT NOT NULL DEFAULT 'normal',
          scope                TEXT NOT NULL DEFAULT 'task',
          inputs               TEXT NOT NULL DEFAULT '{}',
          constraints          TEXT,
          done_criteria        TEXT,
          artifact_contract_id TEXT REFERENCES artifact_contracts(contract_id),
          handoff_mode         TEXT NOT NULL DEFAULT 'artifact_first_brief'
            CHECK(handoff_mode IN ('brief','contextual','artifact_first_brief','branched_session')),
          status               TEXT NOT NULL DEFAULT 'pending'
            CHECK(status IN ('pending','claimed','completed','cancelled')),
          claimed_at           TEXT,
          created_at           TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `)

      // Normalize any non-canonical handoff_mode values to 'artifact_first_brief'
      // so the copy respects the restored CHECK.
      db.exec(`
        INSERT OR IGNORE INTO handoffs_new (
          handoff_id, workspace_id, project_id, from_agent_id, to_agent_id,
          task_id, issue_id, goal, task_type, priority, scope,
          inputs, constraints, done_criteria, artifact_contract_id,
          handoff_mode, status, claimed_at, created_at
        )
        SELECT
          handoff_id, workspace_id, project_id, from_agent_id, to_agent_id,
          task_id, issue_id, goal, task_type, priority, scope,
          inputs, constraints, done_criteria, artifact_contract_id,
          CASE WHEN handoff_mode IN ('brief','contextual','artifact_first_brief','branched_session')
               THEN handoff_mode
               ELSE 'artifact_first_brief'
          END,
          COALESCE(status, 'pending'),
          claimed_at,
          created_at
        FROM handoffs;
      `)
      db.exec(`DROP TABLE handoffs`)
      db.exec(`ALTER TABLE handoffs_new RENAME TO handoffs`)
    })()
  } finally {
    db.pragma(fkPrev022 ? 'foreign_keys = ON' : 'foreign_keys = OFF')
  }
  db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('022_handoff_mode_check')").run()

  return true
}
