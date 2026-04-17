// v2a PR 4 Task 19 — PCI incremental ingest syncer.
//
// Subscribes to ContentChangeBus (code-kind events from PCI watcher). Turns
// filesystem changes into mtime→hash→chunk-diff cascades per osgrep syncer.ts:
//
//   add    → read file, chunk, insert code_files row + code_chunks + memory
//   change → diff chunks by content_hash; insert new, delete removed, preserve
//            matched chunk_ids so embeddings survive
//   unlink → DELETE code_files (cascade clears code_chunks + code_symbols)
//   rename → fs.watch emits unlink+add; if body-hash matches within 500ms we
//            treat it as rename and migrate the file_id to the new rel_path
//
// Errors are logged, never block the bus. Two emit modes:
//   * event-driven: call startPciSyncer({db, projectId, workspaceId, root})
//     once per project; handler stays subscribed until stop() is called
//   * on-demand: syncFile({...}) runs a single file through the cascade

import { readFileSync, statSync } from 'node:fs'
import { relative, extname, join, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { ulid } from 'ulidx'
import type { Db } from '@moabualruz/fulcrum-core'
import { getDb, getContentChangeBus, type ContentChangeEvent } from '@moabualruz/fulcrum-core'
import { computeFileId } from '../setup/backfill-code-files.js'
import { ingestFile as fullIngest } from '../ingest.js'
import { reduceFileToGraph, reduceUnlinkToGraph } from '../kuzu/reducers/code.js'

const LANG_EXT_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript',
  '.py': 'python', '.java': 'java', '.go': 'go', '.rs': 'rust',
  '.c': 'c', '.cpp': 'cpp', '.cc': 'cpp',
  '.md': 'markdown', '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
}

// Rename-detection window — an unlink followed by an add carrying the same
// body hash within this window is treated as a rename, not a delete+create.
const RENAME_WINDOW_MS = 500

export interface PciSyncerOpts {
  db?: Db
  workspaceId: string
  projectId: string
  /** Absolute project root. rel_path is computed from this. */
  projectRoot: string
}

export interface PciSyncerHandle {
  stop: () => void
}

interface PendingUnlink {
  fileId: string
  relPath: string
  sha256: string
  ts: number
}

const pendingUnlinks = new Map<string, PendingUnlink>() // keyed by sha256

export function contentSha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Single-file sync entry point — used by the subscriber AND by one-shot
 * callers (tests, backfill, manual ingest). Idempotent.
 */
