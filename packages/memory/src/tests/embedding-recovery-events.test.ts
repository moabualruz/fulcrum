import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { createEmbeddingJob, listEmbeddingJobItems, listRagJobEvents, runEmbeddingJob } from '../l2/embedding-jobs.js'
import type { EmbeddingProviderLike } from '../l2/embedding-jobs.js'
import { contentHash } from '../dedup.js'

class SplitOnceEmbedder implements EmbeddingProviderLike {
  dimensions = 1024
  actualDevice = 'cpu'

  async embed(text: string): Promise<Float32Array> {
    const vec = new Float32Array(1024)
    vec[0] = text.length
    return vec
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length > 1) throw new Error('batch too large')
    return Promise.all(texts.map(text => this.embed(text)))
  }
}

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

function seedMemory(id: string, body: string): void {
  getDb().prepare(`
    INSERT INTO memories (memory_id, workspace_id, project_id, content, content_hash, schema_version)
    VALUES (?, 'ws_1', 'proj_1', ?, ?, 3)
  `).run(id, body, contentHash(body))
}

describe('embedding recovery events', () => {
  it('records split events when reducing failed batches', async () => {
    seedMemory('mem_1', 'first')
    seedMemory('mem_2', 'second')
    const job = createEmbeddingJob({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memories',
      provider: 'local',
      model: 'test-model',
      requested_device: 'auto',
      dimensions: 1024,
    })

    const result = await runEmbeddingJob({ job_id: job.job_id, workspace_id: 'ws_1', batch_size: 2, embedder: new SplitOnceEmbedder() })

    expect(result.status).toBe('completed')
    expect(result.progress.embedded).toBe(2)
    expect(listRagJobEvents({ job_id: job.job_id, workspace_id: 'ws_1' })).toContainEqual(
      expect.objectContaining({
        event_type: 'split',
        message: 'embedding batch failed; reducing batch size',
        details: expect.objectContaining({ from: 2, to: [1, 1] }),
      }),
    )
  })

  it('keeps source identity stable for oversized content instead of writing orphan vector rows', async () => {
    const oversized = `${'alpha '.repeat(900)}\n${'beta '.repeat(900)}`
    seedMemory('mem_large', oversized)
    const job = createEmbeddingJob({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memories',
      provider: 'local',
      model: 'test-model',
      requested_device: 'auto',
      dimensions: 1024,
    })

    const items = listEmbeddingJobItems({ job_id: job.job_id, workspace_id: 'ws_1' })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ source_id: 'mem_large', chunk_key: '' })

    const result = await runEmbeddingJob({
      job_id: job.job_id,
      workspace_id: 'ws_1',
      batch_size: 1,
      embedder: {
        dimensions: 1024,
        actualDevice: 'cpu',
        async embed(text: string): Promise<Float32Array> {
          const vec = new Float32Array(1024)
          vec[0] = text.length
          return vec
        },
      },
    })

    expect(result.status).toBe('completed')
    expect(result.progress.embedded).toBe(1)
    const vectorRow = getDb().prepare('SELECT memory_id FROM vec_memories WHERE memory_id = ?').get('mem_large') as { memory_id: string } | undefined
    expect(vectorRow?.memory_id).toBe('mem_large')
  })
})
