import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { searchContext } from '../retrieval/search-context.js'
import { readContextualIndexRecord, writeContextualIndexRecord } from '../retrieval/contextual-index.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

describe('contextual index', () => {
  it('uses contextual text for ranking while returning canonical snippets', async () => {
    getDb().prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, title, summary, entities, provenance
      ) VALUES (
        'mem_contextual', 'ws_1', 'proj_1', 'fact', 'project',
        'Canonical snippet describes targeted repair only.', 'hash-contextual',
        3, 'Contextual memory', 'targeted repair', '[]', '{"sources":["src_contextual"]}'
      )
    `).run()
    const record = writeContextualIndexRecord({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memory',
      source_id: 'mem_contextual',
      canonical_content_hash: 'hash-contextual',
      context_version: 'symbol-doc-v1',
      template_version: 'template-v1',
      index_text: 'gpu accelerator context should rank this memory',
    })
    expect(readContextualIndexRecord({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memory',
      source_id: 'mem_contextual',
      context_version: 'symbol-doc-v1',
      template_version: 'template-v1',
    })?.contextual_index_id).toBe(record.contextual_index_id)

    const response = await searchContext({
      query: 'gpu accelerator',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      limit: 1,
    })

    expect(response.results[0]?.source_ref.source_id).toBe('mem_contextual')
    expect(response.results[0]?.snippet).toContain('Canonical snippet')
    expect(response.results[0]?.snippet).not.toContain('gpu accelerator context')
  })
})
