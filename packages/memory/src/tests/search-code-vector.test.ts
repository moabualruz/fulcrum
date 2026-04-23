import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initEmbedding, registerEmbeddingProvider, resetProviders } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { indexCodeFile, storeChunkEmbedding } from '../l2/code.js'
import { searchCode } from '../retrieval/search-code.js'

const DIM = 1024

class ZeroTextProvider {
  dimensions = DIM
  provider = 'roadmap-text'
  model = 'zero'
  actualDevice = 'cpu'
  async warmUp(): Promise<void> {}
  async embed(text: string): Promise<Float32Array> { return this.embedDocument(text) }
  async embedDocument(_text: string): Promise<Float32Array> {
    return new Float32Array(DIM)
  }
}

class IntentCodeProvider {
  dimensions = DIM
  provider = 'roadmap-code'
  model = 'intent'
  actualDevice = 'cpu'
  async warmUp(): Promise<void> {}
  async embed(text: string): Promise<Float32Array> { return this.embedDocument(text) }
  async embedQuery(text: string): Promise<Float32Array> { return this.embedDocument(text) }
  async embedDocument(text: string): Promise<Float32Array> {
    const vec = new Float32Array(DIM)
    const normalized = text.toLowerCase()
    if (/(retry|failed|failure|resume|degraded|embedding|job|items)/.test(normalized)) vec[0] = 1
    if (/(palette|color|swatch|render)/.test(normalized)) vec[1] = 1
    return vec
  }
}

async function installEmbedders(): Promise<void> {
  registerEmbeddingProvider('roadmap-text-zero', () => new ZeroTextProvider())
  registerEmbeddingProvider('roadmap-code-intent', () => new IntentCodeProvider())
  await initEmbedding({
    workspace_id: 'ws_code_vec',
    project_id: 'proj_code_vec',
    port: 0,
    embedding: {
      text: { provider: 'roadmap-text-zero' as 'custom', model: 'zero' },
      code: { provider: 'roadmap-code-intent' as 'custom', model: 'intent' },
    },
    reranker: { provider: 'custom', model: 'none' },
    policy: { wip_limit: 0, wip_limit_per_role: {}, heartbeat_timeout_minutes: 0, escalation_timeout_minutes: 0 },
  })
}

describe('searchCode vector retrieval over vec_chunks', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(async () => {
    db = createTestDb()
    seedWorkspaceAndProject(db, 'ws_code_vec', 'proj_code_vec')
    await installEmbedders()
  })

  afterEach(() => {
    resetProviders()
    resetTestDb()
  })

  it('returns semantic vec_chunks matches even when FTS tokens do not match', async () => {
    const target = await indexCodeFile({
      workspace_id: 'ws_code_vec',
      project_id: 'proj_code_vec',
      rel_path: 'packages/memory/src/l2/embedding-jobs.ts',
      content: 'export function resumeDegradedEmbeddingBatches() {\n  return "partial failure recovery"\n}\n',
      language: 'typescript',
    }, db)
    const decoy = await indexCodeFile({
      workspace_id: 'ws_code_vec',
      project_id: 'proj_code_vec',
      rel_path: 'packages/monitor/src/theme.ts',
      content: 'export function renderPaletteSwatches() {\n  return ["blue", "green"]\n}\n',
      language: 'typescript',
    }, db)

    for (const chunk of [...target.chunks, ...decoy.chunks]) {
      const result = await storeChunkEmbedding(db, chunk.chunk_id, chunk.content)
      expect(result.status).toBe('embedded')
    }

    const out = await searchCode({
      workspace_id: 'ws_code_vec',
      project_id: 'proj_code_vec',
      text: 'retry failed job items',
      explain: true,
      limit: 5,
    }, db)

    expect(out.results[0]?.rel_path).toBe('packages/memory/src/l2/embedding-jobs.ts')
    expect(out.results[0]?.stage_contributions.map(stage => stage.stage)).toContain('code_vector')
    expect(out.results[0]?.explanation?.stage_ranks['code_vector']).toBeGreaterThan(0)
    expect(out.skipped_stages ?? []).not.toContainEqual(expect.objectContaining({ stage: 'code_vector' }))
  })

  it('ignores stale code chunks even when leftover vec_chunks rows still exist', async () => {
    const target = await indexCodeFile({
      workspace_id: 'ws_code_vec',
      project_id: 'proj_code_vec',
      rel_path: 'packages/memory/src/l2/stale-vector.ts',
      content: 'export function resumeStaleEmbeddingBatches() {\n  return "partial failure recovery"\n}\n',
      language: 'typescript',
    }, db)
    const chunk = target.chunks[0]!
    const result = await storeChunkEmbedding(db, chunk.chunk_id, chunk.content)
    expect(result.status).toBe('embedded')
    db.prepare(`
      UPDATE code_chunks
         SET vector_status = 'stale'
       WHERE chunk_id = ?
    `).run(chunk.chunk_id)

    const out = await searchCode({
      workspace_id: 'ws_code_vec',
      project_id: 'proj_code_vec',
      text: 'retry failed job items',
      explain: true,
      limit: 5,
    }, db)

    expect(out.results.map(row => row.chunk_id)).not.toContain(chunk.chunk_id)
    expect(out.reason).toBe('no_match')
  })
})
