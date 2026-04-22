import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'

beforeEach(() => {
  createTestDb()
})

afterEach(() => {
  resetTestDb()
})

const WORKSPACE_SCOPED_TABLES = [
  'rag_rebuild_reports',
  'rag_rebuild_candidates',
  'rag_rebuild_input_snapshots',
  'embedding_jobs',
  'embedding_job_items',
  'rag_job_events',
  'vector_metadata',
  'rag_health_reports',
  'rag_eval_runs',
]

function workspaceIndexes(table: string): string[] {
  const db = getDb()
  const list = db.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string }>
  return list
    .map(row => row.name)
    .filter(name => {
      const info = db.prepare(`PRAGMA index_info(${name})`).all() as Array<{ name: string }>
      return info.some(col => col.name === 'workspace_id')
    })
}

describe('RAG lifecycle workspace scoping', () => {
  it('keeps every report/job/eval lookup table indexed by workspace_id', () => {
    for (const table of WORKSPACE_SCOPED_TABLES) {
      expect(workspaceIndexes(table), `${table} needs a workspace_id index`).not.toHaveLength(0)
    }
  })
})
