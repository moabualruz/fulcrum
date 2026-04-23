import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { runRebuildParityChecks } from '../setup/rebuild-parity.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

describe('RAG rebuild parity checks', () => {
  it('detects code chunk file relationship drift', () => {
    getDb().prepare(`
      INSERT INTO code_chunks (
        chunk_id, workspace_id, project_id, file_path, file_id,
        chunk_strategy, source_type, content
      ) VALUES ('chunk_missing_file', 'ws_1', 'proj_1', 'src/a.ts', 'missing_file', 'syntax', 'code', 'body')
    `).run()

    const checks = runRebuildParityChecks({ workspace_id: 'ws_1', project_id: 'proj_1', domains: ['code'] })
    expect(checks).toContainEqual(expect.objectContaining({ name: 'code_chunks_file_id', status: 'fail' }))
  })

  it('detects vector metadata whose source row is gone', () => {
    getDb().prepare(`
      INSERT INTO vector_metadata (
        vector_metadata_id, workspace_id, source_domain, source_id, vector_table, status
      ) VALUES ('vecmeta_1', 'ws_1', 'memory', 'mem_missing', 'vec_memories', 'current')
    `).run()

    const checks = runRebuildParityChecks({ workspace_id: 'ws_1', project_id: 'proj_1', domains: ['vectors'] })
    expect(checks).toContainEqual(expect.objectContaining({ name: 'vector_metadata_memory_sources', status: 'fail' }))
  })

  it('checks graph edge parity only within the requested project evidence scope', () => {
    getDb().prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_2', 'ws_1', 'proj_2')").run()
    const now = new Date().toISOString()
    const properties = JSON.stringify({
      graph_evidence: true,
      project_id: 'proj_2',
      kind: 'edge',
      domain: 'memory',
      relationship_type: 'mentions',
      source_refs: [],
    })
    getDb().pragma('foreign_keys = OFF')
    try {
      getDb().prepare(`
        INSERT INTO graph_edges(edge_id, workspace_id, source_id, target_id, relation, properties, created_at)
        VALUES ('edge_broken_proj_2', 'ws_1', 'missing_source', 'missing_target', 'mentions', ?, ?)
      `).run(properties, now)
    } finally {
      getDb().pragma('foreign_keys = ON')
    }

    const currentProjectChecks = runRebuildParityChecks({ workspace_id: 'ws_1', project_id: 'proj_1', domains: ['graph'] })
    expect(currentProjectChecks).toContainEqual(expect.objectContaining({ name: 'graph_edges_entities', status: 'pass' }))

    const otherProjectChecks = runRebuildParityChecks({ workspace_id: 'ws_1', project_id: 'proj_2', domains: ['graph'] })
    expect(otherProjectChecks).toContainEqual(expect.objectContaining({ name: 'graph_edges_entities', status: 'fail', actual: 1 }))
  })
})
