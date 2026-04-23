import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initEmbedding, registerEmbeddingProvider, resetProviders } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { indexCodeFile, storeChunkEmbedding } from '../l2/code.js'

const DIM = 1024

const calls = {
  text: 0,
  code: 0,
}

class CountingProvider {
  dimensions = DIM
  actualDevice = 'cpu'
  constructor(
    public readonly provider: string,
    public readonly model: string,
    private readonly counter: 'text' | 'code',
  ) {}
  async warmUp(): Promise<void> {}
  async embed(text: string): Promise<Float32Array> { return this.embedDocument(text) }
  async embedDocument(text: string): Promise<Float32Array> {
    calls[this.counter] += 1
    const vec = new Float32Array(DIM)
    vec[0] = this.counter === 'code' ? 1 : 0
    vec[1] = text.length
    return vec
  }
}

async function installCountingEmbedders(): Promise<void> {
  calls.text = 0
  calls.code = 0
  registerEmbeddingProvider('roadmap-count-text', () => new CountingProvider('roadmap-count-text', 'text-model', 'text'))
  registerEmbeddingProvider('roadmap-count-code', () => new CountingProvider('roadmap-count-code', 'code-model', 'code'))
  await initEmbedding({
    workspace_id: 'ws_code_embedder',
    project_id: 'proj_code_embedder',
    port: 0,
    embedding: {
      text: { provider: 'roadmap-count-text' as 'custom', model: 'text-model' },
      code: { provider: 'roadmap-count-code' as 'custom', model: 'code-model' },
    },
    reranker: { provider: 'custom', model: 'none' },
    policy: { wip_limit: 0, wip_limit_per_role: {}, heartbeat_timeout_minutes: 0, escalation_timeout_minutes: 0 },
  })
}

describe('code chunk embedder selection', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(async () => {
    db = createTestDb()
    seedWorkspaceAndProject(db, 'ws_code_embedder', 'proj_code_embedder')
    await installCountingEmbedders()
  })

  afterEach(() => {
    resetProviders()
    resetTestDb()
  })

  it('stores code chunk embeddings through getCodeEmbedder and records structured vector status', async () => {
    const indexed = await indexCodeFile({
      workspace_id: 'ws_code_embedder',
      project_id: 'proj_code_embedder',
      rel_path: 'packages/memory/src/l2/code.ts',
      content: 'export function storeChunkEmbeddingRoadmap() { return true }\n',
      language: 'typescript',
    }, db)

    const chunk = indexed.chunks[0]!
    const result = await storeChunkEmbedding(db, chunk.chunk_id, chunk.content)

    expect(result).toMatchObject({
      status: 'embedded',
      chunk_id: chunk.chunk_id,
      vector_row_verified: true,
      metadata_verified: true,
    })
    expect(calls.text).toBe(0)
    expect(calls.code).toBeGreaterThan(0)

    const chunkRow = db.prepare(`
      SELECT vector_status, parse_status
        FROM code_chunks
       WHERE chunk_id = ?
    `).get(chunk.chunk_id) as { vector_status: string; parse_status: string }
    expect(chunkRow).toEqual({ vector_status: 'current', parse_status: 'parsed' })

    const metadata = db.prepare(`
      SELECT source_domain, source_id, provider, model, status
        FROM vector_metadata
       WHERE source_domain = 'code_chunk' AND source_id = ?
       ORDER BY embedded_at DESC
       LIMIT 1
    `).get(chunk.chunk_id) as { source_domain: string; source_id: string; provider: string; model: string; status: string }
    expect(metadata).toMatchObject({
      source_domain: 'code_chunk',
      source_id: chunk.chunk_id,
      provider: 'roadmap-count-code',
      model: 'code-model',
      status: 'current',
    })
  })
})
