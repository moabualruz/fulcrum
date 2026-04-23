import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { isContextualIndexStale, markStaleContextualIndexRecords, readContextualIndexRecord, writeContextualIndexRecord } from '../retrieval/contextual-index.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

describe('contextual index staleness', () => {
  it('marks records stale when canonical hash, context version, or template version changes', () => {
    const record = writeContextualIndexRecord({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memory',
      source_id: 'mem_stale',
      canonical_content_hash: 'hash-old',
      context_version: 'symbol-doc-v1',
      template_version: 'template-v1',
      index_text: 'old context',
    })

    expect(isContextualIndexStale(record, {
      canonical_content_hash: 'hash-new',
      context_version: 'symbol-doc-v1',
      template_version: 'template-v1',
    })).toBe(true)
    const changed = markStaleContextualIndexRecords({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memory',
      source_id: 'mem_stale',
      canonical_content_hash: 'hash-new',
      context_version: 'symbol-doc-v2',
      template_version: 'template-v2',
    })

    expect(changed).toBe(1)
  })

  it('preserves stale history when a current record is rewritten for new canonical content', () => {
    writeContextualIndexRecord({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memory',
      source_id: 'mem_rewrite',
      canonical_content_hash: 'hash-old',
      context_version: 'symbol-doc-v1',
      template_version: 'template-v1',
      index_text: 'old context',
    })

    const current = writeContextualIndexRecord({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memory',
      source_id: 'mem_rewrite',
      canonical_content_hash: 'hash-new',
      context_version: 'symbol-doc-v1',
      template_version: 'template-v1',
      index_text: 'new context',
    })

    expect(current.canonical_content_hash).toBe('hash-new')
    expect(readContextualIndexRecord({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memory',
      source_id: 'mem_rewrite',
    })?.index_text).toBe('new context')
    const counts = getDb().prepare(`
      SELECT status, COUNT(*) AS n
        FROM contextual_index_records
       WHERE source_id = 'mem_rewrite'
       GROUP BY status
    `).all() as Array<{ status: string; n: number }>
    expect(counts).toEqual(expect.arrayContaining([
      { status: 'current', n: 1 },
      { status: 'stale', n: 1 },
    ]))
  })
})
