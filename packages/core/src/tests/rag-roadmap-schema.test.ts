import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'

describe('RAG roadmap schema', () => {
  beforeEach(() => {
    createTestDb()
  })

  afterEach(() => {
    resetTestDb()
  })

  const tables = [
    'rag_repair_plans',
    'rag_repair_runs',
    'rag_coverage_records',
    'contextual_index_records',
    'rag_eval_cases',
    'rag_eval_results',
    'rag_query_traces',
    'rag_context_results',
    'context_packs',
    'runtime_experiments',
  ]

  function tableExists(name: string): boolean {
    const row = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(name) as { name: string } | undefined
    return row?.name === name
  }

  function columnNames(table: string): string[] {
    return (getDb().prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(row => row.name)
  }

  it('creates additive RAG roadmap repair, coverage, trace, eval, contextual index, and runtime experiment tables', () => {
    for (const table of tables) {
      expect(tableExists(table), `${table} should exist`).toBe(true)
    }
  })

  it('records the RAG roadmap schema migration ledger row', () => {
    const row = getDb()
      .prepare("SELECT name FROM schema_migrations WHERE name = '036_rag_roadmap_schema'")
      .get() as { name: string } | undefined
    expect(row?.name).toBe('036_rag_roadmap_schema')
  })

  it('adds workspace and project scope to every roadmap table', () => {
    for (const table of tables) {
      const cols = columnNames(table)
      expect(cols, `${table} should include workspace_id`).toContain('workspace_id')
      expect(cols, `${table} should include project_id`).toContain('project_id')
    }
  })
})
