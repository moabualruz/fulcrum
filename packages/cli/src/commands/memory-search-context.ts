import type { Db, FulcrumConfig } from 'fulcrum-agent-core'

export interface MemorySearchContextCommandInput {
  query: string
  workspace_id: string
  project_id: string
  limit?: number
  context_budget_tokens?: number
  explain?: boolean
  persist?: boolean
  include_graph?: boolean
  graph_mode?: 'local' | 'global_summary' | 'drift'
  graph_depth?: number
}

function shouldFailClosedOnEmbeddingInit(config: FulcrumConfig): boolean {
  return [
    config.embedding.text.device,
    config.embedding.code?.device,
    config.reranker.device,
  ].some((device) => device !== undefined && device !== 'auto')
}

function hasCurrentSemanticVectors(input: MemorySearchContextCommandInput, db: Db): boolean {
  try {
    const row = db.prepare(`
      SELECT 1
        FROM vector_metadata
       WHERE workspace_id = ?
         AND status = 'current'
         AND vector_table IN ('vec_memories', 'vec_chunks')
       LIMIT 1
    `).get(input.workspace_id)
    return Boolean(row)
  } catch {
    return false
  }
}

async function warmSearchContextEmbedding(input: MemorySearchContextCommandInput, db: Db): Promise<void> {
  if (!hasCurrentSemanticVectors(input, db)) return
  const { getTextEmbedder, initEmbedding, loadConfig } = await import('fulcrum-agent-core')
  if (getTextEmbedder()) return
  const config = loadConfig()
  try {
    await initEmbedding(config)
  } catch (err) {
    if (shouldFailClosedOnEmbeddingInit(config)) throw err
  }
}

export async function executeMemorySearchContextCommand(input: MemorySearchContextCommandInput, db?: Db): Promise<unknown> {
  const effectiveDb = db ?? (await import('fulcrum-agent-core')).getDb()
  await warmSearchContextEmbedding(input, effectiveDb)
  const { searchContext } = await import('fulcrum-memory')
  return searchContext(input, effectiveDb)
}
