// packages/memory/src/l2/code.ts
//
// L2 — embed a code_chunks row into vec_chunks (+ mirror onto code_chunks.
// embedding). Parallel to ./embed.storeEmbeddingInVec. `scheduleChunkEmbedding`
// is the fire-and-forget entry point used by the indexer and ingest pipelines
// — it pushes through ./queue.enqueueEmbed so the embed worker stays bounded.
//
// Moved from packages/memory/src/write.ts during PR 4 unit 4.1. The code_chunks
// embedding path is intentionally left in place (plan §PR 4 — "embed L1 pages,
// keep code_chunks"): vec_chunks remains fed by the indexer daemon.

import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import type { CodeFileStatus, Db } from 'fulcrum-agent-core'
import { getDb, getTextEmbedder, newId } from 'fulcrum-agent-core'
import { createASTChunker } from '../chunkers/ast-chunker.js'
import { enqueueEmbed } from './queue.js'

let _chunkEmbedLoggedOnce = false

export interface CodeIndexChunk {
  text: string
  strategy: 'syntax' | 'semantic'
  sourceType: 'code' | 'prose'
  symbolPath: string | null
  startLine: number
  endLine: number
}

export interface CodeIndexChunkRow {
  chunk_id: string
  file_path: string
  file_id: string | null
  language: string | null
  chunk_strategy: 'syntax' | 'semantic' | 'token'
  source_type: 'code' | 'prose'
  content: string
  start_line: number
  end_line: number
  symbol_path: string | null
  content_hash: string
}

export interface IndexCodeFileInput {
  workspace_id: string
  project_id: string
  rel_path: string
  content: string
  language?: string | null
  sha256?: string
  mtime_ns?: number
  size_bytes?: number
  indexed_at?: number
  chunker?: (input: { content: string; language: string | null; rel_path: string }) => Promise<CodeIndexChunk[]> | CodeIndexChunk[]
}

export interface IndexCodeFileResult {
  action: 'indexed' | 'updated' | 'skipped' | 'failed'
  file_id: string
  status: CodeFileStatus
  language: string | null
  chunks_created: number
  chunks_deleted: number
  chunks_count: number
  failure_reason?: string
  chunks: CodeIndexChunkRow[]
}

export interface MarkCodeFileSkippedInput {
  workspace_id: string
  project_id: string
  rel_path: string
  language?: string | null
  sha256?: string
  mtime_ns?: number
  size_bytes?: number
  reason: string
}

export type MarkCodeFileFailedInput = MarkCodeFileSkippedInput

const LANG_EXT_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript',
  '.py': 'python', '.java': 'java', '.go': 'go', '.rs': 'rust',
  '.c': 'c', '.cpp': 'cpp', '.cc': 'cpp',
  '.md': 'markdown', '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
}
const CODE_LANGUAGES = new Set(['typescript', 'javascript', 'python', 'java', 'go', 'rust', 'c', 'cpp'])
const AST_SUPPORTED = new Set(['typescript', 'javascript'])
const MAX_CHUNK_CHARS = 1600
const PROSE_OVERLAP = 200
const SYNTAX_BOUNDARIES = /(?=^(?:export\s+)?(?:async\s+)?(?:function|class)\s+\w)/gm

export function computeFileId(project_id: string, rel_path: string): string {
  return createHash('sha256').update(`${project_id}:${rel_path}`).digest('hex')
}

export function contentSha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

export function detectCodeLanguage(rel_path: string, language?: string | null): string | null {
  if (language && language.trim()) return language.toLowerCase()
  return LANG_EXT_MAP[extname(rel_path).toLowerCase()] ?? null
}

