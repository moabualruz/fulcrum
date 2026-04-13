// packages/memory/src/recall.ts
import { getDb, FulcrumError, getTextEmbedder } from '@fulcrum/core'
import { rrfScore } from './scoring.js'
import { rowToFullMemory } from './mappers.js'
import type { RecallMemoryInput, CompactMemory, FullMemory, RecallMode } from './types.js'

function rowToCompact(row: Record<string, unknown>): CompactMemory {
  return {
    memory_id: row.memory_id as string,
    title: row.title as string,
    summary: row.summary as string,
    scope: row.scope as CompactMemory['scope'],
    kind: row.kind as CompactMemory['kind'],
    file_path: row.file_path as string | null,
    confidence: row.confidence as number,
  }
}

function buildWhereClause(input: RecallMemoryInput): { clauses: string[]; params: unknown[] } {
  const clauses: string[] = ['m.workspace_id = ?']
  const params: unknown[] = [input.workspace_id]

  if (input.project_id !== undefined) {
    if (input.project_id === null) {
      clauses.push('m.project_id IS NULL')
    } else {
      clauses.push('m.project_id = ?')
      params.push(input.project_id)
    }
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

  return { clauses, params }
}

type DbType = ReturnType<typeof getDb>

/** Run FTS5 match, fall back to LIKE on SQLITE_ERROR */
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
    // LIKE fallback
    const likeRows = db.prepare(
      `SELECT m.rowid FROM memories m WHERE (m.content LIKE ? OR m.title LIKE ? OR m.summary LIKE ?) AND ${whereClause} LIMIT ?`
    ).all(`%${query}%`, `%${query}%`, `%${query}%`, ...whereParams, limit) as { rowid: number }[]
    return likeRows.map((r, i) => ({ rowid: r.rowid, ftsRank: i + 1 }))
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

export async function recallMemory(
  input: RecallMemoryInput
): Promise<CompactMemory[] | FullMemory[]> {
  if (!input.query.trim()) throw new FulcrumError('query must not be empty', 'invalid_input')

  const mode: RecallMode = input.mode ?? 'compact'
  const limit = input.limit ?? (mode === 'compact' ? 8 : 20)
  if (limit <= 0) return []

  const db = getDb()
  const { clauses, params } = buildWhereClause(input)
  const whereClause = clauses.join(' AND ')

  // ── total_timeline: sorted by event_time ASC, null last ───────────────────
  if (mode === 'total_timeline') {
    const rows = db.prepare(`
      SELECT m.*
      FROM memories m
      WHERE ${whereClause}
        AND (m.content LIKE ? OR m.title LIKE ? OR m.summary LIKE ?)
      ORDER BY CASE WHEN m.event_time IS NULL THEN 1 ELSE 0 END, m.event_time ASC
      LIMIT ?
    `).all(...params, `%${input.query}%`, `%${input.query}%`, `%${input.query}%`, limit) as Record<string, unknown>[]
    const memories = rows.map(rowToFullMemory)
    updateAccessCounts(db, memories.map(m => m.memory_id))
    return memories
  }

  // ── total_sourcemap: sorted by file_path ASC, symbol_path ASC ────────────
  if (mode === 'total_sourcemap') {
    const rows = db.prepare(`
      SELECT m.*
      FROM memories m
      WHERE ${whereClause}
        AND (m.content LIKE ? OR m.title LIKE ? OR m.summary LIKE ?)
      ORDER BY m.file_path ASC, m.symbol_path ASC
      LIMIT ?
    `).all(...params, `%${input.query}%`, `%${input.query}%`, `%${input.query}%`, limit) as Record<string, unknown>[]
    const memories = rows.map(rowToFullMemory)
    updateAccessCounts(db, memories.map(m => m.memory_id))
    return memories
  }

  // ── compact / total_ranked: RRF hybrid search ─────────────────────────────
  // Wrap query in double-quotes to treat it as an FTS5 phrase literal;
  // escape any inner double-quotes per FTS5 quoting rules.
  const ftsQuery = `"${input.query.replace(/"/g, '""')}"`
  const ftsRows = ftsSearch(db, ftsQuery, whereClause, params, limit)

  // Vector search (optional — skip if embedder unavailable or vec_memories missing)
  let vecRows: { rowid: number; vecRank: number }[] = []
  const embedder = getTextEmbedder()
  if (embedder) {
    try {
      const queryVec = await embedder.embed(input.query)
      const raw = db.prepare(
        'SELECT rowid, row_number() OVER (ORDER BY distance) AS vecRank FROM vec_memories WHERE embedding MATCH ? ORDER BY distance LIMIT ?'
      ).all(Buffer.from(queryVec.buffer), limit * 3) as { rowid: number; vecRank: number }[]
      vecRows = raw
    } catch {
      // vec_memories unavailable — FTS5 only
    }
  }

  // FULL OUTER JOIN via UNION ALL + GROUP BY
  const allRowids = new Set<number>([
    ...ftsRows.map(r => r.rowid),
    ...vecRows.map(r => r.rowid),
  ])
  if (allRowids.size === 0) return []

  const ftsMap = new Map(ftsRows.map(r => [r.rowid, r.ftsRank]))
  const vecMap = new Map(vecRows.map(r => [r.rowid, r.vecRank]))

  const scored = [...allRowids].map(rowid => ({
    rowid,
    score: rrfScore(ftsMap.get(rowid) ?? null, vecMap.get(rowid) ?? null),
  })).sort((a, b) => b.score - a.score).slice(0, limit)

  if (scored.length === 0) return []

  const rowids = scored.map(s => s.rowid)
  const placeholders = rowids.map(() => '?').join(',')
  const rows = db.prepare(
    `SELECT m.rowid, m.* FROM memories m WHERE m.rowid IN (${placeholders}) AND ${whereClause}`
  ).all(...rowids, ...params) as Record<string, unknown>[]

  // Re-sort to match RRF order
  const rowByRowid = new Map(rows.map(r => [(r as Record<string, unknown> & { rowid: number }).rowid, r]))
  const sorted = scored
    .map(s => rowByRowid.get(s.rowid))
    .filter((r): r is Record<string, unknown> => r !== undefined)

  updateAccessCounts(db, sorted.map(r => r.memory_id as string))

  if (mode === 'compact') return sorted.map(rowToCompact)
  return sorted.map(rowToFullMemory)  // total_ranked
}
