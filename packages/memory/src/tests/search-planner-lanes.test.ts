import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initEmbedding, registerEmbeddingProvider, resetProviders } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { storeChunkEmbedding } from '../l2/code.js'
import { storeEmbeddingInVec } from '../l2/embed.js'
import { searchContext } from '../retrieval/search-context.js'
import { writeVectorMetadata } from '../l2/vector-metadata.js'

const DIM = 1024

class IntentTextProvider {
  dimensions = DIM
  provider = 'roadmap-text'
  model = 'intent'
  actualDevice = 'cpu'

  async warmUp(): Promise<void> {}
  async embed(text: string): Promise<Float32Array> { return this.embedDocument(text) }
  async embedQuery(text: string): Promise<Float32Array> { return this.embedDocument(text) }
  async embedDocument(text: string): Promise<Float32Array> {
    const vec = new Float32Array(DIM)
    const normalized = text.toLowerCase()
    if (/(retry|failed|job|items|resume|degraded|embedding|batch)/.test(normalized)) vec[0] = 1
    if (/(palette|color|swatch|render)/.test(normalized)) vec[1] = 1
    return vec
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
    if (/(retry|failed|job|items|resume|degraded|embedding|batch)/.test(normalized)) vec[0] = 1
    if (/(palette|color|swatch|render)/.test(normalized)) vec[1] = 1
    return vec
  }
}

async function installEmbedders(): Promise<void> {
  registerEmbeddingProvider('roadmap-text-intent', () => new IntentTextProvider())
  registerEmbeddingProvider('roadmap-code-intent', () => new IntentCodeProvider())
  await initEmbedding({
    workspace_id: 'ws_lane',
    project_id: 'proj_lane',
    port: 0,
    embedding: {
      text: { provider: 'roadmap-text-intent' as 'custom', model: 'intent' },
      code: { provider: 'roadmap-code-intent' as 'custom', model: 'intent' },
    },
    reranker: { provider: 'custom', model: 'none' },
    policy: { wip_limit: 0, wip_limit_per_role: {}, heartbeat_timeout_minutes: 0, escalation_timeout_minutes: 0 },
  })
}

describe('search planner baseline lanes', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(async () => {
    db = createTestDb()
    seedWorkspaceAndProject(db, 'ws_lane', 'proj_lane')
    await installEmbedders()
  })

  afterEach(() => {
    resetProviders()
    resetTestDb()
  })

  it('returns semantic memory candidates through unified search when lexical overlap is weak', async () => {
    db.prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, title, summary, entities, provenance, freshness
      ) VALUES (
        'mem_semantic_lane', 'ws_lane', 'proj_lane', 'fact', 'project',
        'Resume degraded embedding batches to recover partial failures.',
        'hash-mem-semantic-lane', 3, 'Embedding batch recovery', 'semantic recovery', '[]', '{}', 0.9
      )
    `).run()
    await storeEmbeddingInVec(db, 'mem_semantic_lane', 'Resume degraded embedding batches to recover partial failures.')
    writeVectorMetadata({
      workspace_id: 'ws_lane',
      source_domain: 'memory',
      source_id: 'mem_semantic_lane',
      content_hash: 'hash-mem-semantic-lane',
      provider: 'local',
      model: 'intent',
      requested_device: 'auto',
      actual_device: 'cpu',
      dimensions: DIM,
      vector_table: 'vec_memories',
      status: 'current',
    })

    const response = await searchContext({
      query: 'retry failed job items',
      workspace_id: 'ws_lane',
      project_id: 'proj_lane',
      limit: 5,
      explain: true,
      persist: true,
    }, db)

    expect(response.results[0]?.source_ref.source_id).toBe('mem_semantic_lane')
    expect(response.results[0]?.stage_contributions.map(stage => stage.stage)).toContain('semantic')
    expect(response.skipped_stages).not.toContainEqual(expect.objectContaining({ stage: 'semantic' }))
    const trace = db.prepare('SELECT runtime_truth FROM rag_query_traces WHERE query_trace_id = ?')
      .get(response.query_trace_id) as { runtime_truth: string }
    expect(JSON.parse(trace.runtime_truth)).toMatchObject({
      model_calls: 2,
      retrieval: 'sqlite-lexical-contextual-semantic',
    })
  })

  it('returns semantic code candidates through unified search when lexical overlap is weak', async () => {
    db.prepare(`
      INSERT INTO code_files (
        file_id, workspace_id, project_id, rel_path, language, sha256,
        mtime_ns, size_bytes, chunks_count, indexed_at
      ) VALUES (
        'file_semantic_lane', 'ws_lane', 'proj_lane', 'packages/memory/src/l2/embedding-jobs.ts',
        'typescript', 'sha-code-semantic', 0, 100, 1, 0
      )
    `).run()
    db.prepare(`
      INSERT INTO code_chunks (
        chunk_id, workspace_id, project_id, file_path, file_id,
        chunk_strategy, source_type, content, content_hash, start_line, end_line, symbol_path, vector_status
      ) VALUES (
        'chunk_semantic_lane', 'ws_lane', 'proj_lane', 'packages/memory/src/l2/embedding-jobs.ts', 'file_semantic_lane',
        'syntax', 'code', 'export function resumeDegradedEmbeddingBatches() { return "partial failure recovery" }',
        'hash-code-semantic-lane', 10, 10, 'resumeDegradedEmbeddingBatches', 'current'
      )
    `).run()
    const result = await storeChunkEmbedding(
      db,
      'chunk_semantic_lane',
      'export function resumeDegradedEmbeddingBatches() { return "partial failure recovery" }',
    )
    expect(result.status).toBe('embedded')

    const response = await searchContext({
      query: 'retry failed job items',
      workspace_id: 'ws_lane',
      project_id: 'proj_lane',
      limit: 5,
      explain: true,
    }, db)

    const codeHit = response.results.find(result => result.source_ref.source_id === 'chunk_semantic_lane')
    expect(codeHit?.type).toBe('code_chunk')
    expect(codeHit?.stage_contributions.map(stage => stage.stage)).toContain('semantic')
  })
})
