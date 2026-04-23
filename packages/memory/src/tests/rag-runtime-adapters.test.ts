import { describe, expect, it } from 'vitest'
import {
  disabledRuntimeAdapterStatus,
  sanitizeRuntimeAdapterDescriptor,
} from '../runtime/adapters.js'
import type {
  CodeIndexerAdapter,
  GraphStoreAdapter,
  ModelRuntimeAdapter,
  RuntimeAdapterAvailability,
  VectorStoreAdapter,
} from '../runtime/adapters.js'

describe('optional RAG runtime adapter boundaries', () => {
  it('reports unavailable optional adapters as disabled/out_of_scope without breaking baseline', () => {
    const status = disabledRuntimeAdapterStatus({
      adapter_kind: 'vector_store',
      adapter_name: 'remote-vector',
      reason: 'optional adapter not configured',
      details: {
        db_path: '/home/alice/.fulcrum/vector-cache',
        api_key: 'sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    })

    expect(status).toMatchObject({
      status: 'disabled',
      scope: 'out_of_scope',
      local_baseline_impact: 'none',
      adapter_kind: 'vector_store',
      adapter_name: 'remote-vector',
    })
    expect(JSON.stringify(status)).not.toContain('/home/alice')
    expect(JSON.stringify(status)).not.toContain('sk-proj-')
    expect(JSON.stringify(status)).toContain('[REDACTED_PATH:sha256:')
  })

  it('keeps adapter contracts at runtime boundaries, not task/run/policy ownership', async () => {
    const available = async (): Promise<RuntimeAdapterAvailability> => ({
      status: 'available',
      scope: 'local_baseline',
      local_baseline_impact: 'none',
    })

    const vector: VectorStoreAdapter = {
      kind: 'vector_store',
      name: 'sqlite-vec',
      optional: false,
      availability: available,
      upsert: async () => ({ written: 1, skipped: 0 }),
      query: async () => [{ id: 'chunk_1', score: 0.9, metadata: { source_domain: 'code_chunk' } }],
      delete: async () => ({ deleted: 1 }),
    }
    const graph: GraphStoreAdapter = {
      kind: 'graph_store',
      name: 'kuzu',
      optional: true,
      availability: available,
      upsertEntities: async () => ({ entities_written: 1, edges_written: 0 }),
      expand: async () => ({ entities: [], edges: [] }),
    }
    const code: CodeIndexerAdapter = {
      kind: 'code_indexer',
      name: 'tree-sitter',
      optional: false,
      availability: available,
      indexProject: async () => ({ files_seen: 1, chunks_written: 1, skipped: 0, failures: [] }),
    }
    const model: ModelRuntimeAdapter = {
      kind: 'model_runtime',
      name: 'local-embedder',
      optional: true,
      availability: available,
      embed: async () => ({ vectors: [new Float32Array([0.1, 0.2])], dimensions: 2, runtime_truth: { actual_provider: 'local' } }),
      rerank: async () => [{ id: 'chunk_1', score: 1 }],
    }

    expect(await vector.availability()).toMatchObject({ status: 'available' })
    expect(await graph.expand({ workspace_id: 'ws_1', project_id: 'proj_1', seed_entity_ids: [] })).toEqual({ entities: [], edges: [] })
    expect(await code.indexProject({ workspace_id: 'ws_1', project_id: 'proj_1' })).toMatchObject({ chunks_written: 1 })
    expect((await model.embed({ texts: ['hello'] })).dimensions).toBe(2)

    for (const adapter of [vector, graph, code, model]) {
      const keys = Object.keys(adapter)
      expect(keys).not.toContain('startAgentRun')
      expect(keys).not.toContain('completeAgentRun')
      expect(keys).not.toContain('checkPolicy')
      expect(keys).not.toContain('writeMemory')
    }
  })

  it('redacts adapter descriptors before reports or persistence', () => {
    const descriptor = sanitizeRuntimeAdapterDescriptor({
      kind: 'model_runtime',
      name: 'candidate',
      config: {
        model_path: '/Users/alice/models/private-model.gguf',
        token: 'ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        env: { OPENAI_API_KEY: 'sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      },
    })

    const json = JSON.stringify(descriptor)
    expect(json).not.toContain('/Users/alice')
    expect(json).not.toContain('ghp_')
    expect(json).not.toContain('sk-proj-')
    expect(json).toContain('[REDACTED_PATH:sha256:')
  })
})
