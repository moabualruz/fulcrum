import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { createEmbeddingJob, listRagJobEvents, runEmbeddingJob } from '../l2/embedding-jobs.js'
import type { EmbeddingProviderLike } from '../l2/embedding-jobs.js'
import { resolveEmbeddingRuntimeDevice } from '../l2/embed.js'
import { contentHash } from '../dedup.js'

class DeviceEmbedder implements EmbeddingProviderLike {
  dimensions = 1024

  constructor(readonly actualDevice: string) {}

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

describe('embedding runtime device reporting', () => {
  it('records auto fallback as requested and actual device fields', async () => {
    seedMemory('mem_1', 'device body')
    const job = createEmbeddingJob({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memories',
      provider: 'local',
      model: 'test-model',
      requested_device: 'auto',
      dimensions: 1024,
    })

    const result = await runEmbeddingJob({ job_id: job.job_id, workspace_id: 'ws_1', embedder: new DeviceEmbedder('cpu') })

    expect(result.status).toBe('completed')
    expect(listRagJobEvents({ job_id: job.job_id, workspace_id: 'ws_1' })).toContainEqual(
      expect.objectContaining({
        event_type: 'fallback',
        details: { requested_device: 'auto', actual_device: 'cpu' },
      }),
    )
  })

  it('fails closed when an explicit requested device differs from actual runtime device', async () => {
    expect(() => resolveEmbeddingRuntimeDevice({ actualDevice: 'cpu' }, 'cuda')).toThrow(/requested device cuda/)

    seedMemory('mem_2', 'device mismatch body')
    const job = createEmbeddingJob({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memories',
      provider: 'local',
      model: 'test-model',
      requested_device: 'cuda',
      dimensions: 1024,
    })

    const result = await runEmbeddingJob({ job_id: job.job_id, workspace_id: 'ws_1', embedder: new DeviceEmbedder('cpu') })

    expect(result.status).toBe('degraded')
    expect(result.progress.failed).toBe(1)
  })
})
