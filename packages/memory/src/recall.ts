// packages/memory/src/recall.ts
import { getDb, FulcrumError, getTextEmbedder, getReranker, Db} from '@moabualruz/fulcrum-core'
import { rrfScore, rrfScoreWithSparse, recallScore, computeFreshness } from './scoring.js'
import { sparseRank } from './sparse.js'
import { rowToFullMemory } from './mappers.js'
import type { RecallMemoryInput, CompactMemory, FullMemory, RecallMode, QueryScope } from './types.js'
import { getKuzuClient } from './kuzu/client.js'
import { queryMemoriesL2 } from './kuzu/query.js'
import { extractStructured } from './extractors/structured.js'
import { resolveEntity } from './kuzu/entity-store.js'

function rowToCompact(row: Record<string, unknown>, recall_score?: number): CompactMemory {
  return {
    memory_id: row.memory_id as string,
    title: row.title as string,
    summary: row.summary as string,
    scope: row.scope as CompactMemory['scope'],
    kind: row.kind as CompactMemory['kind'],
    file_path: row.file_path as string | null,
    confidence: row.confidence as number,
    recall_score,
  }
}

function buildWhereClause(input: RecallMemoryInput): { clauses: string[]; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []

  // ── query_scope controls search breadth ─────────────────────────────────────
  // 'session': filter by session_id only (narrowest)
  // 'project': filter by workspace_id + project_id (default)
  // 'workspace': filter by workspace_id only
  const qs = input.query_scope ?? 'project'

  // Explicitly block 'global' — cross-workspace queries are not permitted
  if ((qs as string) === 'global') {
    throw new FulcrumError("query_scope 'global' is not permitted", 'invalid_input')
  }

  switch (qs) {
    case 'session':
      if (!input.session_id) {
        throw new FulcrumError("session_id is required when query_scope is 'session'", 'invalid_input')
      }
      clauses.push('m.session_id = ?')
      params.push(input.session_id)
      // Still constrain to workspace for safety
      clauses.push('m.workspace_id = ?')
      params.push(input.workspace_id)
      break
    case 'workspace':
      clauses.push('m.workspace_id = ?')
      params.push(input.workspace_id)
      break
    case 'project':
    default:
      clauses.push('m.workspace_id = ?')
      params.push(input.workspace_id)
      if (input.project_id !== undefined) {
        if (input.project_id === null) {
          clauses.push('m.project_id IS NULL')
        } else {
          clauses.push('m.project_id = ?')
          params.push(input.project_id)
        }
      }
      break
  }

  if (input.task_id) {
    clauses.push('m.task_id = ?')
    params.push(input.task_id)
  }
  if (input.scope) {
    clauses.push('m.scope = ?')
    params.push(input.scope)
  }
  if (input.kind) {
    clauses.push('m.kind = ?')
    params.push(input.kind)
  }
  if (input.file_path) {
    clauses.push('m.file_path = ?')
    params.push(input.file_path)
  }

  // If no clauses, return a trivially-true clause
  if (clauses.length === 0) return { clauses: ['1=1'], params }

  return { clauses, params }
}

type DbType = ReturnType<typeof getDb>

/** Run FTS5 match. Returns empty array on SQLITE_ERROR (e.g. invalid FTS5 syntax). */
function ftsSearch(
  db: DbType,
  query: string,
  whereClause: string,
  whereParams: unknown[],
  limit: number
): { rowid: number; ftsRank: number }[] {
  try {
    return (db.prepare(`
      SELECT m.rowid, row_number() OVER (ORDER BY f.rank) AS ftsRank
      FROM memories_fts f
      JOIN memories m ON m.rowid = f.rowid
      WHERE f.memories_fts MATCH ?
        AND ${whereClause}
      ORDER BY f.rank
      LIMIT ?
    `).all(query, ...whereParams, limit * 3) as { rowid: number; ftsRank: number }[])
  } catch (err) {
    if ((err as { code?: string }).code !== 'SQLITE_ERROR') throw err
    // Invalid FTS5 query syntax — return empty, let vector search carry the result
    return []
  }
}

