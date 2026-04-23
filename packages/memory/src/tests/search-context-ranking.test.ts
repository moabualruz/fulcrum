import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from 'fulcrum-agent-core'
import { createTestDb, registerStubEmbedder, resetTestDb, seedWorkspaceAndProject, unregisterStubEmbedder } from './helpers.js'
import { storeEmbeddingInVec } from '../l2/embed.js'
import { searchContext } from '../retrieval/search-context.js'
import { writeVectorMetadata } from '../l2/vector-metadata.js'
import { writeContextualIndexRecord } from '../retrieval/contextual-index.js'

beforeEach(async () => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
  await registerStubEmbedder()
})

afterEach(() => {
  unregisterStubEmbedder()
  resetTestDb()
})

describe('searchContext hybrid fusion', () => {
  it('fuses lexical, contextual semantic, metadata freshness, and graph contributions', async () => {
    const db = getDb()
    db.prepare(`
      INSERT INTO graph_entities(entity_id, workspace_id, name, entity_type, properties, created_at, updated_at)
      VALUES ('ent_gpu', 'ws_1', 'gpu accelerator', 'concept', '{}', datetime('now'), datetime('now'))
    `).run()
    db.prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, title, summary, entities, provenance, freshness
      ) VALUES (
        'mem_rank', 'ws_1', 'proj_1', 'fact', 'project',
        'Canonical repair plan keeps runtime fallback visible.', 'hash-rank',
        3, 'Runtime fallback', 'repair fallback', '["ent_gpu"]', '{"sources":["src_rank"]}', 0.9
      )
    `).run()
    writeVectorMetadata({
      workspace_id: 'ws_1',
      source_domain: 'memory',
      source_id: 'mem_rank',
      content_hash: 'hash-rank',
      provider: 'local',
      model: 'test',
      requested_device: 'auto',
      actual_device: 'cpu',
      dimensions: 1024,
      vector_table: 'vec_memories',
      status: 'current',
    })
    await storeEmbeddingInVec(db, 'mem_rank', 'Canonical repair plan keeps runtime fallback visible.')
    writeContextualIndexRecord({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memory',
      source_id: 'mem_rank',
      canonical_content_hash: 'hash-rank',
      context_version: 'symbol-doc-v1',
      template_version: 'template-v1',
      index_text: 'gpu accelerator RAG repair fallback context',
    })

    const response = await searchContext({
      query: 'gpu accelerator repair',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      limit: 3,
      explain: true,
    })
    const top = response.results[0]!

    expect(top.source_ref.source_id).toBe('mem_rank')
    expect(top.snippet).toContain('Canonical repair plan')
    expect(top.snippet).not.toContain('gpu accelerator RAG repair fallback context')
    expect(top.stage_contributions.map(stage => stage.stage)).toEqual(expect.arrayContaining([
      'contextual_text',
      'semantic',
      'metadata_freshness',
      'graph',
    ]))
  })

  it('does not rank unrelated fresh/vector rows and finds relevant rows beyond recent noise', async () => {
    const db = getDb()
    for (let i = 0; i < 60; i += 1) {
      db.prepare(`
        INSERT INTO memories (
          memory_id, workspace_id, project_id, kind, scope, content, content_hash,
          schema_version, title, summary, entities, provenance, freshness, updated_at
        ) VALUES (?, 'ws_1', 'proj_1', 'fact', 'project', ?, ?, 3, ?, 'fallback noise', '[]', '{}', 1, datetime('now'))
      `).run(`mem_noise_${i}`, `Generic fallback note ${i}`, `hash-noise-${i}`, `Recent fallback noise ${i}`)
      writeVectorMetadata({
        workspace_id: 'ws_1',
        source_domain: 'memory',
        source_id: `mem_noise_${i}`,
        content_hash: `hash-noise-${i}`,
        provider: 'local',
        model: 'test',
        requested_device: 'auto',
        actual_device: 'cpu',
        dimensions: 1024,
        vector_table: 'vec_memories',
        status: 'current',
      })
    }
    db.prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, title, summary, entities, provenance, freshness, updated_at
      ) VALUES (
        'mem_old_relevant', 'ws_1', 'proj_1', 'fact', 'project',
        'Older evidence covers quartz rebuild fallback.', 'hash-old-relevant',
        3, 'Older quartz evidence', 'quartz fallback', '[]', '{}', 0.2, datetime('now', '-90 days')
      )
    `).run()

    const unrelated = await searchContext({
      query: 'absent needle',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      limit: 5,
    })
    expect(unrelated.results).toEqual([])

    const relevant = await searchContext({
      query: 'quartz fallback',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      limit: 5,
    })
    expect(relevant.results[0]?.source_ref.source_id).toBe('mem_old_relevant')
  })

  it('scores contextual index matches before limiting contextual-only candidates', async () => {
    const db = getDb()
    for (let i = 0; i < 60; i += 1) {
      db.prepare(`
        INSERT INTO memories (
          memory_id, workspace_id, project_id, kind, scope, content, content_hash,
          schema_version, title, summary, entities, provenance, freshness
        ) VALUES (?, 'ws_1', 'proj_1', 'fact', 'project', 'canonical text without query terms', ?, 3, ?, 'summary', '[]', '{}', 1)
      `).run(`mem_context_noise_${i}`, `hash-context-noise-${i}`, `Context noise ${i}`)
      writeContextualIndexRecord({
        workspace_id: 'ws_1',
        project_id: 'proj_1',
        source_domain: 'memory',
        source_id: `mem_context_noise_${i}`,
        canonical_content_hash: `hash-context-noise-${i}`,
        context_version: 'symbol-doc-v1',
        template_version: 'template-v1',
        index_text: 'fallback only',
      })
    }
    db.prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, title, summary, entities, provenance, freshness
      ) VALUES (
        'mem_context_old', 'ws_1', 'proj_1', 'fact', 'project',
        'canonical text without query terms', 'hash-context-old',
        3, 'Context old', 'summary', '[]', '{}', 0.2
      )
    `).run()
    writeContextualIndexRecord({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memory',
      source_id: 'mem_context_old',
      canonical_content_hash: 'hash-context-old',
      context_version: 'symbol-doc-v1',
      template_version: 'template-v1',
      index_text: 'quartz fallback',
    })
    db.prepare(`
      UPDATE contextual_index_records
         SET updated_at = datetime('now', '-90 days')
       WHERE source_id = 'mem_context_old'
    `).run()

    const response = await searchContext({
      query: 'quartz fallback',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      limit: 5,
    })

    expect(response.results[0]?.source_ref.source_id).toBe('mem_context_old')
    expect(response.results[0]?.stage_contributions.map(stage => stage.stage)).toContain('contextual_text')
  })
})
