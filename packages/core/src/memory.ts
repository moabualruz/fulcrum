import { getDb } from './db/client.js'
import { newId } from './ids.js'
import { FulcrumError } from './types.js'
import type { Memory, MemoryScope, MemoryKind } from './types.js'
import { getTextEmbedder, getReranker } from './embedding/registry.js'

interface WriteMemoryInput {
  workspace_id: string
  project_id: string
  content: string
  tags?: string[]
  confidence?: number
  embedding?: Float32Array
  scope?: MemoryScope
  kind?: MemoryKind
  title?: string
  summary?: string
  canonical_text?: string
  entities?: string[]
  task_id?: string
  issue_id?: string
  artifact_id?: string
  provenance_refs?: string[]
}

interface RecallMemoryInput {
  workspace_id: string
  project_id: string
  query: string
  limit?: number
}

function rowToMemory(row: Record<string, unknown>): Memory {
  return {
    memory_id: row.memory_id as string,
    workspace_id: row.workspace_id as string,
    project_id: row.project_id as string | null,
    scope: ((row.scope as string) || 'project') as MemoryScope,
    kind: ((row.kind as string) || 'fact') as MemoryKind,
    file_path: (row.file_path as string | null) ?? null,
    symbol_path: (row.symbol_path as string | null) ?? null,
    title: (row.title as string) || '',
    summary: (row.summary as string) || '',
    content: row.content as string,
    canonical_text: (row.canonical_text as string | null) ?? null,
    tags: (() => { try { return JSON.parse(row.tags as string) as string[] } catch { return [] } })(),
    entities: (() => { try { return JSON.parse(row.entities as string) as string[] } catch { return [] } })(),
    confidence: row.confidence as number,
    freshness: (row.freshness as number) ?? 1.0,
    access_count: row.access_count as number,
    event_time: (row.event_time as string | null) ?? null,
    content_hash: (row.content_hash as string | null) ?? null,
    task_id: (row.task_id as string | null) ?? null,
    issue_id: (row.issue_id as string | null) ?? null,
    artifact_id: (row.artifact_id as string | null) ?? null,
    provenance_refs: (() => { try { return JSON.parse(row.provenance_refs as string) as string[] } catch { return [] } })(),
    embedding: (row.embedding as Buffer | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    last_accessed_at: row.last_accessed_at as string,
  }
}

/** Cosine similarity between two Float32Arrays (mismatched lengths → 0) */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

export async function writeMemory(input: WriteMemoryInput): Promise<Memory> {
  if (!input.content.trim()) throw new FulcrumError('content must not be empty', 'invalid_input')
  if (input.confidence !== undefined && (input.confidence < 0 || input.confidence > 1)) {
    throw new FulcrumError('confidence must be between 0 and 1', 'invalid_input')
  }
  const db = getDb()
  const now = new Date().toISOString()

  const scope = input.scope ?? 'project'
  const kind = input.kind ?? 'fact'
  const title = input.title ?? input.content.slice(0, 80)
  const summary = input.summary ?? title

  // Always check exact content match first (fast path), scoped by scope+kind
  const existing = db.prepare(
    'SELECT * FROM memories WHERE workspace_id = ? AND project_id = ? AND content = ? AND scope = ? AND kind = ?'
  ).get(input.workspace_id, input.project_id, input.content, scope, kind) as Record<string, unknown> | undefined

  if (existing) {
    db.prepare(
      'UPDATE memories SET confidence = ?, updated_at = ? WHERE memory_id = ?'
    ).run(input.confidence ?? (existing.confidence as number), now, existing.memory_id)
    const updated = db.prepare('SELECT * FROM memories WHERE memory_id = ?').get(existing.memory_id) as Record<string, unknown>
    return rowToMemory(updated)
  }

  // Embedding-based deduplication (when embedding provided)
  if (input.embedding) {
    const candidates = db.prepare(
      'SELECT *, embedding FROM memories WHERE workspace_id = ? AND project_id = ? AND embedding IS NOT NULL'
    ).all(input.workspace_id, input.project_id) as (Record<string, unknown> & { embedding: Buffer })[]

    for (const candidate of candidates) {
      const existingEmbedding = new Float32Array(
        candidate.embedding.buffer,
        candidate.embedding.byteOffset,
        candidate.embedding.byteLength / 4
      )
      if (cosineSimilarity(input.embedding, existingEmbedding) > 0.9) {
        db.prepare(
          'UPDATE memories SET content = ?, confidence = ?, embedding = ?, updated_at = ? WHERE memory_id = ?'
        ).run(input.content, input.confidence ?? 1.0, Buffer.from(input.embedding.buffer), now, candidate.memory_id)
        const updated = db.prepare('SELECT * FROM memories WHERE memory_id = ?').get(candidate.memory_id) as Record<string, unknown>
        return rowToMemory(updated)
      }
    }
  }

  // Insert new memory
  const memory_id = newId('memory')
  const embeddingBuffer = input.embedding ? Buffer.from(input.embedding.buffer) : null
  db.prepare(`
    INSERT INTO memories
      (memory_id, workspace_id, project_id, scope, kind, title, summary, content,
       canonical_text, tags, entities, confidence, embedding,
       task_id, issue_id, artifact_id, provenance_refs,
       created_at, updated_at, last_accessed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    memory_id,
    input.workspace_id,
    input.project_id,
    scope,
    kind,
    title,
    summary,
    input.content,
    input.canonical_text ?? null,
    JSON.stringify(input.tags ?? []),
    JSON.stringify(input.entities ?? []),
    input.confidence ?? 1.0,
    embeddingBuffer,
    input.task_id ?? null,
    input.issue_id ?? null,
    input.artifact_id ?? null,
    JSON.stringify(input.provenance_refs ?? []),
    now, now, now
  )
  const row = db.prepare('SELECT * FROM memories WHERE memory_id = ?').get(memory_id) as Record<string, unknown> | undefined
  if (!row) throw new FulcrumError(`Memory ${memory_id} not found after insert`, 'not_found')
  return rowToMemory(row)
}

export async function recallMemory(input: RecallMemoryInput): Promise<Memory[]> {
  if (!input.query.trim()) throw new FulcrumError('query must not be empty', 'invalid_input')
  const limit = input.limit ?? 5
  if (limit <= 0) return []
  const db = getDb()
  const candidates = new Map<string, { memory: Memory; score: number }>()

  // --- FTS5 lexical search ---
  let ftsRows: { rowid: number; rank: number }[] = []
  try {
    ftsRows = db.prepare(`
      SELECT f.rowid, f.rank
      FROM memories_fts f
      JOIN memories m ON m.rowid = f.rowid
      WHERE memories_fts MATCH ?
        AND m.workspace_id = ?
        AND m.project_id = ?
      ORDER BY f.rank
    `).all(input.query, input.workspace_id, input.project_id) as { rowid: number; rank: number }[]
  } catch (err) {
    // Fall back to LIKE on any SQLite error (FTS5 syntax errors, unavailable extension, etc.)
    // Re-throw non-SQLite errors (e.g. OOM, programming bugs outside this query)
    if ((err as { code?: string }).code !== 'SQLITE_ERROR') throw err
    const likeRows = db.prepare(
      'SELECT rowid FROM memories WHERE workspace_id = ? AND project_id = ? AND content LIKE ? LIMIT ?'
    ).all(input.workspace_id, input.project_id, `%${input.query}%`, limit) as { rowid: number }[]
    ftsRows = likeRows.map(r => ({ rowid: r.rowid, rank: 0 }))
  }

  if (ftsRows.length > 0) {
    const rowids = ftsRows.map(r => r.rowid)
    const placeholders = rowids.map(() => '?').join(',')
    const rows = db.prepare(
      `SELECT * FROM memories WHERE rowid IN (${placeholders}) AND workspace_id = ? AND project_id = ?`
    ).all(...rowids, input.workspace_id, input.project_id) as Record<string, unknown>[]
    for (const row of rows) {
      const fts = ftsRows.find(f => f.rowid === (row as Record<string, unknown> & { rowid: number }).rowid)
      // FTS5 rank is negative (lower = better match); negate to get a positive score
      candidates.set(row.memory_id as string, { memory: rowToMemory(row), score: fts ? Math.abs(fts.rank) : 0 })
    }
  }

  // --- Vector ANN search (when embedding provider is available) ---
  const embedder = getTextEmbedder()
  if (embedder) {
    try {
      const queryVec = await embedder.embed(input.query)
      const vecRows = db.prepare(
        'SELECT rowid, distance FROM vec_memories WHERE embedding MATCH ? ORDER BY distance LIMIT ?'
      ).all(Buffer.from(queryVec.buffer), limit * 3) as { rowid: number; distance: number }[]

      if (vecRows.length > 0) {
        const rowids = vecRows.map(r => r.rowid)
        const placeholders = rowids.map(() => '?').join(',')
        const rows = db.prepare(
          `SELECT * FROM memories WHERE rowid IN (${placeholders}) AND workspace_id = ? AND project_id = ?`
        ).all(...rowids, input.workspace_id, input.project_id) as Record<string, unknown>[]
        for (const row of rows) {
          const vec = vecRows.find(v => v.rowid === (row as Record<string, unknown> & { rowid: number }).rowid)
          const vecScore = vec ? 1 / (1 + vec.distance) : 0
          const existing = candidates.get(row.memory_id as string)
          if (existing) {
            existing.score = (existing.score + vecScore) / 2
          } else {
            candidates.set(row.memory_id as string, { memory: rowToMemory(row), score: vecScore })
          }
        }
      }
    } catch {
      // vec_memories table not available — FTS5 results only
    }
  }

  if (candidates.size === 0) return []

  // Sort by merged score, take top limit * 2 for reranking
  let sorted = [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, limit * 2)

  // --- Reranker (optional) ---
  const reranker = getReranker()
  if (reranker && sorted.length > 1) {
    try {
      const passages = sorted.map(c => c.memory.content)
      const scores = await reranker.rerank(input.query, passages)
      sorted = sorted.map((c, i) => ({ ...c, score: scores[i] ?? c.score }))
        .sort((a, b) => b.score - a.score)
    } catch {
      // Reranker unavailable — use merged FTS5+vector scores
    }
  }

  const top = sorted.slice(0, limit).map(c => c.memory)

  // Update access tracking (only for returned rows)
  if (top.length > 0) {
    const now = new Date().toISOString()
    const ids = top.map(m => m.memory_id)
    const idPlaceholders = ids.map(() => '?').join(',')
    db.prepare(
      `UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE memory_id IN (${idPlaceholders})`
    ).run(now, ...ids)
  }

  return top
}
