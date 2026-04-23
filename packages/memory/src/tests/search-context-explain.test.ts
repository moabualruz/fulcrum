import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { searchContext } from '../retrieval/search-context.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

describe('searchContext explanations', () => {
  it('reports skipped and degraded stages without hiding usable lexical results', async () => {
    getDb().prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, title, summary, entities, provenance
      ) VALUES (
        'mem_explain', 'ws_1', 'proj_1', 'fact', 'project',
        'RAG explain search still returns lexical evidence.', 'hash-explain',
        3, 'Explain memory', 'lexical evidence', '[]', '{"sources":["src_explain"]}'
      )
    `).run()

    const response = await searchContext({
      query: 'RAG explain',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      explain: true,
    })

    expect(response.results[0]?.source_ref.source_id).toBe('mem_explain')
    expect(response.results[0]?.explanation_status).toBe('partial')
    expect(response.skipped_stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'semantic', reason: expect.any(String) }),
      expect.objectContaining({ stage: 'graph', reason: expect.any(String) }),
    ]))
  })
})