export async function indexCodeFile(input: IndexCodeFileInput, db: Db = getDb()): Promise<IndexCodeFileResult> {
  const fileId = computeFileId(input.project_id, input.rel_path)
  const language = detectCodeLanguage(input.rel_path, input.language)
  const sha = input.sha256 ?? contentSha256(input.content)
  const mtimeNs = input.mtime_ns ?? Date.now() * 1_000_000
  const sizeBytes = input.size_bytes ?? Buffer.byteLength(input.content, 'utf8')
  const indexedAt = input.indexed_at ?? Date.now()

  try {
    const existing = db.prepare('SELECT sha256, status, chunks_count FROM code_files WHERE file_id = ?').get(fileId) as { sha256: string; status?: string; chunks_count: number } | undefined
    if (existing?.sha256 === sha && existing.status === 'indexed') {
      const chunksCount = countChunks(db, fileId)
      const contentHasChunks = input.content.trim().length > 0
      const hasExpectedChunks = contentHasChunks ? chunksCount > 0 : chunksCount === 0
      if (existing.chunks_count === chunksCount && hasExpectedChunks) {
        db.prepare(`
          UPDATE code_files
          SET mtime_ns = ?, indexed_at = ?, failure_reason = NULL, last_error_at = NULL
          WHERE file_id = ?
        `).run(mtimeNs, indexedAt, fileId)
        return {
          action: 'skipped',
          file_id: fileId,
          status: 'indexed',
          language,
          chunks_created: 0,
          chunks_deleted: 0,
          chunks_count: chunksCount,
          chunks: loadChunks(db, fileId),
        }
      }
    }

    const chunker = input.chunker ?? defaultCodeChunker
    const chunks = await chunker({ content: input.content, language, rel_path: input.rel_path })
    const existingChunks = db.prepare(`
      SELECT chunk_id, content_hash
      FROM code_chunks
      WHERE workspace_id = ? AND project_id = ? AND file_id = ?
      ORDER BY COALESCE(start_line, 1), COALESCE(end_line, COALESCE(start_line, 1)), chunk_id
    `).all(input.workspace_id, input.project_id, fileId) as Array<{ chunk_id: string; content_hash: string | null }>
    const existingByHash = new Map<string, Array<{ chunk_id: string; content_hash: string | null }>>()
    for (const chunk of existingChunks) {
      if (!chunk.content_hash) continue
      const bucket = existingByHash.get(chunk.content_hash) ?? []
      bucket.push(chunk)
      existingByHash.set(chunk.content_hash, bucket)
    }

    let chunksCreated = 0
    let chunksDeleted = 0
    const keptChunkIds = new Set<string>()
    const indexedAtIso = new Date(indexedAt).toISOString()
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO code_files (
          file_id, workspace_id, project_id, rel_path, language, sha256,
          mtime_ns, size_bytes, chunks_count, indexed_at, status, failure_reason, last_error_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'indexed', NULL, NULL)
        ON CONFLICT(project_id, rel_path) DO UPDATE SET
          file_id = excluded.file_id,
          workspace_id = excluded.workspace_id,
          language = excluded.language,
          sha256 = excluded.sha256,
          mtime_ns = excluded.mtime_ns,
          size_bytes = excluded.size_bytes,
          indexed_at = excluded.indexed_at,
          status = 'indexed',
          failure_reason = NULL,
          last_error_at = NULL
      `).run(
        fileId, input.workspace_id, input.project_id, input.rel_path, language ?? 'unknown',
        sha, mtimeNs, sizeBytes, indexedAt,
      )

      const insertChunk = db.prepare(`
        INSERT INTO code_chunks (
          chunk_id, workspace_id, project_id, file_path, file_id, language,
          chunk_strategy, source_type, content, start_line, end_line,
          symbol_path, content_hash, indexed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const updateChunk = db.prepare(`
        UPDATE code_chunks
        SET file_path = ?,
            file_id = ?,
            language = ?,
            chunk_strategy = ?,
            source_type = ?,
            content = ?,
            start_line = ?,
            end_line = ?,
            symbol_path = ?,
            content_hash = ?,
            indexed_at = ?
        WHERE chunk_id = ?
      `)
      for (const chunk of chunks) {
        const hash = contentSha256(chunk.text)
        const reusable = existingByHash.get(hash)?.shift()
        if (reusable) {
          updateChunk.run(
            input.rel_path,
            fileId,
            language,
            chunk.strategy,
            chunk.sourceType,
            chunk.text,
            chunk.startLine,
            chunk.endLine,
            chunk.symbolPath,
            hash,
            indexedAtIso,
            reusable.chunk_id,
          )
          keptChunkIds.add(reusable.chunk_id)
          continue
        }
        const chunkId = newId('chunk')
        insertChunk.run(
          chunkId,
          input.workspace_id,
          input.project_id,
          input.rel_path,
          fileId,
          language,
          chunk.strategy,
          chunk.sourceType,
          chunk.text,
          chunk.startLine,
          chunk.endLine,
          chunk.symbolPath,
          hash,
          indexedAtIso,
        )
        keptChunkIds.add(chunkId)
        chunksCreated++
        scheduleChunkEmbedding(db, chunkId, chunk.text)
      }

      const deleteChunk = db.prepare('DELETE FROM code_chunks WHERE chunk_id = ?')
      for (const chunk of existingChunks) {
        if (!keptChunkIds.has(chunk.chunk_id)) {
          deleteChunk.run(chunk.chunk_id)
          chunksDeleted++
        }
      }

      const count = countChunks(db, fileId)
      db.prepare(`
        UPDATE code_files
        SET chunks_count = ?, status = 'indexed', failure_reason = NULL, last_error_at = NULL
        WHERE file_id = ?
      `).run(count, fileId)
    })
    tx()

    const count = countChunks(db, fileId)
    return {
      action: existing ? 'updated' : 'indexed',
      file_id: fileId,
      status: 'indexed',
      language,
      chunks_created: chunksCreated,
      chunks_deleted: chunksDeleted,
      chunks_count: count,
      chunks: loadChunks(db, fileId),
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    markCodeFileState(db, {
      workspace_id: input.workspace_id,
      project_id: input.project_id,
      rel_path: input.rel_path,
      language,
      sha256: sha,
      mtime_ns: mtimeNs,
      size_bytes: sizeBytes,
      status: 'failed',
      failure_reason: reason,
    })
    return {
      action: 'failed',
      file_id: fileId,
      status: 'failed',
      language,
      chunks_created: 0,
      chunks_deleted: 0,
      chunks_count: 0,
      failure_reason: reason,
      chunks: [],
    }
  }
}

