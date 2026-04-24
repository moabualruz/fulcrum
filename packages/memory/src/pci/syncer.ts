// v2a PR 4 Task 19 — PCI incremental ingest syncer.
//
// Subscribes to ContentChangeBus (code-kind events from PCI watcher). Turns
// filesystem changes into mtime→hash→chunk-diff cascades per prior-art reference syncer.ts:
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

import { readFileSync, statSync, lstatSync } from 'node:fs'
import { relative, join, isAbsolute } from 'node:path'
import type { Db } from 'fulcrum-agent-core'
import { getDb, getContentChangeBus, type ContentChangeEvent } from 'fulcrum-agent-core'
import { computeFileId, contentSha256, detectCodeLanguage, markCodeFileFailed, markCodeFileSkipped } from '../l2/code.js'
import { refreshGraphCoverageForCodeFile } from '../graph/coverage.js'
import { reduceFileToGraph, reduceUnlinkToGraph } from '../kuzu/reducers/code.js'
import { indexCodeFilePrimitive } from '../setup/backfill-code-files.js'
import { isTransientToolArtifactPath } from './walker-integration.js'

export { contentSha256 } from '../l2/code.js'

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

interface DeleteFileScope {
  workspaceId: string
  projectId: string
  relPath: string
}

interface PendingUnlink {
  fileId: string
  relPath: string
  sha256: string
  ts: number
}

// Keyed by fileId so two identical-content files can both be pending simultaneously.
// A separate sha256→fileId[] index enables rename detection without collision.
const pendingUnlinks = new Map<string, PendingUnlink>() // keyed by fileId
const pendingUnlinksBySha = new Map<string, string[]>() // sha256 → fileId[]

/**
 * Single-file sync entry point — used by the subscriber AND by one-shot
 * callers (tests, backfill, manual ingest). Idempotent.
 */
export async function syncFile(
  opts: PciSyncerOpts & { event: Pick<ContentChangeEvent, 'change_type' | 'path'> }
): Promise<{ action: 'indexed' | 'updated' | 'unlinked' | 'renamed' | 'skipped' | 'failed'; fileId: string }> {
  const db = opts.db ?? getDb()
  const { workspaceId, projectId, projectRoot, event } = opts
  const absPath = isAbsolute(event.path) ? event.path : join(projectRoot, event.path)
  const relPath = relative(projectRoot, absPath)
  if (!relPath || relPath.startsWith('..')) return { action: 'skipped', fileId: '' }
  const fileId = computeFileId(projectId, relPath)
  if (isTransientToolArtifactPath(relPath)) return { action: 'skipped', fileId }

  if (event.change_type === 'unlink') {
    // Look up the existing file's sha256 before cascade-delete so rename
    // detection (which keys off body-hash) can find it.
    const row = db.prepare('SELECT sha256 FROM code_files WHERE file_id = ?').get(fileId) as { sha256: string } | undefined
    if (!row) return { action: 'skipped', fileId }
    const pending: PendingUnlink = { fileId, relPath, sha256: row.sha256, ts: Date.now() }
    pendingUnlinks.set(fileId, pending)
    const shaList = pendingUnlinksBySha.get(row.sha256) ?? []
    if (!shaList.includes(fileId)) shaList.push(fileId)
    pendingUnlinksBySha.set(row.sha256, shaList)
    // Opportunistic GC — drop expired pending renames before inserting.
    sweepRenameWindow(db, { workspaceId, projectId })

    // Defer actual deletion so rename can reclaim; if nothing reclaims
    // within RENAME_WINDOW_MS, a second unlink call or the sweep deletes.
    setTimeout(() => {
      if (pendingUnlinks.has(fileId)) {
        clearPendingUnlink(fileId)
        deleteFile(db, fileId, { workspaceId, projectId, relPath })
      }
    }, RENAME_WINDOW_MS + 10).unref?.()
    return { action: 'unlinked', fileId }
  }

  // add / change / rename-candidate — read the file.
  // MED-12: lstat first to detect symlinks. Skip symlinks entirely — following
  // them lets a malicious PR point `docs/README.md -> ~/.aws/credentials` and
  // have PCI ingest the host's secrets.
  let content: string
  let stats: ReturnType<typeof statSync>
  try {
    const l = lstatSync(absPath)
    if (l.isSymbolicLink()) {
      markCodeFileSkipped({
        workspace_id: workspaceId,
        project_id: projectId,
        rel_path: relPath,
        language: detectCodeLanguage(relPath),
        reason: 'symlink_skipped',
      }, db)
      refreshGraphCoverageForCodeFile({ workspace_id: workspaceId, project_id: projectId, file_id: fileId, rel_path: relPath }, db)
      return { action: 'skipped', fileId }
    }
    if (!l.isFile()) return { action: 'skipped', fileId }
    stats = statSync(absPath)
    if (stats.size > 5 * 1024 * 1024) {
      markCodeFileSkipped({
        workspace_id: workspaceId,
        project_id: projectId,
        rel_path: relPath,
        language: detectCodeLanguage(relPath),
        mtime_ns: mtimeNs(stats),
        size_bytes: stats.size,
        reason: 'file_too_large',
      }, db)
      refreshGraphCoverageForCodeFile({ workspace_id: workspaceId, project_id: projectId, file_id: fileId, rel_path: relPath }, db)
      return { action: 'skipped', fileId }
    }
    // Minimal UTF-8 sanity check — reject binary files that would produce
    // garbage FTS5 tokens and waste vector storage (MEDIUM finding).
    const buf = readFileSync(absPath)
    for (let i = 0; i < Math.min(buf.length, 2048); i++) {
      if (buf[i] === 0) {
        markCodeFileSkipped({
          workspace_id: workspaceId,
          project_id: projectId,
          rel_path: relPath,
          language: detectCodeLanguage(relPath),
          sha256: contentSha256(buf),
          mtime_ns: mtimeNs(stats),
          size_bytes: stats.size,
          reason: 'binary_skipped',
        }, db)
        refreshGraphCoverageForCodeFile({ workspace_id: workspaceId, project_id: projectId, file_id: fileId, rel_path: relPath }, db)
        return { action: 'skipped', fileId }
      }
    }
    content = buf.toString('utf8')
  } catch {
    markCodeFileFailed({
      workspace_id: workspaceId,
      project_id: projectId,
      rel_path: relPath,
      language: detectCodeLanguage(relPath),
      reason: 'read_failed',
    }, db)
    refreshGraphCoverageForCodeFile({ workspace_id: workspaceId, project_id: projectId, file_id: fileId, rel_path: relPath }, db)
    return { action: 'failed', fileId }
  }

  const sha = contentSha256(content)
  sweepRenameWindow(db, { workspaceId, projectId })
  clearPendingUnlink(fileId)
  // Pick the first pending unlink with a matching sha256 that isn't the current fileId.
  const candidateFileIds = pendingUnlinksBySha.get(sha) ?? []
  const renameSourceId = candidateFileIds.find(id => id !== fileId)
  const rename = renameSourceId ? pendingUnlinks.get(renameSourceId) : undefined
  if (rename) {
    // Body-hash matched a pending unlink → migrate file_id + rel_path.
    clearPendingUnlink(rename.fileId)
    db.prepare('UPDATE code_files SET file_id = ?, rel_path = ? WHERE file_id = ?').run(fileId, relPath, rename.fileId)
    db.prepare('UPDATE code_chunks SET file_id = ?, file_path = ? WHERE file_id = ?').run(fileId, relPath, rename.fileId)
    refreshGraphCoverageForCodeFile({ workspace_id: workspaceId, project_id: projectId, file_id: rename.fileId, rel_path: rename.relPath }, db)
    refreshGraphCoverageForCodeFile({ workspace_id: workspaceId, project_id: projectId, file_id: fileId, rel_path: relPath }, db)
    await reduceFileToGraph(db, fileId).catch(() => { /* logged in reducer */ })
    return { action: 'renamed', fileId }
  }

  const result = await indexCodeFilePrimitive({
    workspace_id: workspaceId,
    project_id: projectId,
    rel_path: relPath,
    content,
    sha256: sha,
    mtime_ns: mtimeNs(stats),
    size_bytes: stats.size,
  }, db)

  if (result.action === 'indexed' || result.action === 'updated') {
    refreshGraphCoverageForCodeFile({ workspace_id: workspaceId, project_id: projectId, file_id: fileId, rel_path: relPath }, db)
    await reduceFileToGraph(db, fileId).catch(() => { /* logged in reducer */ })
  }

  return { action: result.action, fileId }
}

