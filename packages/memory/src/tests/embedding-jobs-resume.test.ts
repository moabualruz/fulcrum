import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { cancelEmbeddingJob, createEmbeddingJob, listEmbeddingJobItems, resumeEmbeddingJob, runEmbeddingJob } from '../l2/embedding-jobs.js'
import type { EmbeddingProviderLike } from '../l2/embedding-jobs.js'
import { contentHash } from '../dedup.js'

class CountingEmbedder implements EmbeddingProviderLike {
  dimensions = 1024
  calls = 0
  actualDevice = 'cpu'

  async embed(text: string): Promise<Float32Array> {
    this.calls += 1
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

describe('embedding job resume and idempotency', () => {
  it('resumes pending work without reprocessing completed current items', async () => {
    seedMemory('mem_1', 'first body')
    seedMemory('mem_2', 'second body')
    const embedder = new CountingEmbedder()
    const job = createEmbeddingJob({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memories',
      provider: 'local',
      model: 'test-model',
      requested_device: 'auto',
      dimensions: 1024,
    })

    const interrupted = await runEmbeddingJob({ job_id: job.job_id, workspace_id: 'ws_1', batch_size: 1, max_items: 1, embedder })
    expect(interrupted.status).toBe('running')
    expect(interrupted.progress).toMatchObject({ embedded: 1, pending: 1 })

    const completed = await resumeEmbeddingJob({ job_id: job.job_id, workspace_id: 'ws_1', batch_size: 1, embedder })
    expect(completed.status).toBe('completed')
    expect(completed.progress).toMatchObject({ embedded: 2, pending: 0, failed: 0 })

    const callsAfterComplete = embedder.calls
    await resumeEmbeddingJob({ job_id: job.job_id, workspace_id: 'ws_1', batch_size: 1, embedder })
    expect(embedder.calls).toBe(callsAfterComplete)

    const items = listEmbeddingJobItems({ job_id: job.job_id, workspace_id: 'ws_1' })
    expect(items.map(item => item.attempts)).toEqual([1, 1])
  })

  it('reclaims running items left behind by an interrupted process', async () => {
    seedMemory('mem_running', 'running body')
    const embedder = new CountingEmbedder()
    const job = createEmbeddingJob({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memories',
      provider: 'local',
      model: 'test-model',
      requested_device: 'auto',
      dimensions: 1024,
    })

    getDb().prepare(`
      UPDATE embedding_job_items
         SET status = 'running', attempts = 1, started_at = datetime('now')
       WHERE job_id = ?
    `).run(job.job_id)

    const completed = await resumeEmbeddingJob({ job_id: job.job_id, workspace_id: 'ws_1', batch_size: 1, embedder })

    expect(completed.status).toBe('completed')
    expect(completed.progress).toMatchObject({ embedded: 1, running: 0, pending: 0 })
    expect(embedder.calls).toBe(1)
  })

  it('clears stale cancellation state before resuming a cancelled job', async () => {
    seedMemory('mem_cancelled', 'cancelled body')
    const embedder = new CountingEmbedder()
    const job = createEmbeddingJob({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memories',
      provider: 'local',
      model: 'test-model',
      requested_device: 'auto',
      dimensions: 1024,
    })
    cancelEmbeddingJob({ job_id: job.job_id, workspace_id: 'ws_1' })

    const completed = await resumeEmbeddingJob({ job_id: job.job_id, workspace_id: 'ws_1', batch_size: 1, embedder })

    expect(completed.status).toBe('completed')
    expect(completed.progress).toMatchObject({ embedded: 1, pending: 0 })
    const row = getDb().prepare('SELECT cancel_requested_at FROM embedding_jobs WHERE job_id = ?').get(job.job_id) as { cancel_requested_at: string | null }
    expect(row.cancel_requested_at).toBeNull()
  })
})