export function markCodeFileSkipped(input: MarkCodeFileSkippedInput, db: Db = getDb()): { file_id: string; status: CodeFileStatus } {
  const language = detectCodeLanguage(input.rel_path, input.language)
  markCodeFileState(db, {
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    rel_path: input.rel_path,
    language,
    sha256: input.sha256 ?? '',
    mtime_ns: input.mtime_ns ?? Date.now() * 1_000_000,
    size_bytes: input.size_bytes ?? 0,
    status: 'skipped',
    failure_reason: input.reason,
  })
  return { file_id: computeFileId(input.project_id, input.rel_path), status: 'skipped' }
}

export function markCodeFileFailed(input: MarkCodeFileFailedInput, db: Db = getDb()): { file_id: string; status: CodeFileStatus } {
  const language = detectCodeLanguage(input.rel_path, input.language)
  markCodeFileState(db, {
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    rel_path: input.rel_path,
    language,
    sha256: input.sha256 ?? '',
    mtime_ns: input.mtime_ns ?? Date.now() * 1_000_000,
    size_bytes: input.size_bytes ?? 0,
    status: 'failed',
    failure_reason: input.reason,
  })
  return { file_id: computeFileId(input.project_id, input.rel_path), status: 'failed' }
}

function markCodeFileState(
  db: Db,
  input: {
    workspace_id: string
    project_id: string
    rel_path: string
    language: string | null
    sha256: string
    mtime_ns: number
    size_bytes: number
    status: CodeFileStatus
    failure_reason: string
  },
): void {
  const fileId = computeFileId(input.project_id, input.rel_path)
  const now = Date.now()
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO code_files (
        file_id, workspace_id, project_id, rel_path, language, sha256,
        mtime_ns, size_bytes, chunks_count, indexed_at, status, failure_reason, last_error_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
      ON CONFLICT(project_id, rel_path) DO UPDATE SET
        file_id = excluded.file_id,
        workspace_id = excluded.workspace_id,
        language = excluded.language,
        sha256 = excluded.sha256,
        mtime_ns = excluded.mtime_ns,
        size_bytes = excluded.size_bytes,
        chunks_count = 0,
        indexed_at = excluded.indexed_at,
        status = excluded.status,
        failure_reason = excluded.failure_reason,
        last_error_at = excluded.last_error_at
    `).run(
      fileId,
      input.workspace_id,
      input.project_id,
      input.rel_path,
      input.language ?? 'unknown',
      input.sha256,
      input.mtime_ns,
      input.size_bytes,
      now,
      input.status,
      input.failure_reason,
      new Date(now).toISOString(),
    )
    db.prepare(`
      DELETE FROM code_chunks
      WHERE workspace_id = ? AND project_id = ? AND file_path = ?
    `).run(input.workspace_id, input.project_id, input.rel_path)
  })
  tx()
}

function countChunks(db: Db, fileId: string): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM code_chunks WHERE file_id = ?').get(fileId) as { n: number }
  return row.n
}

function loadChunks(db: Db, fileId: string): CodeIndexChunkRow[] {
  return db.prepare(`
    SELECT chunk_id, file_path, file_id, language, chunk_strategy, source_type,
           content, COALESCE(start_line, 1) AS start_line,
           COALESCE(end_line, COALESCE(start_line, 1)) AS end_line,
           symbol_path, content_hash
    FROM code_chunks
    WHERE file_id = ?
    ORDER BY start_line, end_line, chunk_id
  `).all(fileId) as CodeIndexChunkRow[]
}

async function defaultCodeChunker(input: { content: string; language: string | null }): Promise<CodeIndexChunk[]> {
  const language = input.language
  const isCode = language !== null && CODE_LANGUAGES.has(language)
  if (isCode && language !== null && AST_SUPPORTED.has(language)) {
    const astChunker = await createASTChunker()
    if (astChunker) {
      const astChunks = astChunker.chunkWithLanguage(input.content, language)
      const lineStarts = buildLineStartIndex(input.content)
      return astChunks
        .map(chunk => ({
          text: chunk.text,
          strategy: 'syntax' as const,
          sourceType: 'code' as const,
          symbolPath: chunk.name ?? null,
          startLine: byteOffsetToLine(chunk.start, lineStarts),
          endLine: byteOffsetToLine(Math.max(chunk.end - 1, chunk.start), lineStarts),
        }))
        .filter(chunk => chunk.text.trim())
    }
  }
  return isCode ? chunkSyntax(input.content) : chunkSemantic(input.content)
}

function chunkSyntax(content: string): CodeIndexChunk[] {
  const parts = content.split(SYNTAX_BOUNDARIES).filter(p => p.trim())
  const chunks: CodeIndexChunk[] = []
  let lineOffset = 0
  for (const part of parts) {
    const partLines = part.split('\n')
    const startLine = lineOffset + 1
    const match = part.match(/(?:export\s+)?(?:async\s+)?(?:function|class)\s+(\w+)/)
    const symbolPath = match ? match[1] ?? null : null
    if (part.length > MAX_CHUNK_CHARS) {
      const subChunks = splitByMaxSize(part, MAX_CHUNK_CHARS, 0)
      let subLine = startLine
      for (const sub of subChunks) {
        const subLines = sub.split('\n').length
        chunks.push({
          text: sub,
          strategy: 'syntax',
          sourceType: 'code',
          symbolPath,
          startLine: subLine,
          endLine: subLine + subLines - 1,
        })
        subLine += subLines
      }
    } else {
      chunks.push({
        text: part.trim(),
        strategy: 'syntax',
        sourceType: 'code',
        symbolPath,
        startLine,
        endLine: startLine + partLines.length - 1,
      })
    }
    lineOffset += partLines.length
  }
  if (chunks.length === 0 && content.trim()) {
    const totalLines = content.split('\n').length
    chunks.push({
      text: content.trim().slice(0, MAX_CHUNK_CHARS),
      strategy: 'syntax',
      sourceType: 'code',
      symbolPath: null,
      startLine: 1,
      endLine: totalLines,
    })
  }
  return chunks
}

function chunkSemantic(content: string): CodeIndexChunk[] {
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim())
  const chunks: CodeIndexChunk[] = []
  let lineOffset = 1
  for (const para of paragraphs) {
    const paraLines = para.split('\n').length
    const text = para.trim()
    if (text.length > MAX_CHUNK_CHARS) {
      const subChunks = splitByMaxSize(text, MAX_CHUNK_CHARS, PROSE_OVERLAP)
      let subLine = lineOffset
      for (const sub of subChunks) {
        const subLines = sub.split('\n').length
        chunks.push({
          text: sub,
          strategy: 'semantic',
          sourceType: 'prose',
          symbolPath: null,
          startLine: subLine,
          endLine: subLine + subLines - 1,
        })
        subLine += subLines
      }
    } else {
      chunks.push({
        text,
        strategy: 'semantic',
        sourceType: 'prose',
        symbolPath: null,
        startLine: lineOffset,
        endLine: lineOffset + paraLines - 1,
      })
    }
    lineOffset += paraLines + 1
  }
  return chunks
}

function splitByMaxSize(text: string, maxChars: number, overlap: number): string[] {
  const result: string[] = []
  let start = 0
  while (start < text.length) {
    const end = start + maxChars
    result.push(text.slice(start, end))
    start = end - overlap
    if (start >= text.length) break
  }
  return result
}

function buildLineStartIndex(source: string): number[] {
  const starts = [0]
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1)
  }
  return starts
}

function byteOffsetToLine(offset: number, lineStarts: number[]): number {
  let lo = 0
  let hi = lineStarts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (lineStarts[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

export async function storeChunkEmbedding(db: Db, chunk_id: string, text: string): Promise<void> {
  const embedder = getTextEmbedder()
  if (!embedder) {
    if (!_chunkEmbedLoggedOnce) {
      _chunkEmbedLoggedOnce = true
      process.stderr.write(`[embed] no embedder registered — chunk embeddings disabled (first chunk ${chunk_id})\n`)
    }
    return
  }
  try {
    const exists = db.prepare('SELECT 1 FROM code_chunks WHERE chunk_id = ?').get(chunk_id)
    if (!exists) return
    const embedFn = (embedder.embedDocument ?? embedder.embed).bind(embedder)
    const vec = await embedFn(text)
    const buf = Buffer.from(vec.buffer)
    // vec0 virtual tables do not honour INSERT OR REPLACE — repeat inserts
    // for the same chunk_id throw UNIQUE constraint. Explicit DELETE + INSERT
    // gives upsert semantics and matches ./embed.ts + sweep.ts.
    db.prepare('DELETE FROM vec_chunks WHERE chunk_id = ?').run(chunk_id)
    db.prepare('INSERT INTO vec_chunks(chunk_id, embedding) VALUES (?, ?)').run(chunk_id, buf)
    db.prepare('UPDATE code_chunks SET embedding = ? WHERE chunk_id = ?').run(buf, chunk_id)
  } catch (err) {
    process.stderr.write(`[embed] chunk ${chunk_id} failed: ${err instanceof Error ? err.message : String(err)}\n`)
  }
}

/**
 * Enqueue a chunk embedding — bounded concurrency (EMBED_CONCURRENCY).
 * Returns immediately; the embedding runs when a slot frees up. CLI callers
 * drain via flushPendingMemoryWrites before exit. Prevents the ONNX deadlock
 * observed when thousands of concurrent embeds pile up.
 */
export function scheduleChunkEmbedding(db: Db, chunk_id: string, text: string): void {
  void enqueueEmbed(() => storeChunkEmbedding(db, chunk_id, text))
    .catch((err: unknown) => {
      process.stderr.write(`[embed] chunk ${chunk_id}: ${err instanceof Error ? err.message : String(err)}\n`)
    })
}
