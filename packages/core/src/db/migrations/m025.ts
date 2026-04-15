import type Database from 'better-sqlite3'

// MIGRATION_025 — restore CHECK constraints dropped by MIGRATION_002 (J-2, J-3)
// MIGRATION_001 had CHECK constraints on tasks.status and agent_runs.role
// that used the wrong enum values. MIGRATION_002 rebuilt both tables to drop
// those wrong CHECKs — but never added the correct replacements. That left
// both columns accepting arbitrary strings. Same class of bug as the
// handoff_mode regression fixed in MIGRATION_022. Restore both CHECKs here,
// aligned with the current TypeScript type unions in packages/core/src/types.ts.
//
// Returns false if the runner should stop (i.e. this migration was already done),
// true if execution should continue. This matches the original `if (already025) return`
// early-exit behavior in the monolithic runMigrations function.
export function runM025(db: Database.Database): boolean {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '025_tasks_and_runs_checks'").get()
  if (already) return false

  // TaskStatus values — keep in sync with packages/core/src/types.ts TaskStatus
  const TASK_STATUS_VALUES = [
    'queued', 'ready', 'claimed', 'running',
    'blocked', 'failed', 'completed', 'cancelled',
  ]
  // AgentRole values — keep in sync with packages/core/src/types.ts AgentRole
  const AGENT_ROLE_VALUES = [
    'chief_of_staff', 'context_gatherer', 'prd_planner', 'implementation_planner',
    'issue_decomposer', 'software_engineer', 'research_worker', 'refactor_worker',
    'browser_worker', 'data_engineer', 'ml_engineer', 'devops_engineer',
    'architecture_reviewer', 'code_reviewer', 'qa_engineer', 'security_reviewer',
    'integration_worker', 'documentation_writer', 'memory_curator', 'tech_lead',
    'product_manager', 'analyst', 'orchestrator', 'custom',
  ]
  const TASK_STATUS_LIST = TASK_STATUS_VALUES.map(v => `'${v}'`).join(',')
  const AGENT_ROLE_LIST = AGENT_ROLE_VALUES.map(v => `'${v}'`).join(',')

  const tasksCols025 = db.prepare(`PRAGMA table_info(tasks)`).all() as { name: string }[]
  const runsCols025 = db.prepare(`PRAGMA table_info(agent_runs)`).all() as { name: string }[]

  if (tasksCols025.length === 0 && runsCols025.length === 0) {
    // Neither table exists yet — nothing to rebuild.
    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('025_tasks_and_runs_checks')").run()
    return false
  }

  const fkPrev025 = db.pragma('foreign_keys', { simple: true }) as number
  db.pragma('foreign_keys = OFF')
  try {
    db.transaction(() => {
      // --- tasks rebuild --------------------------------------------------
      if (tasksCols025.length > 0) {
        const tasksCreateRow = db
          .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'`)
          .get() as { sql: string | null } | undefined

        if (tasksCreateRow?.sql) {
          // Collect indexes and triggers to recreate after rename.
          const tasksIdxes = (db
            .prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='tasks' AND sql IS NOT NULL`)
            .all() as { sql: string }[]).map(r => r.sql)
          const tasksTriggers = db
            .prepare(`SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name='tasks'`)
            .all() as { name: string; sql: string | null }[]

          // Drop FTS triggers on tasks first — they reference tasks by name
          // and collide with the rename.
          for (const trig of tasksTriggers) {
            db.exec(`DROP TRIGGER IF EXISTS ${trig.name}`)
          }

          const withRenamedTasks = tasksCreateRow.sql.replace(
            /CREATE TABLE\s+"?tasks"?/i,
            'CREATE TABLE tasks_new'
          )
          // Remove any pre-existing CHECK on status (MIGRATION_002 dropped it;
          // this is defensive for hand-rolled DBs).
          const withoutOldTaskCheck = withRenamedTasks.replace(
            /CHECK\s*\(\s*status\s+IN\s*\([^)]*\)\s*\)/i,
            ''
          )
          // Inject a new CHECK into the status column definition. Match the
          // status column up to its terminator (comma or closing paren) and
          // append the CHECK before it.
          const taskCheckClause = `CHECK(status IN (${TASK_STATUS_LIST}))`
          const rebuiltTasksSql = withoutOldTaskCheck.replace(
            /(\bstatus\s+TEXT\b[^,)]*)/i,
            `$1 ${taskCheckClause}`
          )
          if (rebuiltTasksSql === withoutOldTaskCheck) {
            throw new Error('MIGRATION_025: failed to inject CHECK on tasks.status')
          }

          db.exec(rebuiltTasksSql)

          const colNames = tasksCols025.map(c => c.name)
          const colList = colNames.join(', ')
          const selectList = colNames
            .map(c =>
              c === 'status'
                ? `CASE WHEN status IN (${TASK_STATUS_LIST}) THEN status ELSE 'queued' END AS status`
                : c
            )
            .join(', ')
          db.exec(`INSERT INTO tasks_new (${colList}) SELECT ${selectList} FROM tasks`)
          db.exec(`DROP TABLE tasks`)
          db.exec(`ALTER TABLE tasks_new RENAME TO tasks`)

          for (const idxSql of tasksIdxes) {
            try { db.exec(idxSql) } catch { /* index may already exist */ }
          }
          for (const trig of tasksTriggers) {
            if (trig.sql) {
              try { db.exec(trig.sql) } catch { /* trigger may already exist */ }
            }
          }

          // Rebuild tasks_fts index so rowids align with the new tasks table.
          try {
            db.exec(`INSERT INTO tasks_fts(tasks_fts) VALUES ('rebuild')`)
          } catch {
            // tasks_fts may not exist on minimal DBs
          }
        }
      }

      // --- agent_runs rebuild ---------------------------------------------
      if (runsCols025.length > 0) {
        const runsCreateRow = db
          .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='agent_runs'`)
          .get() as { sql: string | null } | undefined

        if (runsCreateRow?.sql) {
          const runsIdxes = (db
            .prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='agent_runs' AND sql IS NOT NULL`)
            .all() as { sql: string }[]).map(r => r.sql)
          const runsTriggers = db
            .prepare(`SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name='agent_runs'`)
            .all() as { name: string; sql: string | null }[]

          for (const trig of runsTriggers) {
            db.exec(`DROP TRIGGER IF EXISTS ${trig.name}`)
          }

          const withRenamedRuns = runsCreateRow.sql.replace(
            /CREATE TABLE\s+"?agent_runs"?/i,
            'CREATE TABLE agent_runs_new'
          )
          // Remove any pre-existing CHECK on role.
          const withoutOldRoleCheck = withRenamedRuns.replace(
            /CHECK\s*\(\s*role\s+IN\s*\([^)]*\)\s*\)/i,
            ''
          )
          const roleCheckClause = `CHECK(role IN (${AGENT_ROLE_LIST}))`
          const rebuiltRunsSql = withoutOldRoleCheck.replace(
            /(\brole\s+TEXT\b[^,)]*)/i,
            `$1 ${roleCheckClause}`
          )
          if (rebuiltRunsSql === withoutOldRoleCheck) {
            throw new Error('MIGRATION_025: failed to inject CHECK on agent_runs.role')
          }

          db.exec(rebuiltRunsSql)

          const colNames = runsCols025.map(c => c.name)
          const colList = colNames.join(', ')
          const selectList = colNames
            .map(c =>
              c === 'role'
                ? `CASE WHEN role IN (${AGENT_ROLE_LIST}) THEN role ELSE 'software_engineer' END AS role`
                : c
            )
            .join(', ')
          db.exec(`INSERT INTO agent_runs_new (${colList}) SELECT ${selectList} FROM agent_runs`)
          db.exec(`DROP TABLE agent_runs`)
          db.exec(`ALTER TABLE agent_runs_new RENAME TO agent_runs`)

          for (const idxSql of runsIdxes) {
            try { db.exec(idxSql) } catch { /* index may already exist */ }
          }
          for (const trig of runsTriggers) {
            if (trig.sql) {
              try { db.exec(trig.sql) } catch { /* trigger may already exist */ }
            }
          }
        }
      }
    })()
  } finally {
    db.pragma(fkPrev025 ? 'foreign_keys = ON' : 'foreign_keys = OFF')
  }
  db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('025_tasks_and_runs_checks')").run()

  return true
}