export async function syncFile(
  opts: PciSyncerOpts & { event: Pick<ContentChangeEvent, 'change_type' | 'path'> }
): Promise<{ action: 'indexed' | 'updated' | 'unlinked' | 'renamed' | 'skipped'; fileId: string }> {
  const db = opts.db ?? getDb()
  const { workspaceId, projectId, projectRoot, event } = opts
  const absPath = isAbsolute(event.path) ? event.path : join(projectRoot, event.path)
  const relPath = relative(projectRoot, absPath)
  if (!relPath || relPath.startsWith('..')) return { action: 'skipped', fileId: '' }
  const fileId = computeFileId(projectId, relPath)

  if (event.change_type === 'unlink') {
    // Look up the existing file's sha256 before cascade-delete so rename
    // detection (which keys off body-hash) can find it.
    const row = db.prepare('SELECT sha256 FROM code_files WHERE file_id = ?').get(fileId) as { sha256: string } | undefined
    if (!row) return { action: 'skipped', fileId }
    pendingUnlinks.set(row.sha256, { fileId, relPath, sha256: row.sha256, ts: Date.now() })
    // Opportunistic GC — drop expired pending renames before inserting.
    sweepRenameWindow()

    // Defer actual deletion so rename can reclaim; if nothing reclaims
    // within RENAME_WINDOW_MS, a second unlink call or the sweep deletes.
    setTimeout(() => {
      const still = pendingUnlinks.get(row.sha256)
      if (still && still.fileId === fileId) {
        pendingUnlinks.delete(row.sha256)
        deleteFile(db, fileId)
      }
    }, RENAME_WINDOW_MS + 10).unref?.()
    return { action: 'unlinked', fileId }
  }

  // add / change / rename-candidate — read the file.
  let content: string
  let stats: ReturnType<typeof statSync>
  try {
    stats = statSync(absPath)
    if (stats.size > 5 * 1024 * 1024) return { action: 'skipped', fileId } // >5 MiB safety cap
    content = readFileSync(absPath, 'utf8')
  } catch {
    return { action: 'skipped', fileId }
  }

  const sha = contentSha256(content)
  sweepRenameWindow()
  const rename = pendingUnlinks.get(sha)
  if (rename && rename.fileId !== fileId) {
    // Body-hash matched a pending unlink → migrate file_id + rel_path.
    pendingUnlinks.delete(sha)
    db.prepare('UPDATE code_files SET file_id = ?, rel_path = ? WHERE file_id = ?').run(fileId, relPath, rename.fileId)
    db.prepare('UPDATE code_chunks SET file_id = ?, file_path = ? WHERE file_id = ?').run(fileId, relPath, rename.fileId)
    return { action: 'renamed', fileId }
  }

  const existing = db.prepare('SELECT sha256, mtime_ns FROM code_files WHERE file_id = ?').get(fileId) as { sha256: string; mtime_ns: number } | undefined
  if (existing && existing.sha256 === sha) {
    // Content unchanged — just bump mtime.
    db.prepare('UPDATE code_files SET mtime_ns = ? WHERE file_id = ?').run(mtimeNs(stats), fileId)
    return { action: 'skipped', fileId }
  }

  const ext = extname(relPath).toLowerCase()
  const language = LANG_EXT_MAP[ext] ?? 'unknown'

  if (existing) {
    // change: diff chunks by content_hash.
    await applyChunkDiff(db, { workspaceId, projectId, fileId, relPath, content, language })
    db.prepare('UPDATE code_files SET sha256 = ?, mtime_ns = ?, size_bytes = ?, indexed_at = ? WHERE file_id = ?').run(sha, mtimeNs(stats), stats.size, Date.now(), fileId)
    // v2a PR 7 Task 37 — project updated rows into Kuzu; fire-and-forget.
    void reduceFileToGraph(db, fileId).catch(() => { /* logged in reducer */ })
    return { action: 'updated', fileId }
  }

  // add: insert code_files row, then full ingest. Insert FIRST so the
  // file_id FK is satisfiable by the chunk inserts inside fullIngest.
  db.prepare(`INSERT OR IGNORE INTO code_files
    (file_id, workspace_id, project_id, rel_path, language, sha256, mtime_ns, size_bytes, chunks_count, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(fileId, workspaceId, projectId, relPath, language, sha, mtimeNs(stats), stats.size, Date.now())

  await fullIngest({ workspace_id: workspaceId, project_id: projectId, file_path: relPath, content, language }, db)

  // Backfill file_id on the newly-inserted chunks + refresh count.
  db.prepare('UPDATE code_chunks SET file_id = ? WHERE workspace_id = ? AND project_id = ? AND file_path = ? AND file_id IS NULL').run(fileId, workspaceId, projectId, relPath)
  const count = db.prepare('SELECT COUNT(*) AS n FROM code_chunks WHERE file_id = ?').get(fileId) as { n: number }
  db.prepare('UPDATE code_files SET chunks_count = ? WHERE file_id = ?').run(count.n, fileId)

  // v2a PR 7 Task 37 — project new rows into Kuzu.
  void reduceFileToGraph(db, fileId).catch(() => { /* logged in reducer */ })

  return { action: 'indexed', fileId }
}

function mtimeNs(stats: ReturnType<typeof statSync> | undefined): number {
  if (!stats) return Date.now() * 1_000_000
  // node returns mtimeMs; promote to nanoseconds for schema.
  return Math.round(Number(stats.mtimeMs) * 1_000_000)
}

function deleteFile(db: Db, fileId: string): void {
  try { db.prepare('DELETE FROM code_files WHERE file_id = ?').run(fileId) }
  catch { /* cascade clears chunks/symbols via FK */ }
  try { db.prepare('DELETE FROM code_chunks WHERE file_id = ?').run(fileId) }
  catch { /* some schema versions don't cascade, best-effort */ }
  // v2a PR 7 Task 37 — drop the File node + its edges + chunks/symbols.
  // Fire-and-forget; graph eventually converges.
  void reduceUnlinkToGraph(fileId).catch(() => { /* logged inside reducer */ })
}

function sweepRenameWindow(): void {
  const now = Date.now()
  for (const [sha, pending] of pendingUnlinks.entries()) {
    if (now - pending.ts > RENAME_WINDOW_MS * 4) {
      pendingUnlinks.delete(sha)
    }
  }
}

/**
 * Re-chunk the file, insert new chunk_ids not yet present, delete chunks
 * whose content_hash is no longer in the new chunk set. The syntactically
 * unchanged chunks keep their chunk_id (preserving embeddings).
 */
async function applyChunkDiff(
  db: Db,
  args: { workspaceId: string; projectId: string; fileId: string; relPath: string; content: string; language: string },
): Promise<void> {
  const { workspaceId, projectId, fileId, relPath, content, language } = args

  // Lift the existing chunker path by running fullIngest on a scratch
  // project_id slot, then reconcile. Simpler: re-chunk inline by reading
  // from the live chunker module. Done via a lightweight re-chunking
  // duplicated from ingest.ts (semantic/syntax split).
  const newChunks = await rechunk(content, language)

  const existing = db.prepare('SELECT chunk_id, content_hash FROM code_chunks WHERE file_id = ?').all(fileId) as Array<{ chunk_id: string; content_hash: string | null }>
  const existingByHash = new Map(existing.filter(c => c.content_hash).map(c => [c.content_hash!, c.chunk_id]))
  const newHashes = new Set(newChunks.map(c => contentSha256(c.text)))

  // Insert chunks whose content_hash isn't already present.
  const insert = db.prepare(`INSERT INTO code_chunks
    (chunk_id, workspace_id, project_id, file_path, file_id, language, chunk_strategy, source_type, content, start_line, end_line, symbol_path, content_hash, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`)
  for (const chunk of newChunks) {
    const h = contentSha256(chunk.text)
    if (existingByHash.has(h)) continue
    insert.run(
      ulid(), workspaceId, projectId, relPath, fileId, language,
      chunk.strategy, chunk.sourceType, chunk.text,
      chunk.startLine, chunk.endLine, chunk.symbolPath, h,
    )
  }

  // Delete chunks whose content_hash is gone.
  const del = db.prepare('DELETE FROM code_chunks WHERE chunk_id = ?')
  for (const c of existing) {
    if (c.content_hash && !newHashes.has(c.content_hash)) {
      del.run(c.chunk_id)
    }
  }

  // Refresh count.
  const count = db.prepare('SELECT COUNT(*) AS n FROM code_chunks WHERE file_id = ?').get(fileId) as { n: number }
  db.prepare('UPDATE code_files SET chunks_count = ? WHERE file_id = ?').run(count.n, fileId)
}

interface RechunkResult {
  text: string
  strategy: 'syntax' | 'semantic'
  sourceType: 'code' | 'prose'
  symbolPath: string | null
  startLine: number
  endLine: number
}

const CODE_LANGUAGES = new Set(['typescript', 'javascript', 'python', 'java', 'go', 'rust', 'c', 'cpp'])
const MAX_CHUNK_CHARS = 1600
const SYNTAX_BOUNDARIES = /(?=^(?:export\s+)?(?:async\s+)?(?:function|class)\s+\w)/gm

async function rechunk(content: string, language: string): Promise<RechunkResult[]> {
  const isCode = CODE_LANGUAGES.has(language)
  const strategy: 'syntax' | 'semantic' = isCode ? 'syntax' : 'semantic'
  const sourceType: 'code' | 'prose' = isCode ? 'code' : 'prose'

  if (isCode) {
    const parts = content.split(SYNTAX_BOUNDARIES).filter(p => p.trim())
    const result: RechunkResult[] = []
    let offset = 0
    for (const part of parts) {
      const partLines = part.split('\n')
      const match = part.match(/(?:export\s+)?(?:async\s+)?(?:function|class)\s+(\w+)/)
      const symbolPath = match ? match[1] ?? null : null
      const slice = part.length > MAX_CHUNK_CHARS ? part.slice(0, MAX_CHUNK_CHARS) : part.trim()
      result.push({
        text: slice || part,
        strategy, sourceType, symbolPath,
        startLine: offset + 1,
        endLine: offset + partLines.length,
      })
      offset += partLines.length
    }
    if (result.length === 0 && content.trim()) {
      result.push({ text: content.trim().slice(0, MAX_CHUNK_CHARS), strategy, sourceType, symbolPath: null, startLine: 1, endLine: content.split('\n').length })
    }
    return result
  }

  // prose
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim())
  const result: RechunkResult[] = []
  let line = 1
  for (const para of paragraphs) {
    const paraLines = para.split('\n').length
    result.push({
      text: para.trim().slice(0, MAX_CHUNK_CHARS),
      strategy, sourceType, symbolPath: null,
      startLine: line,
      endLine: line + paraLines - 1,
    })
    line += paraLines + 1
  }
  return result
}

/**
 * Subscribe to the bus; route code-kind events through syncFile(). Returns
 * a handle that unsubscribes on stop().
 */
export function startPciSyncer(opts: PciSyncerOpts): PciSyncerHandle {
  const bus = getContentChangeBus()
  const handler = async (evt: ContentChangeEvent): Promise<void> => {
    if (evt.kind !== 'code') return
    try {
      await syncFile({ ...opts, event: evt })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`[pci-syncer] ${evt.change_type} ${evt.path}: ${msg}\n`)
    }
  }
  bus.on(handler)
  return {
    stop: () => bus.off(handler),
  }
}
