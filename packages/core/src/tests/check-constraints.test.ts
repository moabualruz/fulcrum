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
 * Previously-omitted columns, now guarded by MIGRATION_027:
 *   - agent_runs.status, workspaces.status, handoffs.priority, handoffs.scope
 *     were all documented as J-5 omissions (either silently dropped by a rebuild
 *     or added via ALTER TABLE which cannot attach a CHECK). MIGRATION_027
 *     rebuilds all three tables and injects the CHECKs, so they are now
 *     enforced at the DB level and appear in GUARDED_COLUMNS below.
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
  // memories.kind: CHECK constraint intentionally dropped by v2a PR 1 Task 1.
  // Validation moves to packages/memory/src/write.ts (Task 9) which enforces
  // the v2a kind enum + per-kind char caps from §3.4. The DB level accepts
  // any TEXT so future kinds (file_patch, bash_trace, pre_compact_extract,
  // session_summary, task_outcome, blocker_resolution, delegation_summary,
  // decision, identity, persona, summary) can be added without further table
  // rebuilds. See docs/plans/2026-04-16-memory-v2a-plan.md §"Architecture
  // Decisions" → "memories.kind CHECK widening".
  {
    // MemoryScope — packages/core/src/types.ts (v2a Task 2 widened to include
    // session + workspace; legacy 'file' and 'task' kept as transition superset
    // — PR 6 hook rewrite removes them).
    table: 'memories',
    column: 'scope',
    expected: ['session', 'project', 'workspace', 'global', 'file', 'task'],
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
  {
    // AgentRunStatus — packages/core/src/types.ts (restored by MIGRATION_027)
    table: 'agent_runs',
    column: 'status',
    expected: [
      'created', 'starting', 'running', 'waiting',
      'blocked', 'failed', 'finished', 'aborted', 'stale',
    ],
  },
  {
    // WorkspaceStatus — packages/core/src/types.ts (restored by MIGRATION_027)
    table: 'workspaces',
    column: 'status',
    expected: ['active', 'archived'],
  },
  {
    // HandoffPriority — packages/core/src/types.ts (restored by MIGRATION_027)
    table: 'handoffs',
    column: 'priority',
    expected: ['critical', 'high', 'normal', 'low'],
  },
  {
    // HandoffScope — packages/core/src/types.ts (restored by MIGRATION_027)
    table: 'handoffs',
    column: 'scope',
    expected: ['task', 'issue', 'project', 'workspace'],
  },
  {
    // AgentRole — packages/core/src/types.ts — guarded on agent_profiles.base_role
    // by MIGRATION_030 so DB-backed profiles can't drift from the TS enum.
    table: 'agent_profiles',
    column: 'base_role',
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
    // RagRebuildMode — packages/core/src/types.ts
    table: 'rag_rebuild_reports',
    column: 'mode',
    expected: ['plan', 'dry_run', 'execute'],
  },
  {
    // RagRebuildReportStatus — packages/core/src/types.ts
    table: 'rag_rebuild_reports',
    column: 'status',
    expected: ['planned', 'running', 'completed', 'failed', 'cancelled'],
  },
  {
    // RagRebuildCandidateDisposition — packages/core/src/types.ts
    table: 'rag_rebuild_reports',
    column: 'candidate_disposition',
    expected: ['none', 'promoted', 'quarantined', 'discarded'],
  },
  {
    // RuntimeDataProfile — packages/core/src/types.ts
    table: 'rag_rebuild_reports',
    column: 'runtime_profile',
    expected: ['install', 'dev', 'test'],
  },
  {
    // RagRebuildCandidateStatus — packages/core/src/types.ts
    table: 'rag_rebuild_candidates',
    column: 'status',
    expected: ['building', 'verifying', 'verified', 'promoting', 'promoted', 'quarantined', 'discarded', 'failed'],
  },
  {
    // RuntimeDataProfile — packages/core/src/types.ts
    table: 'rag_rebuild_candidates',
    column: 'runtime_profile',
    expected: ['install', 'dev', 'test'],
  },
  {
    // RagRebuildSnapshotStatus — packages/core/src/types.ts
    table: 'rag_rebuild_input_snapshots',
    column: 'status',
    expected: ['current', 'stale', 'superseded'],
  },
  {
    // EmbeddingJobSourceDomain — packages/core/src/types.ts
    table: 'embedding_jobs',
    column: 'source_domain',
    expected: ['memories', 'l1_pages', 'code_chunks'],
  },
  {
    // EmbeddingJobStatus — packages/core/src/types.ts
    table: 'embedding_jobs',
    column: 'status',
    expected: ['pending', 'running', 'completed', 'degraded', 'failed', 'cancelled'],
  },
  {
    // EmbeddingJobSourceDomain — packages/core/src/types.ts
    table: 'embedding_job_items',
    column: 'source_domain',
    expected: ['memories', 'l1_pages', 'code_chunks'],
  },
  {
    // EmbeddingJobItemStatus — packages/core/src/types.ts
    table: 'embedding_job_items',
    column: 'status',
    expected: ['pending', 'running', 'embedded', 'failed', 'skipped', 'stale'],
  },
  {
    // RagJobEventType — packages/core/src/types.ts
    table: 'rag_job_events',
    column: 'event_type',
    expected: ['progress', 'retry', 'split', 'fallback', 'cancelled', 'resumed', 'failed', 'completed'],
  },
  {
    // VectorMetadataSourceDomain — packages/core/src/types.ts
    table: 'vector_metadata',
    column: 'source_domain',
    expected: ['memory', 'code_chunk'],
  },
  {
    // VectorMetadataTable — packages/core/src/types.ts
    table: 'vector_metadata',
    column: 'vector_table',
    expected: ['vec_memories', 'vec_chunks'],
  },
  {
    // VectorMetadataStatus — packages/core/src/types.ts
    table: 'vector_metadata',
    column: 'status',
    expected: ['current', 'stale', 'failed', 'skipped', 'legacy'],
  },
  {
    // CodeFileStatus — packages/core/src/types.ts
    table: 'code_files',
    column: 'status',
    expected: ['indexed', 'skipped', 'failed'],
  },
  {
    // RagHealthStatus — packages/core/src/types.ts
    table: 'rag_health_reports',
    column: 'status',
    expected: ['healthy', 'degraded', 'failed'],
  },
  {
    // RuntimeDataProfile — packages/core/src/types.ts
    table: 'rag_health_reports',
    column: 'runtime_profile',
    expected: ['install', 'dev', 'test'],
  },
  {
    // RagEvalRunStatus — packages/core/src/types.ts
    table: 'rag_eval_runs',
    column: 'status',
    expected: ['pending', 'running', 'passed', 'failed', 'cancelled'],
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
