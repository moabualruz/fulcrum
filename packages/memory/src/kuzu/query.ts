// packages/memory/src/kuzu/query.ts
import type { KuzuClient } from './client.js'

export interface L2QueryInput {
  query: string
  queryVector: Float32Array
  queryEntityIds: string[]
  workspaceId: string
  limit?: number   // default 10
}

export interface ScoredMemoryId {
  id: string
  score: number
  vscore: number
  graphScore: number
}

interface RawMemoryRow {
  id: string
  workspace_id: string
  importance: number
  freshness: number
  created_at: string
}

function recency(createdAt: string): number {
  const daysOld = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
  return Math.exp(-daysOld / 30 * Math.log(2))  // half-life 30 days
}

function workspaceAffinity(memWorkspaceId: string, queryWorkspaceId: string): number {
  return memWorkspaceId === queryWorkspaceId ? 1.0 : 0.0
}

function fuseScore(
  mem: RawMemoryRow,
  vscore: number,
  graphScore: number,
  queryWorkspaceId: string,
  isContradicted: boolean = false
): number {
  return (
    1.0 * vscore
    + 0.8 * graphScore
    + 0.3 * (mem.importance ?? 0.5)
    + 0.2 * recency(mem.created_at)
    + 0.25 * workspaceAffinity(mem.workspace_id, queryWorkspaceId)
    - (isContradicted ? 0.6 : 0.0)
  )
}

// MMR diversification (λ=0.7) — reduce to k from 3k candidates
function mmrDiversify(
  candidates: ScoredMemoryId[],
  k: number,
  lambda: number = 0.7
): ScoredMemoryId[] {
  if (candidates.length <= k) return candidates

  const selected: ScoredMemoryId[] = []
  const remaining = [...candidates]

  while (selected.length < k && remaining.length > 0) {
    // For now use score directly (full MMR requires embedding cosine between candidates)
    // Score = λ × relevance_score - (1-λ) × max_similarity_to_selected
    // Without candidate embeddings in memory, we use score ordering as approximation
    // A real implementation would pass candidate embeddings through
    remaining.sort((a, b) => b.score - a.score)
    selected.push(remaining.shift()!)
  }

  return selected
}

export async function queryMemoriesL2(
  client: KuzuClient,
  input: L2QueryInput
): Promise<ScoredMemoryId[]> {
  const limit = input.limit ?? 10
  const seedLimit = 40
  const graphLimit = 60
  const hopLimit = 40

  const scoreMap = new Map<string, { mem: RawMemoryRow; vscore: number; graphScore: number }>()

  // Stage 2 — Vector seed (HNSW)
  const vectorCandidates = await client.query<{ m: RawMemoryRow; distance: number }>(
    `CALL QUERY_VECTOR_INDEX('Memory', 'memory_embedding_idx', $query_vec, ${seedLimit})
     YIELD node AS m, distance
     RETURN m, distance`,
    { query_vec: Array.from(input.queryVector) }
  ).catch(() => [] as { m: RawMemoryRow; distance: number }[])  // fallback if index empty

  for (const row of vectorCandidates) {
    const vscore = 1 - row.distance
    const existing = scoreMap.get(row.m.id)
    if (!existing) {
      scoreMap.set(row.m.id, { mem: row.m, vscore, graphScore: 0 })
    } else {
      existing.vscore = Math.max(existing.vscore, vscore)
    }
  }

  if (input.queryEntityIds.length > 0) {
    // Stage 3 — 1-hop graph expansion from query entities
    const oneHopRows = await client.query<{ m: RawMemoryRow; w: number }>(
      `MATCH (e:Entity)-[r:ABOUT|CRITIQUES|AVOIDS|MENTIONS|USES]-(m:Memory)
       WHERE e.id IN $query_entity_ids
       RETURN m, r.weight AS w
       ORDER BY w DESC LIMIT ${graphLimit}`,
      { query_entity_ids: input.queryEntityIds }
    ).catch(() => [])

    for (const row of oneHopRows) {
      const weight = row.w ?? 0.5
      const existing = scoreMap.get(row.m.id)
      if (!existing) {
        scoreMap.set(row.m.id, { mem: row.m, vscore: 0, graphScore: weight })
      } else {
        existing.graphScore += weight
      }
    }

    // Stage 4 — 2-hop expansion via Entity→Entity
    const alreadySeen = [...scoreMap.keys()]
    const twoHopRows = await client.query<{ m: RawMemoryRow; path_weight: number }>(
      `MATCH (e1:Entity)-[r1:RELATED_TO|PART_OF|IS_A]-(e2:Entity)
             -[r2:ABOUT|CRITIQUES|AVOIDS|RECOMMENDS]-(m:Memory)
       WHERE e1.id IN $query_entity_ids
         AND r1.weight > 0.4
         AND NOT m.id IN $already_seen
       RETURN m,
         reduce(w=1.0, r IN [r1.weight, r2.weight] | w * r) * 0.49 AS path_weight
       ORDER BY path_weight DESC LIMIT ${hopLimit}`,
      { query_entity_ids: input.queryEntityIds, already_seen: alreadySeen }
    ).catch(() => [])

    for (const row of twoHopRows) {
      const weight = row.path_weight ?? 0
      const existing = scoreMap.get(row.m.id)
      if (!existing) {
        scoreMap.set(row.m.id, { mem: row.m, vscore: 0, graphScore: weight })
      } else {
        existing.graphScore += weight
      }
    }
  }

  // Stage 4.5 — Remove superseded memories (pointed to by UPDATES edges)
  if (scoreMap.size > 0) {
    const candidateIds = [...scoreMap.keys()]
    const supersededRows = await client.query<{ id: string }>(
      `MATCH (newer:Memory)-[:UPDATES]->(old:Memory)
       WHERE old.id IN $candidate_ids
       RETURN old.id AS id`,
      { candidate_ids: candidateIds }
    ).catch(() => [] as { id: string }[])
    for (const row of supersededRows) {
      scoreMap.delete(row.id)
    }
  }

  // Build contradiction set — ids that have an incoming CONTRADICTS edge
  let contradictedIds = new Set<string>()
  if (scoreMap.size > 0) {
    const remainingIds = [...scoreMap.keys()]
    const contradictRows = await client.query<{ id: string }>(
      `MATCH (a:Memory)-[:CONTRADICTS]->(b:Memory)
       WHERE b.id IN $ids
       RETURN b.id AS id`,
      { ids: remainingIds }
    ).catch(() => [] as { id: string }[])
    for (const row of contradictRows) {
      contradictedIds.add(row.id)
    }
  }

  // Stage 5 — Fused scoring
  const candidateLimit = limit * 3
  const scored: ScoredMemoryId[] = []

  for (const [id, { mem, vscore, graphScore }] of scoreMap) {
    const score = fuseScore(mem, vscore, graphScore, input.workspaceId, contradictedIds.has(id))
    scored.push({ id, score, vscore, graphScore })
  }

  scored.sort((a, b) => b.score - a.score)
  const topCandidates = scored.slice(0, candidateLimit)

  // Stage 6 — MMR diversification (λ=0.7)
  return mmrDiversify(topCandidates, limit, 0.7)
}
