import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { createEmbeddingJob, listEmbeddingJobItems, retryFailedEmbeddingJob, runEmbeddingJob } from '../l2/embedding-jobs.js'
import type { EmbeddingProviderLike } from '../l2/embedding-jobs.js'
import { contentHash } from '../dedup.js'

class SelectiveFailEmbedder implements EmbeddingProviderLike {
  dimensions = 1024
  actualDevice = 'cpu'

  async embed(text: string): Promise<Float32Array> {
    if (text.includes('bad')) throw new Error('bad item failed')
    const vec = new Float32Array(1024)
    vec[0] = text.length
    return vec
  }
}

class SucceedEmbedder implements EmbeddingProviderLike {
  dimensions = 1024
  actualDevice = 'cpu'

  async embed(text: string): Promise<Float32Array> {
    const vec = new Float32Array(1024)
    vec[0] = text.length
    return vec
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

describe('embedding degraded state and failed-item retry', () => {
  it('finishes degraded with failed rows and retries only failed items', async () => {
    seedMemory('mem_ok', 'good item')
    seedMemory('mem_bad', 'bad item')
    const job = createEmbeddingJob({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memories',
      provider: 'local',
      model: 'test-model',
      requested_device: 'auto',
      dimensions: 1024,
    })

    const degraded = await runEmbeddingJob({ job_id: job.job_id, workspace_id: 'ws_1', batch_size: 1, embedder: new SelectiveFailEmbedder() })
    expect(degraded.status).toBe('degraded')
    expect(degraded.progress).toMatchObject({ embedded: 1, failed: 1 })

    const before = listEmbeddingJobItems({ job_id: job.job_id, workspace_id: 'ws_1' })
    expect(before.find(item => item.source_id === 'mem_ok')?.attempts).toBe(1)
    expect(before.find(item => item.source_id === 'mem_bad')?.status).toBe('failed')

    const retried = await retryFailedEmbeddingJob({ job_id: job.job_id, workspace_id: 'ws_1', batch_size: 1, embedder: new SucceedEmbedder() })
    expect(retried.status).toBe('completed')
    expect(retried.progress).toMatchObject({ embedded: 2, failed: 0 })

    const after = listEmbeddingJobItems({ job_id: job.job_id, workspace_id: 'ws_1' })
    expect(after.find(item => item.source_id === 'mem_ok')?.attempts).toBe(1)
    expect(after.find(item => item.source_id === 'mem_bad')?.attempts).toBe(2)
  })
})
