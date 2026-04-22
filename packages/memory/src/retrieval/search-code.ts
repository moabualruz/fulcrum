// v2a PR 2 Task 13 + v2b PR 20 completion — search_code action.
//
// Targets the code_chunks table via FTS5 + symbol-name lookup. Returns the
// {results, reason?} envelope. Recall events use source='search_code'.
//
// Scoring uses two-signal RRF (k=60) over:
//   (a) FTS5 rank position (bm25-ordered) — from the MATCH query.
//   (b) Symbol-name prefix-rank — when a symbol filter was supplied, exact
//       match takes rank 1, prefix matches take rank 2+.
// When neither signal is active (e.g., path-only search), score falls back
// to the recency-ranked RRF score using position in the result set.

import type { Db } from 'fulcrum-agent-core'
import { getDb } from 'fulcrum-agent-core'
import { rrfScore } from '../scoring.js'

export interface SearchCodeInput {
  workspace_id: string
  project_id?: string
  text?: string
  symbol?: string
  lang?: string
  path?: string
  scope?: 'session' | 'project' | 'workspace' | 'global'
  min_score?: number
  limit?: number
  caller_run_id?: string
  caller_role?: string
}

export interface SearchCodeResultRow {
  chunk_id: string
  rel_path: string
  start_line: number
  end_line: number
  symbol_path: string | null
  language: string | null
  content: string
  score: number
  project_id: string
  file_id: string | null
  code_index_state: 'current' | 'legacy' | 'orphaned'
}

export interface SearchCodeResponse {
  results: SearchCodeResultRow[]
  reason?: 'no_match' | 'below_floor'
}

