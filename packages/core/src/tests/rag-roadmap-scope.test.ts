import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'

beforeEach(() => {
  createTestDb()
})

afterEach(() => {
  resetTestDb()
})

function indexesFor(table: string): Array<{ name: string; sql: string }> {
  return getDb()
    .prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name = ?")
    .all(table)
    .filter((row): row is { name: string; sql: string } => typeof (row as { sql: unknown }).sql === 'string')
}

describe('RAG roadmap workspace/project scoping', () => {
  const scopedTables = [
    'rag_repair_plans',
    'rag_repair_runs',
    'rag_coverage_records',
    'rag_query_traces',
    'rag_eval_cases',
    'rag_eval_results',
    'runtime_experiments',
  ]

  it('indexes repair, coverage, trace, eval, and runtime experiment lookups by workspace and project', () => {
    for (const table of scopedTables) {
      const indexes = indexesFor(table)
      expect(
        indexes.some(index => index.sql.includes('workspace_id') && index.sql.includes('project_id')),
        `${table} should have a workspace/project lookup index`,
      ).toBe(true)
    }
  })
})
