import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { createEmbeddingJob, getEmbeddingJobStatus, listEmbeddingJobItems, runEmbeddingJob } from '../l2/embedding-jobs.js'

class RuntimeTruthEmbedder {
  dimensions = 1024
  provider = 'actual-provider'
  model = 'actual-model'
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
  db.prepare(`
    INSERT INTO memories (
      memory_id, workspace_id, project_id, kind, scope, content, content_hash,
      schema_version, vault_path, title, summary, entities, provenance
    ) VALUES (
      'mem_runtime_truth', 'ws_1', 'proj_1', 'fact', 'project',
      'runtime truth source', 'hash-runtime',
      3, 'curated/pages/mem_runtime_truth.md', 'runtime', 'runtime', '[]', '{}'
    )
  `).run()
})

afterEach(() => {
  resetTestDb()
})

describe('embedding runtime truth', () => {
  it('persists actual provider/model/device/dimensions when embedding succeeds', async () => {
    const job = createEmbeddingJob({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memories',
      provider: 'actual-provider',
      model: 'actual-model',
      requested_device: 'auto',
      dimensions: 1024,
    })

    await runEmbeddingJob({ job_id: job.job_id, workspace_id: 'ws_1', embedder: new RuntimeTruthEmbedder() })
    const item = listEmbeddingJobItems({ job_id: job.job_id, workspace_id: 'ws_1' })[0]!
    const metadata = getDb().prepare('SELECT * FROM vector_metadata WHERE source_id = ?').get('mem_runtime_truth') as Record<string, unknown>

    expect(item).toMatchObject({
      actual_provider: 'actual-provider',
      actual_model: 'actual-model',
      actual_device: 'cpu',
      dimensions: 1024,
      status: 'embedded',
    })
    expect(metadata).toMatchObject({
      actual_provider: 'actual-provider',
      actual_model: 'actual-model',
      actual_device: 'cpu',
      dimensions: 1024,
      status: 'current',
    })
  })

  it('fails closed when an explicit device mismatches runtime device', async () => {
    const job = createEmbeddingJob({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      source_domain: 'memories',
      provider: 'actual-provider',
      model: 'actual-model',
      requested_device: 'cuda',
      dimensions: 1024,
    })

    await runEmbeddingJob({ job_id: job.job_id, workspace_id: 'ws_1', embedder: new RuntimeTruthEmbedder() })
    const status = getEmbeddingJobStatus({ job_id: job.job_id, workspace_id: 'ws_1' })
    const item = listEmbeddingJobItems({ job_id: job.job_id, workspace_id: 'ws_1' })[0]!

    expect(status.status).toBe('degraded')
    expect(item.status).toBe('failed')
    expect(item.error_message).toContain('requested device cuda but embedding runtime used cpu')
  })
})