function logRecallEvent(db: Db, chunk_id: string, query: string, rank: number, score: number, callerRunId?: string, callerRole?: string): void {
  try {
    db.prepare(`INSERT INTO memory_recall_events (memory_id, query, score, rank, caller_run_id, caller_role, source, created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(chunk_id, query, score, rank, callerRunId ?? null, callerRole ?? null, 'search_code', Date.now())
  } catch { /* aux table absent — non-fatal */ }
}

export async function searchCode(input: SearchCodeInput, db: Db = getDb()): Promise<SearchCodeResponse> {
  const limit = input.limit ?? 20
  const minScore = input.min_score ?? 0
  const where: string[] = ['c.workspace_id = ?']
  const params: unknown[] = [input.workspace_id]

  if (input.project_id) {
    where.push('c.project_id = ?')
    params.push(input.project_id)
  }
  if (input.lang) {
    where.push('c.language = ?')
    params.push(input.lang)
  }
  if (input.path) {
    where.push('c.file_path LIKE ?')
    params.push(`%${input.path}%`)
  }
  if (input.symbol) {
    where.push('c.symbol_path = ?')
    params.push(input.symbol)
  }

  // Rank map #1: FTS5 text-match rank by bm25 order.
  const ftsRankByChunk = new Map<string, number>()
  if (input.text && input.text.trim()) {
    const safe = input.text.match(/[\p{L}\p{N}_]+/gu)?.map(t => `"${t}"`).join(' AND ') ?? ''
    if (!safe) return { results: [], reason: 'no_match' }
    try {
      const ftsRows = db.prepare(`
        SELECT c.chunk_id, bm25(code_chunks_fts) AS bm25
        FROM code_chunks c
        JOIN code_chunks_fts ON c.rowid = code_chunks_fts.rowid
        WHERE code_chunks_fts MATCH ? AND c.workspace_id = ?
        ORDER BY bm25 ASC
        LIMIT ?
      `).all(safe, input.workspace_id, limit * 4) as Array<{ chunk_id: string; bm25: number }>
      ftsRows.forEach((row, idx) => {
        ftsRankByChunk.set(row.chunk_id, idx + 1)
      })
    } catch { /* FTS5 absent — non-fatal, RRF just uses symbol signal */ }
    where.push('c.rowid IN (SELECT rowid FROM code_chunks_fts WHERE code_chunks_fts MATCH ?)')
    params.push(safe)
  }

  const sql = `
    SELECT c.chunk_id,
           COALESCE(f.rel_path, c.file_path) AS rel_path,
           COALESCE(c.start_line, 1) AS start_line,
           COALESCE(c.end_line, COALESCE(c.start_line, 1)) AS end_line,
           c.symbol_path,
           COALESCE(c.language, f.language) AS language,
           c.content,
           c.project_id,
           c.file_id,
           CASE
             WHEN c.file_id IS NULL THEN 'legacy'
             WHEN f.file_id IS NULL THEN 'orphaned'
             ELSE 'current'
           END AS code_index_state
    FROM code_chunks c
    LEFT JOIN code_files f
      ON f.file_id = c.file_id
      AND f.workspace_id = c.workspace_id
      AND f.project_id = c.project_id
    WHERE ${where.join(' AND ')}
      AND (
        c.file_id IS NULL
        OR (f.file_id IS NOT NULL AND f.status = 'indexed')
      )
    ORDER BY c.indexed_at DESC
    LIMIT ?
  `
  params.push(limit)

  let rows: Array<{
    chunk_id: string
    rel_path: string
    start_line: number
    end_line: number
    symbol_path: string | null
    language: string | null
    content: string
    project_id: string
    file_id: string | null
    code_index_state: 'current' | 'legacy' | 'orphaned'
  }>
  try {
    rows = db.prepare(sql).all(...params) as typeof rows
  } catch {
    return { results: [], reason: 'no_match' }
  }

  if (rows.length === 0) return { results: [], reason: 'no_match' }

  // Rank map #2: symbol signal. When input.symbol was supplied, exact-match
  // chunks take rank 1, prefix matches take later ranks ordered by how close
  // the symbol_path is to the query.
  const symbolRankByChunk = new Map<string, number>()
  if (input.symbol) {
    const target = input.symbol
    const scored = rows.map(r => {
      const sp = r.symbol_path ?? ''
      let priority: number
      if (sp === target) priority = 0
      else if (sp.endsWith('.' + target) || sp.endsWith(':' + target)) priority = 1
      else if (sp.includes(target)) priority = 2
      else priority = 3
      return { chunk_id: r.chunk_id, priority }
    })
    scored.sort((a, b) => a.priority - b.priority)
    scored.forEach((r, idx) => symbolRankByChunk.set(r.chunk_id, idx + 1))
  }

  // Two-signal RRF — the score floor comes from the same k=60 formula as
  // recall_memory. Recency tie-breaker via the result-set order.
  const results: SearchCodeResultRow[] = rows
    .map(r => {
      const ftsRank = ftsRankByChunk.get(r.chunk_id) ?? null
      const symRank = symbolRankByChunk.get(r.chunk_id) ?? null
      const score = rrfScore(ftsRank, symRank)
      return {
        chunk_id: r.chunk_id,
        rel_path: r.rel_path,
        start_line: r.start_line,
        end_line: r.end_line,
        symbol_path: r.symbol_path,
        language: r.language,
        content: r.content,
        score,
        project_id: r.project_id,
        file_id: r.file_id,
        code_index_state: r.code_index_state,
      }
    })
    .sort((a, b) => b.score - a.score)

  // min_score floor: rrfScore with both ranks null = 2 / (60 + 1000) ≈ 0.00189.
  // When a caller sets min_score > 0, filter below that.
  const filtered = minScore > 0 ? results.filter(r => r.score >= minScore) : results
  if (filtered.length === 0) return { results: [], reason: 'below_floor' }

  filtered.forEach((r, idx) => {
    logRecallEvent(db, r.chunk_id, input.text ?? input.symbol ?? '', idx + 1, r.score, input.caller_run_id, input.caller_role)
  })

  return { results: filtered }
}
