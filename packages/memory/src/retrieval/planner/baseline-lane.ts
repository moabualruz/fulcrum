import { getCodeEmbedder, getTextEmbedder } from 'fulcrum-agent-core'
import type { Db } from 'fulcrum-agent-core'
import { redactRoadmapArtifact } from '../../setup/rag-redaction.js'

export interface BaselineSemanticRanks {
  memory: Map<string, number>
  code: Map<string, number>
  skipped_stages: Array<{ stage: string; reason: string }>
}

export interface LoadBaselineSemanticRanksInput {
  query: string
  workspace_id: string
  project_id: string
  limit: number
}

export async function loadBaselineSemanticRanks(
  input: LoadBaselineSemanticRanksInput,
  db: Db,
): Promise<BaselineSemanticRanks> {
  const memory = await loadMemorySemanticRanks(input, db)
  const code = await loadCodeSemanticRanks(input, db)

  if (memory.skipped_reason || code.skipped_reason) {
    const reasons = [memory.skipped_reason, code.skipped_reason].filter((reason): reason is string => Boolean(reason))
    if (memory.ranks.size === 0 && code.ranks.size === 0) {
      return {
        memory: memory.ranks,
        code: code.ranks,
        skipped_stages: [{ stage: 'semantic', reason: reasons[0] ?? 'no current semantic candidates' }],
      }
    }
  }

  return {
    memory: memory.ranks,
    code: code.ranks,
    skipped_stages: memory.ranks.size === 0 && code.ranks.size === 0
      ? [{ stage: 'semantic', reason: 'no current semantic candidates' }]
      : [],
  }
}

async function loadMemorySemanticRanks(
  input: LoadBaselineSemanticRanksInput,
  db: Db,
): Promise<{ ranks: Map<string, number>; skipped_reason?: string }> {
  const embedder = getTextEmbedder()
  if (!embedder) return { ranks: new Map(), skipped_reason: 'no text embedder registered' }
  try {
    const embedFn = ((embedder as { embedQuery?: (text: string) => Promise<Float32Array> }).embedQuery ?? embedder.embed).bind(embedder)
    const queryVec = await embedFn(input.query)
    const buf = Buffer.from(queryVec.buffer, queryVec.byteOffset, queryVec.byteLength)
    const rows = db.prepare(`
      SELECT v.memory_id, row_number() OVER (ORDER BY v.distance) AS vecRank
        FROM vec_memories v
        JOIN memories m ON m.memory_id = v.memory_id
        JOIN vector_metadata vm
          ON vm.workspace_id = m.workspace_id
         AND vm.source_domain = 'memory'
         AND vm.source_id = m.memory_id
         AND vm.vector_table = 'vec_memories'
         AND vm.status = 'current'
       WHERE v.embedding MATCH ?
         AND k = ?
         AND m.workspace_id = ?
         AND (m.project_id = ? OR m.project_id IS NULL)
       ORDER BY v.distance
       LIMIT ?
    `).all(buf, input.limit, input.workspace_id, input.project_id, input.limit) as Array<{ memory_id: string; vecRank: number }>
    return { ranks: new Map(rows.map(row => [row.memory_id, row.vecRank])) }
  } catch (err) {
    return { ranks: new Map(), skipped_reason: `vec_memories unavailable: ${redactRoadmapArtifact(err instanceof Error ? err.message : String(err))}` }
  }
}

async function loadCodeSemanticRanks(
  input: LoadBaselineSemanticRanksInput,
  db: Db,
): Promise<{ ranks: Map<string, number>; skipped_reason?: string }> {
  const embedder = getCodeEmbedder()
  if (!embedder) return { ranks: new Map(), skipped_reason: 'no code embedder registered' }
  try {
    const embedFn = ((embedder as { embedQuery?: (text: string) => Promise<Float32Array> }).embedQuery ?? embedder.embed).bind(embedder)
    const queryVec = await embedFn(input.query)
    const buf = Buffer.from(queryVec.buffer, queryVec.byteOffset, queryVec.byteLength)
    const rows = db.prepare(`
      SELECT v.chunk_id, row_number() OVER (ORDER BY v.distance) AS vecRank
        FROM vec_chunks v
        JOIN code_chunks c ON c.chunk_id = v.chunk_id
        JOIN vector_metadata vm
          ON vm.workspace_id = c.workspace_id
         AND vm.source_domain = 'code_chunk'
         AND vm.source_id = c.chunk_id
         AND vm.vector_table = 'vec_chunks'
         AND vm.status = 'current'
       WHERE v.embedding MATCH ?
         AND k = ?
         AND c.workspace_id = ?
         AND c.project_id = ?
         AND COALESCE(c.vector_status, 'legacy') = 'current'
       ORDER BY v.distance
       LIMIT ?
    `).all(buf, input.limit, input.workspace_id, input.project_id, input.limit) as Array<{ chunk_id: string; vecRank: number }>
    return { ranks: new Map(rows.map(row => [row.chunk_id, row.vecRank])) }
  } catch (err) {
    return { ranks: new Map(), skipped_reason: `vec_chunks unavailable: ${redactRoadmapArtifact(err instanceof Error ? err.message : String(err))}` }
  }
}
