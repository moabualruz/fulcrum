import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb, closeDb, _configureDb } from '../db/client.js'
import { runMigrations } from '../db/migrations.js'

/**
 * Guard test: assert that every enum-backed DB column has a CHECK
 * constraint whose value set matches the TypeScript type union.
 *
 * This exists because migrations that rebuild tables have repeatedly
 * dropped CHECK constraints (J-5 in docs/gap-analysis/phase-3-validated.md).
 * When a future migration rebuilds a table and forgets to re-emit the
 * CHECK, this test goes red immediately.
 *
 * Each entry below is a hand-maintained snapshot of the current TypeScript
 * type in packages/core/src/types.ts. If you change one of these types,
 * update this list — and the test will tell you if you also forgot to
 * update the corresponding migration.
 *
 * Columns intentionally omitted:
 *   - agent_runs.status  — MIGRATION_002 rebuilt agent_runs without a
 *     CHECK on status and no subsequent migration has restored one.
 *     AgentRunStatus is enforced at the TypeScript layer only. If you
 *     want to restore the CHECK, add a migration and then add the entry
 *     back to this list.
 *   - workspaces.status  — MIGRATION_002 adds the column via ALTER TABLE,
 *     which cannot attach a CHECK and no rebuild has added one.
 *     WorkspaceStatus is enforced at the TypeScript layer only.
 *   - handoffs.priority / handoffs.scope — the handoffs table (MIGRATION_008,
 *     rebuilt by MIGRATION_022) defines these columns with a DEFAULT but
 *     no CHECK. HandoffPriority / HandoffScope are enforced at the TS
 *     layer only.
 *
 * The omissions above are deliberate and documented in
 * docs/gap-analysis/phase-3-validated.md (J-5). Each one is a candidate
 * for a future migration that adds the missing CHECK — at which point
 * the entry should move back into GUARDED_COLUMNS.
 */

interface EnumColumn {
  table: string
  column: string
  /** The full set of accepted values, from the TS type. */
  expected: readonly string[]
  /**
   * Set to true if the TS type is non-exhaustive and the DB CHECK may
   * legitimately allow additional values (rare — default false).
   */
  allow_superset?: boolean
}

const GUARDED_COLUMNS: EnumColumn[] = [
  {
    // TaskStatus — packages/core/src/types.ts
    table: 'tasks',
    column: 'status',
    expected: [
      'queued', 'ready', 'claimed', 'running',
      'blocked', 'failed', 'completed', 'cancelled',
    ],
  },
  {
    // AgentRole — packages/core/src/types.ts (24 values)
    table: 'agent_runs',
    column: 'role',
    expected: [
      'chief_of_staff', 'context_gatherer', 'prd_planner', 'implementation_planner',
      'issue_decomposer', 'software_engineer', 'research_worker', 'refactor_worker',
      'browser_worker', 'data_engineer', 'ml_engineer', 'devops_engineer',
      'architecture_reviewer', 'code_reviewer', 'qa_engineer', 'security_reviewer',
      'integration_worker', 'documentation_writer', 'memory_curator', 'tech_lead',
      'product_manager', 'analyst', 'orchestrator', 'custom',
    ],
  },
  {
    // MemoryKind — packages/core/src/types.ts (16-value superset)
    table: 'memories',
    column: 'kind',
    expected: [
      'fact', 'summary', 'symbol', 'decision', 'procedure',
      'error', 'diff', 'doc', 'code',
      'task_goal', 'task_decision', 'task_failure', 'task_outcome',
      'tool_trace', 'reasoning_step', 'lesson',
    ],
  },
  {
    // MemoryScope — packages/core/src/types.ts
    table: 'memories',
    column: 'scope',
    expected: ['global', 'project', 'file', 'task'],
  },
  {
    // HandoffMode — packages/core/src/types.ts
    table: 'handoffs',
    column: 'handoff_mode',
    expected: ['brief', 'contextual', 'artifact_first_brief', 'branched_session'],
  },
  {
    // handoffs.status — literal union on HandoffPacket in types.ts
    table: 'handoffs',
    column: 'status',
    expected: ['pending', 'claimed', 'completed', 'cancelled'],
  },
  {
    // ProjectType — packages/core/src/types.ts
    table: 'projects',
    column: 'type',
    expected: ['git', 'non_git', 'submodule', 'logical'],
  },
  {
    // ProjectStatus — packages/core/src/types.ts
    table: 'projects',
    column: 'status',
    expected: ['active', 'archived', 'paused'],
  },
  {
    // WriteMode — packages/core/src/types.ts
    table: 'projects',
    column: 'write_mode',
    expected: ['worktree', 'in_place', 'sequential'],
  },
  {
    // TelemetrySpan.status — literal union in types.ts
    table: 'trace_events',
    column: 'status',
    expected: ['started', 'ok', 'error'],
  },
]

/**
 * Parse the `CREATE TABLE ...` SQL for a table and find the CHECK clause
 * for a specific column. Returns the extracted value set as a sorted
 * array, or null if there's no CHECK on that column.
 */
function extractCheckValues(
  db: Database.Database,
  table: string,
  column: string,
): string[] | null {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`)
    .get(table) as { sql: string } | undefined
  if (!row?.sql) return null

  // Match CHECK(<col> IN ('a','b','c')) with flexible whitespace.
  const columnPattern = new RegExp(
    String.raw`CHECK\s*\(\s*${column}\s+IN\s*\(([^)]+)\)\s*\)`,
    'i',
  )
  const match = row.sql.match(columnPattern)
  if (!match) return null

  const valuesBlob = match[1]
  // Extract quoted string literals.
  const literalPattern = /'([^']*)'/g
  const values: string[] = []
  let m: RegExpExecArray | null
  while ((m = literalPattern.exec(valuesBlob)) !== null) {
    values.push(m[1])
  }
  return values.sort()
}

describe('enum column CHECK constraints match TS types (J-5 guard)', () => {
  let db: Database.Database
  beforeEach(() => {
    closeDb()
    db = new Database(':memory:')
    _configureDb(db)
    runMigrations(db)
    setDb(db)
  })
  afterEach(() => {
    closeDb()
  })

  for (const col of GUARDED_COLUMNS) {
    it(`${col.table}.${col.column} CHECK matches TS enum`, () => {
      const actual = extractCheckValues(db, col.table, col.column)
      expect(
        actual,
        `${col.table}.${col.column}: no CHECK(${col.column} IN (...)) found — ` +
          `did a migration silently drop it? See J-5 in docs/gap-analysis/phase-3-validated.md.`,
      ).not.toBeNull()
      const expectedSorted = [...col.expected].sort()
      if (col.allow_superset) {
        // DB is allowed to have additional values; every TS value must be in DB.
        for (const val of expectedSorted) {
          expect(actual).toContain(val)
        }
      } else {
        expect(
          actual,
          `${col.table}.${col.column}: DB CHECK values do not match the TS enum. ` +
            `Update the migration or the expected list.`,
        ).toEqual(expectedSorted)
      }
    })
  }
})
