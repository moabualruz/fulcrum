// v2a PR 2 Task 12 — query_memory action.
//
// L1-only structured query. Combines tag filter (memory_tags), backlink filter
// (memory_wikilinks for O(log n) `linked_to` traversal), file/kind/text
// filters via SQL, and emits the {results, reason?} envelope. Never touches
// L2 — see plan §"Excluded from v2a" → "no Kuzu in query_memory".

import type { Db } from 'fulcrum-core'
import { getDb } from 'fulcrum-core'

export interface QueryMemoryInput {
  workspace_id: string
  project_id?: string
  scope?: 'session' | 'project' | 'workspace' | 'global'
  text?: string
  tags?: string[]
  linked_to?: string
  file_paths?: string[]
  kind?: string
  date_range?: { from?: string; to?: string }
  limit?: number
  caller_run_id?: string
  caller_role?: string
}

export interface QueryMemoryResultRow {
  memory_id: string
  title: string
  content: string
  kind: string
  scope: string
  tags: string[]
  recall_score: number
}

export interface QueryMemoryResponse {
  results: QueryMemoryResultRow[]
  reason?: 'no_match' | 'below_floor'
}

function logRecallEvent(db: Db, memory_id: string, query: string, rank: number, callerRunId?: string, callerRole?: string): void {
  try {
    db.prepare(`INSERT INTO memory_recall_events (memory_id, query, score, rank, caller_run_id, caller_role, source, created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(memory_id, query, 1.0, rank, callerRunId ?? null, callerRole ?? null, 'query_memory', Date.now())
  } catch { /* aux table absent — non-fatal */ }
}

export async function queryMemory(input: QueryMemoryInput, db: Db = getDb()): Promise<QueryMemoryResponse> {
  const limit = input.limit ?? 20

  // Build joins (which contain ? placeholders) and where clauses separately,
  // then concatenate params in the same order they appear in the SQL string.
  const joinParams: unknown[] = []
  const whereParams: unknown[] = []
  const where: string[] = ['m.workspace_id = ?']
  whereParams.push(input.workspace_id)

  if (input.project_id) {
    where.push('m.project_id = ?')
    whereParams.push(input.project_id)
  }
  if (input.scope) {
    where.push('m.scope = ?')
    whereParams.push(input.scope)
  }
  if (input.kind) {
    where.push('m.kind = ?')
    whereParams.push(input.kind)
  }
  if (input.file_paths && input.file_paths.length > 0) {
    where.push(`m.file_path IN (${input.file_paths.map(() => '?').join(',')})`)
    whereParams.push(...input.file_paths)
  }
  if (input.date_range?.from) {
    where.push('m.created_at >= ?')
    whereParams.push(input.date_range.from)
  }
  if (input.date_range?.to) {
    where.push('m.created_at <= ?')
    whereParams.push(input.date_range.to)
  }

  // Tag filter via memory_tags (intersection — every tag must be present).
  let tagJoin = ''
  if (input.tags && input.tags.length > 0) {
    tagJoin = `
      INNER JOIN (
        SELECT memory_id FROM memory_tags WHERE tag IN (${input.tags.map(() => '?').join(',')})
        GROUP BY memory_id HAVING COUNT(DISTINCT tag) = ?
      ) t ON t.memory_id = m.memory_id
    `
    joinParams.push(...input.tags, input.tags.length)
  }

  // Backlink filter via memory_wikilinks (O(log n) via idx_wikilinks_dst_id).
  let linkJoin = ''
  if (input.linked_to) {
    linkJoin = `
      INNER JOIN memory_wikilinks wl ON wl.dst_memory_id = ?
      AND wl.src_memory_id = m.memory_id
    `
    joinParams.push(input.linked_to)
  }

  // FTS5 over content — pre-filter rowids via subquery (more reliable than
  // an INNER JOIN with MATCH in the ON clause).
  let ftsClause = ''
  if (input.text && input.text.trim()) {
    const safe = input.text.match(/[\p{L}\p{N}_]+/gu)?.map(t => `"${t}"`).join(' AND ') ?? ''
    if (!safe) return { results: [], reason: 'no_match' }
    where.push('m.rowid IN (SELECT rowid FROM memories_fts WHERE memories_fts MATCH ?)')
    whereParams.push(safe)
  }

  const sql = `
    SELECT DISTINCT m.memory_id, m.title, m.content, m.kind, m.scope, m.tags
    FROM memories m
    ${tagJoin}
    ${linkJoin}
    ${ftsClause}
    WHERE ${where.join(' AND ')}
    ORDER BY m.last_accessed_at DESC
    LIMIT ?
  `
  const params = [...joinParams, ...whereParams, limit]

  let rows: { memory_id: string; title: string; content: string; kind: string; scope: string; tags: string }[] = []
  try {
    rows = db.prepare(sql).all(...params) as typeof rows
  } catch {
    // Defensive: if any prepared statement fails (e.g. missing aux table on
    // legacy DBs that haven't run runMigrations), surface no_match instead of
    // throwing — query_memory is a recall surface and must never bring a
    // session down.
    return { results: [], reason: 'no_match' }
  }

  if (rows.length === 0) return { results: [], reason: 'no_match' }

  const results: QueryMemoryResultRow[] = rows.map(r => ({
    memory_id: r.memory_id,
    title: r.title,
    content: r.content,
    kind: r.kind,
    scope: r.scope,
    tags: ((): string[] => { try { return JSON.parse(r.tags) } catch { return [] } })(),
    recall_score: 1.0,
  }))

  results.forEach((r, idx) => {
    logRecallEvent(db, r.memory_id, input.text ?? '', idx + 1, input.caller_run_id, input.caller_role)
  })

  return { results }
}