function mtimeNs(stats: ReturnType<typeof statSync> | undefined): number {
  if (!stats) return Date.now() * 1_000_000
  // node returns mtimeMs; promote to nanoseconds for schema.
  return Math.round(Number(stats.mtimeMs) * 1_000_000)
}

function deleteFile(db: Db, fileId: string, scope?: DeleteFileScope): void {
  const chunkIds = (db.prepare('SELECT chunk_id FROM code_chunks WHERE file_id = ?').all(fileId) as Array<{ chunk_id: string }>)
    .map(row => row.chunk_id)
  for (const chunkId of chunkIds) {
    try { db.prepare('DELETE FROM vec_chunks WHERE chunk_id = ?').run(chunkId) }
    catch { /* vec_chunks may be unavailable if vec0 is not loaded */ }
    db.prepare(`
      DELETE FROM vector_metadata
       WHERE source_domain = 'code_chunk' AND source_id = ?
    `).run(chunkId)
    db.prepare(`
      DELETE FROM embedding_job_items
       WHERE source_domain = 'code_chunks' AND source_id = ?
    `).run(chunkId)
  }
  try { db.prepare('DELETE FROM code_files WHERE file_id = ?').run(fileId) }
  catch { /* cascade clears chunks/symbols via FK */ }
  try { db.prepare('DELETE FROM code_chunks WHERE file_id = ?').run(fileId) }
  catch { /* some schema versions don't cascade, best-effort */ }
  if (scope) {
    refreshGraphCoverageForCodeFile({
      workspace_id: scope.workspaceId,
      project_id: scope.projectId,
      file_id: fileId,
      rel_path: scope.relPath,
    }, db)
  }
  // v2a PR 7 Task 37 — drop the File node + its edges + chunks/symbols.
  // Fire-and-forget; graph eventually converges.
  void reduceUnlinkToGraph(fileId).catch(() => { /* logged inside reducer */ })
}

function clearPendingUnlink(fileId: string): void {
  const pending = pendingUnlinks.get(fileId)
  if (!pending) return
  pendingUnlinks.delete(fileId)
  const list = pendingUnlinksBySha.get(pending.sha256) ?? []
  const idx = list.indexOf(fileId)
  if (idx !== -1) list.splice(idx, 1)
  if (list.length === 0) pendingUnlinksBySha.delete(pending.sha256)
  else pendingUnlinksBySha.set(pending.sha256, list)
}

function sweepRenameWindow(db: Db, scope?: { workspaceId: string; projectId: string }): void {
  const now = Date.now()
  for (const [fid, pending] of pendingUnlinks.entries()) {
    if (now - pending.ts > RENAME_WINDOW_MS * 4) {
      clearPendingUnlink(fid)
      deleteFile(db, fid, scope ? { ...scope, relPath: pending.relPath } : undefined)
    }
  }
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
