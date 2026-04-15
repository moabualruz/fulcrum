import type Database from 'better-sqlite3'

// MIGRATION_027 — add CHECK constraints on 4 columns that never had them (J-5 follow-up)
// Round 3 guard test (check-constraints.test.ts) found four enum-backed columns
// whose DB CHECK constraint was missing entirely:
//   - agent_runs.status  (MIGRATION_002 rebuilt without re-emitting the CHECK)
//   - workspaces.status  (added via ALTER TABLE in MIGRATION_002; SQLite cannot
//                         attach a CHECK via ALTER, so none was ever enforced)
//   - handoffs.priority  (MIGRATION_008/022 define the column with DEFAULT 'normal'
//                         but no CHECK)
//   - handoffs.scope     (same as priority)
// Rebuild each affected table once, injecting the relevant CHECK(s), and
// normalize any legacy out-of-range values during the copy.
//
// Returns false if the runner should stop (i.e. this migration was already done),
// true if execution should continue. This matches the original `if (already027) return`
// early-exit behavior in the monolithic runMigrations function.
export function runM027(db: Database.Database): boolean {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '027_add_missing_checks'").get()
  if (already) return false

  // Canonical enum value sets — keep in sync with packages/core/src/types.ts.
  // Keep in sync with packages/core/src/types.ts AgentRunStatus.
  // Note: 'stale' is set by janitor.ts when a run's heartbeat times out, and
  // status.ts queries it directly — so it's a first-class runtime status and
  // belongs in both the TS type and the DB CHECK.
  const AGENT_RUN_STATUS_VALUES = [
    'created', 'starting', 'running', 'waiting',
    'blocked', 'failed', 'finished', 'aborted', 'stale',
  ]
  const WORKSPACE_STATUS_VALUES = ['active', 'archived']
  const HANDOFF_PRIORITY_VALUES = ['critical', 'high', 'normal', 'low']
  const HANDOFF_SCOPE_VALUES = ['task', 'issue', 'project', 'workspace']

  const AGENT_RUN_STATUS_LIST = AGENT_RUN_STATUS_VALUES.map(v => `'${v}'`).join(',')
  const WORKSPACE_STATUS_LIST = WORKSPACE_STATUS_VALUES.map(v => `'${v}'`).join(',')
  const HANDOFF_PRIORITY_LIST = HANDOFF_PRIORITY_VALUES.map(v => `'${v}'`).join(',')
  const HANDOFF_SCOPE_LIST = HANDOFF_SCOPE_VALUES.map(v => `'${v}'`).join(',')

  const runsCols027 = db.prepare(`PRAGMA table_info(agent_runs)`).all() as { name: string }[]
  const wsCols027 = db.prepare(`PRAGMA table_info(workspaces)`).all() as { name: string }[]
  const handoffCols027 = db.prepare(`PRAGMA table_info(handoffs)`).all() as { name: string }[]

  if (runsCols027.length === 0 && wsCols027.length === 0 && handoffCols027.length === 0) {
    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('027_add_missing_checks')").run()
    return false
  }

  const fkPrev027 = db.pragma('foreign_keys', { simple: true }) as number
  db.pragma('foreign_keys = OFF')
  try {
    db.transaction(() => {
      // --- agent_runs rebuild: inject CHECK on status ---------------------
      if (runsCols027.length > 0) {
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
          // Remove any pre-existing CHECK on status (defensive; MIGRATION_002
          // dropped it, but hand-rolled DBs may still have one).
          const withoutOldStatusCheck = withRenamedRuns.replace(
            /CHECK\s*\(\s*status\s+IN\s*\([^)]*\)\s*\)/i,
            ''
          )
          const statusCheckClause = `CHECK(status IN (${AGENT_RUN_STATUS_LIST}))`
          const rebuiltRunsSql = withoutOldStatusCheck.replace(
            /(\bstatus\s+TEXT\b[^,)]*)/i,
            `$1 ${statusCheckClause}`
          )
          if (rebuiltRunsSql === withoutOldStatusCheck) {
            throw new Error('MIGRATION_027: failed to inject CHECK on agent_runs.status')
          }

          db.exec(rebuiltRunsSql)

          const colNames = runsCols027.map(c => c.name)
          const colList = colNames.join(', ')
          const selectList = colNames
            .map(c =>
              c === 'status'
                ? `CASE WHEN status IN (${AGENT_RUN_STATUS_LIST}) THEN status ELSE 'running' END AS status`
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

      // --- workspaces rebuild: inject CHECK on status ---------------------
      if (wsCols027.length > 0) {
        const wsCreateRow = db
          .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='workspaces'`)
          .get() as { sql: string | null } | undefined

        if (wsCreateRow?.sql) {
          const hasStatus = wsCols027.some(c => c.name === 'status')
          if (hasStatus) {
            const wsIdxes = (db
              .prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='workspaces' AND sql IS NOT NULL`)
              .all() as { sql: string }[]).map(r => r.sql)
            const wsTriggers = db
              .prepare(`SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name='workspaces'`)
              .all() as { name: string; sql: string | null }[]

            for (const trig of wsTriggers) {
              db.exec(`DROP TRIGGER IF EXISTS ${trig.name}`)
            }

            const withRenamedWs = wsCreateRow.sql.replace(
              /CREATE TABLE\s+"?workspaces"?/i,
              'CREATE TABLE workspaces_new'
            )
            const withoutOldWsCheck = withRenamedWs.replace(
              /CHECK\s*\(\s*status\s+IN\s*\([^)]*\)\s*\)/i,
              ''
            )
            const wsCheckClause = `CHECK(status IN (${WORKSPACE_STATUS_LIST}))`
            const rebuiltWsSql = withoutOldWsCheck.replace(
              /(\bstatus\s+TEXT\b[^,)]*)/i,
              `$1 ${wsCheckClause}`
            )
            if (rebuiltWsSql === withoutOldWsCheck) {
              throw new Error('MIGRATION_027: failed to inject CHECK on workspaces.status')
            }

            db.exec(rebuiltWsSql)

            const colNames = wsCols027.map(c => c.name)
            const colList = colNames.join(', ')
            const selectList = colNames
              .map(c =>
                c === 'status'
                  ? `CASE WHEN status IN (${WORKSPACE_STATUS_LIST}) THEN status ELSE 'active' END AS status`
                  : c
              )
              .join(', ')
            db.exec(`INSERT INTO workspaces_new (${colList}) SELECT ${selectList} FROM workspaces`)
            db.exec(`DROP TABLE workspaces`)
            db.exec(`ALTER TABLE workspaces_new RENAME TO workspaces`)

            for (const idxSql of wsIdxes) {
              try { db.exec(idxSql) } catch { /* index may already exist */ }
            }
            for (const trig of wsTriggers) {
              if (trig.sql) {
                try { db.exec(trig.sql) } catch { /* trigger may already exist */ }
              }
            }
          }
        }
      }

      // --- handoffs rebuild: inject CHECKs on priority AND scope ----------
      if (handoffCols027.length > 0) {
        const handoffsCreateRow = db
          .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='handoffs'`)
          .get() as { sql: string | null } | undefined

        if (handoffsCreateRow?.sql) {
          const handoffIdxes = (db
            .prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='handoffs' AND sql IS NOT NULL`)
            .all() as { sql: string }[]).map(r => r.sql)
          const handoffTriggers = db
            .prepare(`SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name='handoffs'`)
            .all() as { name: string; sql: string | null }[]

          for (const trig of handoffTriggers) {
            db.exec(`DROP TRIGGER IF EXISTS ${trig.name}`)
          }

          const withRenamedHandoffs = handoffsCreateRow.sql.replace(
            /CREATE TABLE\s+"?handoffs"?/i,
            'CREATE TABLE handoffs_new'
          )
          // Defensive: strip any pre-existing CHECK on priority/scope.
          const withoutOldPriority = withRenamedHandoffs.replace(
            /CHECK\s*\(\s*priority\s+IN\s*\([^)]*\)\s*\)/i,
            ''
          )
          const withoutOldScope = withoutOldPriority.replace(
            /CHECK\s*\(\s*scope\s+IN\s*\([^)]*\)\s*\)/i,
            ''
          )
          const priorityCheckClause = `CHECK(priority IN (${HANDOFF_PRIORITY_LIST}))`
          const scopeCheckClause = `CHECK(scope IN (${HANDOFF_SCOPE_LIST}))`
          // Inject CHECKs into priority and scope column definitions.
          const withPriorityCheck = withoutOldScope.replace(
            /(\bpriority\s+TEXT\b[^,)]*)/i,
            `$1 ${priorityCheckClause}`
          )
          if (withPriorityCheck === withoutOldScope) {
            throw new Error('MIGRATION_027: failed to inject CHECK on handoffs.priority')
          }
          const rebuiltHandoffsSql = withPriorityCheck.replace(
            /(\bscope\s+TEXT\b[^,)]*)/i,
            `$1 ${scopeCheckClause}`
          )
          if (rebuiltHandoffsSql === withPriorityCheck) {
            throw new Error('MIGRATION_027: failed to inject CHECK on handoffs.scope')
          }

          db.exec(rebuiltHandoffsSql)

          const colNames = handoffCols027.map(c => c.name)
          const colList = colNames.join(', ')
          const selectList = colNames
            .map(c => {
              if (c === 'priority') {
                return `CASE WHEN priority IN (${HANDOFF_PRIORITY_LIST}) THEN priority ELSE 'normal' END AS priority`
              }
              if (c === 'scope') {
                return `CASE WHEN scope IN (${HANDOFF_SCOPE_LIST}) THEN scope ELSE 'task' END AS scope`
              }
              return c
            })
            .join(', ')
          db.exec(`INSERT INTO handoffs_new (${colList}) SELECT ${selectList} FROM handoffs`)
          db.exec(`DROP TABLE handoffs`)
          db.exec(`ALTER TABLE handoffs_new RENAME TO handoffs`)

          for (const idxSql of handoffIdxes) {
            try { db.exec(idxSql) } catch { /* index may already exist */ }
          }
          for (const trig of handoffTriggers) {
            if (trig.sql) {
              try { db.exec(trig.sql) } catch { /* trigger may already exist */ }
            }
          }
        }
      }
    })()
  } finally {
    db.pragma(fkPrev027 ? 'foreign_keys = ON' : 'foreign_keys = OFF')
  }
  db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('027_add_missing_checks')").run()

  return true
}
