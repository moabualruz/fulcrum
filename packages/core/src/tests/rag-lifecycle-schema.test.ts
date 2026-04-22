import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'

beforeEach(() => {
  createTestDb()
})

afterEach(() => {
  resetTestDb()
})

const TABLES = [
  'rag_rebuild_reports',
  'rag_rebuild_candidates',
  'rag_rebuild_input_snapshots',
  'embedding_jobs',
  'embedding_job_items',
  'rag_job_events',
  'vector_metadata',
  'rag_eval_runs',
]

function tableExists(name: string): boolean {
  const row = getDb()
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name) as { name: string } | undefined
  return row?.name === name
}

function columns(table: string): string[] {
  return (getDb().prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(row => row.name)
}

describe('RAG lifecycle schema', () => {
  it('creates all foundational lifecycle tables', () => {
    for (const table of TABLES) {
      expect(tableExists(table), `${table} should exist`).toBe(true)
    }
  })

  it('records the idempotent schema migration ledger row', () => {
    const row = getDb()
      .prepare("SELECT name FROM schema_migrations WHERE name = '035_rag_lifecycle_schema'")
      .get() as { name: string } | undefined
    expect(row?.name).toBe('035_rag_lifecycle_schema')
  })

  it('adds workspace scope to every lifecycle table', () => {
    for (const table of TABLES) {
      expect(columns(table), `${table} should include workspace_id`).toContain('workspace_id')
    }
  })

  it('enforces representative persisted status CHECK constraints', () => {
    const db = getDb()
    db.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_1', 'ws_1')").run()
    db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_1', 'ws_1', 'proj_1')").run()

    expect(() => db.prepare(`
      INSERT INTO rag_rebuild_reports (
        report_id, workspace_id, project_id, requested_by, actor_role, mode, status, candidate_disposition
      ) VALUES ('report_bad', 'ws_1', 'proj_1', 'tester', 'software_engineer', 'execute', 'not_real', 'none')
    `).run()).toThrow()

    expect(() => db.prepare(`
      INSERT INTO embedding_jobs (
        job_id, workspace_id, project_id, source_domain, status
      ) VALUES ('job_bad', 'ws_1', 'proj_1', 'memories', 'not_real')
    `).run()).toThrow()

    expect(() => db.prepare(`
      INSERT INTO vector_metadata (
        vector_metadata_id, workspace_id, source_domain, source_id, vector_table, status
      ) VALUES ('vecmeta_bad', 'ws_1', 'memory', 'mem_1', 'vec_memories', 'not_real')
    `).run()).toThrow()
  })
})
