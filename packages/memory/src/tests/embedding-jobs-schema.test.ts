import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { appendRagJobEvent, createEmbeddingJob, getEmbeddingJob, listEmbeddingJobItems, listRagJobEvents, runEmbeddingJob } from '../l2/embedding-jobs.js'
import { writeVectorMetadata } from '../l2/vector-metadata.js'
import type { EmbeddingProviderLike } from '../l2/embedding-jobs.js'
import { contentHash } from '../dedup.js'

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

describe('embedding job ledger schema and mappers', () => {
  it('creates workspace-scoped jobs, items, and redacted event rows', () => {
    seedMemory('mem_1', 'schema mapper body')

    const job = createEmbeddingJob({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memories',
      provider: 'local',
      model: 'test-model',
      requested_device: 'auto',
      dimensions: 1024,
    })

    appendRagJobEvent({
      job_id: job.job_id,
      workspace_id: 'ws_1',
      event_type: 'progress',
      message: 'saw token=super-secret-value',
      details: { api_key: 'secret-value', safe: 'kept' },
    })

    const read = getEmbeddingJob({ job_id: job.job_id, workspace_id: 'ws_1' })
    const items = listEmbeddingJobItems({ job_id: job.job_id, workspace_id: 'ws_1' })
    const events = listRagJobEvents({ job_id: job.job_id, workspace_id: 'ws_1' })

    expect(read.job_id).toBe(job.job_id)
    expect(read.preflight_counts).toMatchObject({ scanned: 1, pending: 1 })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      source_id: 'mem_1',
      source_content_hash: contentHash('schema mapper body'),
      requested_model: 'test-model',
      status: 'pending',
    })
    expect(events[0]?.details).toEqual({ api_key: '[REDACTED]', safe: 'kept' })
  })

  it('records current rows as skipped job items so status remains inspectable', async () => {
    seedMemory('mem_current', 'already embedded body')
    writeVectorMetadata({
      workspace_id: 'ws_1',
      source_domain: 'memory',
      source_id: 'mem_current',
      content_hash: contentHash('already embedded body'),
      provider: 'local',
      model: 'test-model',
      requested_device: 'auto',
      actual_device: 'cpu',
      dimensions: 1024,
      vector_table: 'vec_memories',
      status: 'current',
    })

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
    expect(items[0]).toMatchObject({ source_id: 'mem_current', status: 'skipped' })

    const result = await runEmbeddingJob({
      job_id: job.job_id,
      workspace_id: 'ws_1',
      embedder: {
        dimensions: 1024,
        actualDevice: 'cpu',
        async embed(): Promise<Float32Array> {
          throw new Error('current rows should not embed')
        },
      } satisfies EmbeddingProviderLike,
    })

    expect(result.status).toBe('completed')
    expect(result.progress).toMatchObject({ total: 1, skipped: 1, embedded: 0 })
  })

  it('keeps non-allow-empty jobs failed when resumed', async () => {
    const job = createEmbeddingJob({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memories',
      provider: 'local',
      model: 'test-model',
      requested_device: 'auto',
      dimensions: 1024,
    })

    expect(job.status).toBe('failed')

    const result = await runEmbeddingJob({
      job_id: job.job_id,
      workspace_id: 'ws_1',
      embedder: {
        dimensions: 1024,
        actualDevice: 'cpu',
        async embed(): Promise<Float32Array> {
          throw new Error('empty job should not embed')
        },
      } satisfies EmbeddingProviderLike,
    })

    expect(result.status).toBe('failed')
    expect(result.progress.total).toBe(0)
  })
})
