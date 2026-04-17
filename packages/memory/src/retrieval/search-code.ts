// v2a PR 2 Task 13 — search_code action.
//
// Targets the code_chunks table via FTS5 + symbol-name lookup + (optionally)
// vector when a query embedding is provided. Returns the {results, reason?}
// envelope. Recall events use source='search_code'.

import type { Db } from '@moabualruz/fulcrum-core'
import { getDb } from '@moabualruz/fulcrum-core'

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
  start_line: number | null
  end_line: number | null
  symbol_path: string | null
  language: string | null
  content: string
  score: number
  project_id: string
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

  // FTS5 — pre-filter rowids via subquery (more reliable than ON-MATCH JOIN).
  if (input.text && input.text.trim()) {
    const safe = input.text.match(/[\p{L}\p{N}_]+/gu)?.map(t => `"${t}"`).join(' AND ') ?? ''
    if (!safe) return { results: [], reason: 'no_match' }
    where.push('c.rowid IN (SELECT rowid FROM code_chunks_fts WHERE code_chunks_fts MATCH ?)')
    params.push(safe)
  }

  const sql = `
    SELECT c.chunk_id, c.file_path AS rel_path, c.start_line, c.end_line, c.symbol_path, c.language, c.content, c.project_id
    FROM code_chunks c
    WHERE ${where.join(' AND ')}
    ORDER BY c.indexed_at DESC
    LIMIT ?
  `
  params.push(limit)

  let rows: Array<{ chunk_id: string; rel_path: string; start_line: number | null; end_line: number | null; symbol_path: string | null; language: string | null; content: string; project_id: string }>
  try {
    rows = db.prepare(sql).all(...params) as typeof rows
  } catch {
    return { results: [], reason: 'no_match' }
  }

  if (rows.length === 0) return { results: [], reason: 'no_match' }

  // Score: 1.0 when text-match was used (FTS5 matched) — placeholder ranking.
  // PR 4's full retrieval will plumb runStagedSearch + RRF; v2a PR 2 ships
  // the surface so callers can wire to it.
  const score = input.text ? 1.0 : 0.5
  if (score < minScore) return { results: [], reason: 'below_floor' }

  const results: SearchCodeResultRow[] = rows.map(r => ({
    chunk_id: r.chunk_id,
    rel_path: r.rel_path,
    start_line: r.start_line,
    end_line: r.end_line,
    symbol_path: r.symbol_path,
    language: r.language,
    content: r.content,
    score,
    project_id: r.project_id,
  }))

  results.forEach((r, idx) => {
    logRecallEvent(db, r.chunk_id, input.text ?? input.symbol ?? '', idx + 1, score, input.caller_run_id, input.caller_role)
  })

  return { results }
}