function updateAccessCounts(db: DbType, ids: string[]): void {
  if (ids.length === 0) return
  const now = new Date().toISOString()
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(
    `UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE memory_id IN (${placeholders})`
  ).run(now, ...ids)
}

export async function getMemory(memory_id: string, db: Db = getDb()): Promise<FullMemory | null> {
  const row = db.prepare('SELECT * FROM memories WHERE memory_id = ?').get(memory_id) as Record<string, unknown> | undefined
  if (!row) return null
  return rowToFullMemory(row)
}

export async function getMemoriesForTask(task_id: string, db: Db = getDb()): Promise<FullMemory[]> {
  const rows = db.prepare('SELECT * FROM memories WHERE task_id = ? ORDER BY created_at DESC').all(task_id) as Record<string, unknown>[]
  return rows.map(rowToFullMemory)
}

export async function recallMemory(
  input: RecallMemoryInput,
  db: Db = getDb(),
): Promise<CompactMemory[] | FullMemory[]> {
  if (!input.query.trim()) throw new FulcrumError('query must not be empty', 'invalid_input')

  const mode: RecallMode = input.mode ?? 'compact'
  const limit = input.limit ?? (mode === 'compact' ? 8 : 20)
  const offset = input.offset ?? 0
  if (limit <= 0) return []
  // Fetch enough candidates to satisfy offset + limit pages.
  const fetchLimit = limit + offset

  // MEM-004: build WHERE clause early — applied to both L2 (SQLite lookup) and L1 paths
  const { clauses, params } = buildWhereClause(input)
  const whereClause = clauses.join(' AND ')

  // ── L2 path: if KuzuClient active and embedder available ─────────────────
  const kuzuClient = getKuzuClient()
  if (kuzuClient?.isReady) {
    const embedder = getTextEmbedder()
    if (embedder) {
      try {
        const queryVec = await (embedder.embedQuery ?? embedder.embed.bind(embedder))(input.query)

        // Extract query entities
        const queryMentions = extractStructured(input.query, {})
        const queryEntityIds: string[] = []
        for (const mention of queryMentions) {
          const entity = await resolveEntity(kuzuClient, mention.raw, input.workspace_id)
          if (!entity.isNew) queryEntityIds.push(entity.id)
        }

        const l2Results = await queryMemoriesL2(kuzuClient, {
          query: input.query,
          queryVector: queryVec,
          queryEntityIds,
          workspaceId: input.workspace_id,
          limit: fetchLimit,
        })

        if (l2Results.length > 0) {
          const pagedResults = l2Results.slice(offset, offset + limit)
          const ids = pagedResults.map(r => r.id)
          // MEM-006: build score map from L2 results before SQLite lookup
          const l2ScoreMap = new Map(pagedResults.map(r => [r.id, r.score]))
          const placeholders = ids.map(() => '?').join(',')
          // MEM-004: apply the same WHERE filters as L1 so workspace/project/scope/kind
          // filters are honoured even when the vector index returns cross-boundary matches
          const rawRows = ids.length > 0
            ? db.prepare(
                `SELECT m.* FROM memories m WHERE m.memory_id IN (${placeholders}) AND ${whereClause}`
              ).all(...ids, ...params) as Record<string, unknown>[]
            : []

          updateAccessCounts(db, rawRows.map(r => r.memory_id as string))

          // Restore L2 ordering (SQLite IN clause is non-deterministic)
          const rowById = new Map(rawRows.map(r => [r.memory_id as string, r]))
          const rows = ids.map(id => rowById.get(id)).filter(Boolean) as Record<string, unknown>[]

          // MEM-005: apply reranker to L2 results (same logic as L1 path)
          let sortedWithScores = rows.map(r => ({
            row: r,
            score: l2ScoreMap.get(r.memory_id as string) ?? 0,
          }))

          const rerankerL2 = getReranker()
          if (rerankerL2 && sortedWithScores.length > 1) {
            try {
              const passages = sortedWithScores.map(s => (s.row.content as string) ?? '')
              const rerankScores = await rerankerL2.rerank(input.query, passages)
              sortedWithScores = sortedWithScores
                .map((s, i) => {
                  const rs = rerankScores[i]
                  return {
                    row: s.row,
                    score: typeof rs === 'number' && Number.isFinite(rs)
                      ? 1 / (1 + Math.exp(-rs))
                      : s.score,
                  }
                })
                .sort((a, b) => b.score - a.score)
            } catch { /* reranker unavailable */ }
          }

          if (mode === 'compact') return sortedWithScores.map(s => rowToCompact(s.row, s.score)) // MEM-006
          return sortedWithScores.map(s => rowToFullMemory(s.row))
        }
      } catch {
        // L2 unavailable — fall through to L1
      }
    }
  }

  // ── compact / total_ranked: RRF hybrid search ─────────────────────────────
  // Build FTS5 query: tokenise into terms and join with OR so any matching
  // term retrieves the document.  FTS5 BM25 rank naturally promotes documents
  // that match more terms.  Each term is double-quoted so special characters
  // are treated as literals rather than FTS5 operators.
  const ftsQuery = input.query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => `"${w.replace(/"/g, '""')}"`)
    .join(' OR ')
  const ftsRows = ftsSearch(db, ftsQuery, whereClause, params, fetchLimit)

  // Vector search (optional — skip if embedder unavailable or vec_memories missing)
  let vecRows: { rowid: number; vecRank: number }[] = []
  const embedder = getTextEmbedder()
  if (embedder) {
    try {
      const queryVec = await (embedder.embedQuery ?? embedder.embed.bind(embedder))(input.query)
      const raw = db.prepare(
        'SELECT rowid, row_number() OVER (ORDER BY distance) AS vecRank FROM vec_memories WHERE embedding MATCH ? ORDER BY distance LIMIT ?'
      ).all(Buffer.from(queryVec.buffer), fetchLimit * 3) as { rowid: number; vecRank: number }[]
      vecRows = raw
    } catch {
      // vec_memories unavailable — FTS5 only
    }
  }

  // ── Sparse rescue candidates (GAP-RAG-7) ──────────────────────────────────
  // Fetch additional candidates via sparse dot-product retrieval. These are
  // documents that share significant term overlap with the query but may not
  // appear in FTS5 or dense vector results (e.g., documents with code
  // identifiers that FTS5 indexed differently, or rare terms not in embeddings).
  //
  // Sparse candidates are ONLY added to the pool if they are NOT already
  // covered by FTS5 or dense vector. This preserves the existing ranking
  // for already-retrieved documents while expanding recall for missed ones.
  let sparseOnlyRowids: number[] = []
  const combinedRowids = new Set<number>([
    ...ftsRows.map(r => r.rowid),
    ...vecRows.map(r => r.rowid),
  ])

  // Only run sparse retrieval when we have fewer candidates than needed —
  // avoids the cost when FTS5 + vec already have ample candidates.
  if (combinedRowids.size < fetchLimit) {
    try {
      const sparseLimit = fetchLimit - combinedRowids.size
      const sparseRows = db.prepare(
        `SELECT m.rowid, m.sparse_vector FROM memories m WHERE m.sparse_vector IS NOT NULL AND ${whereClause} LIMIT ?`
      ).all(...params, sparseLimit * 4) as { rowid: number; sparse_vector: string | null }[]

      const sparseRanked = sparseRank(input.query, sparseRows)
      // Add only sparse-only candidates (not already in FTS5/vec results)
      for (const rowid of sparseRanked.keys()) {
        if (!combinedRowids.has(rowid)) {
          sparseOnlyRowids.push(rowid)
          if (sparseOnlyRowids.length >= sparseLimit) break
        }
      }
    } catch { /* sparse retrieval is best-effort */ }
  }

  const allRowids = new Set<number>([...combinedRowids, ...sparseOnlyRowids])
  if (allRowids.size === 0) return []

  const ftsMap = new Map(ftsRows.map(r => [r.rowid, r.ftsRank]))
  const vecMap = new Map(vecRows.map(r => [r.rowid, r.vecRank]))

  // First pass: RRF scores without freshness (to limit candidates)
  const rrfScored = [...allRowids].map(rowid => ({
    rowid,
    rrfBase: rrfScore(ftsMap.get(rowid) ?? null, vecMap.get(rowid) ?? null),
  })).sort((a, b) => b.rrfBase - a.rrfBase).slice(0, fetchLimit * 2)

  if (rrfScored.length === 0) return []

  const rowids = rrfScored.map(s => s.rowid)
  const placeholders = rowids.map(() => '?').join(',')
  const rows = db.prepare(
    `SELECT m.rowid, m.* FROM memories m WHERE m.rowid IN (${placeholders}) AND ${whereClause}`
  ).all(...rowids, ...params) as (Record<string, unknown> & { rowid: number; sparse_vector: string | null })[]

  // Build sparse rank map for the final scored set (needed for sparse-only rescue docs)
  const scoredSparseRows = rows.map(r => ({ rowid: r.rowid, sparse_vector: r.sparse_vector ?? null }))
  const sparseMap = sparseRank(input.query, scoredSparseRows)
  const sparseOnlySet = new Set(sparseOnlyRowids)

  // Apply freshness weighting and re-sort
  const rowByRowid = new Map(rows.map(r => [r.rowid, r]))
  const scored = rrfScored
    .map(s => {
      const row = rowByRowid.get(s.rowid)
      if (!row) return null
      const freshness = computeFreshness(row.updated_at as string)
      const spRank = sparseMap.get(s.rowid) ?? null
      // Use 3-signal scoring for sparse-rescue docs; 2-signal for FTS5/vec docs
      const score = sparseOnlySet.has(s.rowid)
        ? rrfScoreWithSparse(null, null, spRank) * freshness
        : recallScore(ftsMap.get(s.rowid) ?? null, vecMap.get(s.rowid) ?? null, freshness)
      return { rowid: s.rowid, score }
    })
    .filter((s): s is { rowid: number; score: number } => s !== null)
    .sort((a, b) => b.score - a.score)
    .slice(offset, offset + limit)

  let sortedWithScores = scored.map(s => ({
    row: rowByRowid.get(s.rowid)!,
    score: s.score,
  })).filter(s => s.row !== undefined)

  // ── Reranker (optional) ────────────────────────────────────────────────────
  // Wire reranker scores into the final result. Reranker replaces the RRF
  // score for the compact mode so callers see meaningful quality scores.
  const reranker = getReranker()
  if (reranker && sortedWithScores.length > 1) {
    try {
      const passages = sortedWithScores.map(s => (s.row.content as string) ?? '')
      const rerankScores = await reranker.rerank(input.query, passages)
      sortedWithScores = sortedWithScores
        .map((s, i) => {
          const rs = rerankScores[i]
          return {
            row: s.row,
            score: typeof rs === 'number' && Number.isFinite(rs)
              ? 1 / (1 + Math.exp(-rs))  // sigmoid: maps any logit to (0,1), preserves rank order
              : s.score,
          }
        })
        .sort((a, b) => b.score - a.score)
    } catch {
      // Reranker unavailable — keep RRF scores
    }
  }

  updateAccessCounts(db, sortedWithScores.map(s => s.row.memory_id as string))

  if (mode === 'compact') return sortedWithScores.map(s => rowToCompact(s.row, s.score))
  return sortedWithScores.map(s => rowToFullMemory(s.row))  // total_ranked
}
