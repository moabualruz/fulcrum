import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { writeVectorMetadata } from '../l2/vector-metadata.js'
import { reconcileVectorMetadata } from '../setup/rag-coverage.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

describe('vector metadata reconciliation', () => {
  it('reports source identity, hash, runtime truth, row presence, and freshness mismatches', () => {
    getDb().prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, vault_path, title, summary, entities, provenance
      ) VALUES (
        'mem_vector', 'ws_1', 'proj_1', 'fact', 'project',
        'fresh vector source', 'hash-current',
        3, 'curated/pages/mem_vector.md', 'vector', 'vector', '[]', '{}'
      )
    `).run()
    writeVectorMetadata({
      workspace_id: 'ws_1',
      source_domain: 'memory',
      source_id: 'mem_vector',
      content_hash: 'hash-old',
      provider: 'requested-provider',
      model: 'requested-model',
      actual_provider: 'actual-provider',
      actual_model: 'actual-model',
      requested_device: 'cuda',
      actual_device: 'cpu',
      dimensions: 512,
      vector_table: 'vec_memories',
      status: 'current',
    })

    const summary = reconcileVectorMetadata({ workspace_id: 'ws_1', project_id: 'proj_1' })

    expect(summary.metadata_rows).toBe(1)
    expect(summary.missing_vector_rows).toBe(1)
    expect(summary.content_hash_mismatches).toBe(1)
    expect(summary.runtime_mismatches).toBe(1)
    expect(summary.freshness_mismatches).toBe(1)
    expect(summary.groups).toContainEqual(expect.objectContaining({
      source_domain: 'memory',
      provider: 'requested-provider',
      model: 'requested-model',
      actual_provider: 'actual-provider',
      actual_model: 'actual-model',
      requested_device: 'cuda',
      actual_device: 'cpu',
      dimensions: 512,
      count: 1,
    }))
  })
})
