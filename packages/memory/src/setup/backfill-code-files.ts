// v2a PR 3 Task 16 — backfill code_files rows for existing code_chunks.
//
// Walks distinct file_path values from code_chunks, joins to projects via
// project_id, computes file_id = sha256(project_id + ':' + rel_path),
// inserts a code_files row, and updates code_chunks.file_id. Idempotent —
// safe to re-run.

import type { Db } from 'fulcrum-agent-core'
import { getDb } from 'fulcrum-agent-core'
import { existsSync } from 'fs'
import { isAbsolute, resolve } from 'path'
import { computeFileId, indexCodeFile } from '../l2/code.js'
import type { IndexCodeFileInput, IndexCodeFileResult } from '../l2/code.js'

export interface BackfillResult {
  filesBackfilled: number
  chunksLinked: number
  alreadyLinked: number
  staleFailuresPruned: number
}

export interface BackfillScope {
  workspace_id: string
  project_id: string
}

export { computeFileId } from '../l2/code.js'

export function indexCodeFilePrimitive(input: IndexCodeFileInput, db: Db = getDb()): Promise<IndexCodeFileResult> {
  return indexCodeFile(input, db)
}

function pruneMissingFailedCodeFiles(db: Db, scope?: BackfillScope): number {
  const scopeWhere = scope ? 'AND cf.workspace_id = ? AND cf.project_id = ?' : ''
  const scopeParams = scope ? [scope.workspace_id, scope.project_id] : []
  const rows = db.prepare(`
    SELECT cf.file_id, cf.rel_path, p.root_realpath
      FROM code_files cf
      JOIN projects p
        ON p.workspace_id = cf.workspace_id
       AND p.project_id = cf.project_id
     WHERE (cf.status = 'failed' OR cf.parse_status = 'failed')
       AND cf.failure_reason = 'read_failed'
       AND cf.chunks_count = 0
       ${scopeWhere}
  `).all(...scopeParams) as Array<{ file_id: string; rel_path: string; root_realpath: string | null }>

  let pruned = 0
  const deleteFile = db.prepare('DELETE FROM code_files WHERE file_id = ?')
  for (const row of rows) {
    if (!row.root_realpath) continue
    const filePath = isAbsolute(row.rel_path) ? row.rel_path : resolve(row.root_realpath, row.rel_path)
    if (existsSync(filePath)) continue
    pruned += deleteFile.run(row.file_id).changes
  }
  return pruned
}

export function backfillCodeFiles(db: Db = getDb(), scope?: BackfillScope): BackfillResult {
  const scopeWhere = scope ? 'AND workspace_id = ? AND project_id = ?' : ''
  const scopeParams = scope ? [scope.workspace_id, scope.project_id] : []
  const distinct = db.prepare(`
    SELECT DISTINCT workspace_id, project_id, file_path
    FROM code_chunks
    WHERE file_id IS NULL
      ${scopeWhere}
  `).all(...scopeParams) as Array<{ workspace_id: string; project_id: string; file_path: string }>

  const insertFile = db.prepare(`
    INSERT OR IGNORE INTO code_files (file_id, workspace_id, project_id, rel_path, language, sha256, mtime_ns, size_bytes, chunks_count, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const updateChunks = db.prepare(`UPDATE code_chunks SET file_id = ? WHERE file_id IS NULL AND workspace_id = ? AND project_id = ? AND file_path = ?`)
  const countLinked = db.prepare(`
    SELECT COUNT(*) AS n FROM code_chunks
    WHERE file_id IS NOT NULL
      ${scopeWhere}
  `).get(...scopeParams) as { n: number }
  const before = countLinked.n

  let filesBackfilled = 0
  let chunksLinked = 0
  const staleFailuresPruned = pruneMissingFailedCodeFiles(db, scope)
  const now = Date.now()

  const tx = db.transaction(() => {
    for (const row of distinct) {
      const file_id = computeFileId(row.project_id, row.file_path)
      insertFile.run(file_id, row.workspace_id, row.project_id, row.file_path, 'unknown', '', 0, 0, 0, now)
      const result = updateChunks.run(file_id, row.workspace_id, row.project_id, row.file_path)
      filesBackfilled++
      chunksLinked += result.changes
    }
  })
  tx()

  // Refresh chunks_count on backfilled file rows.
  if (scope) {
    db.prepare(`
      UPDATE code_files
      SET chunks_count = (SELECT COUNT(*) FROM code_chunks c WHERE c.file_id = code_files.file_id)
      WHERE workspace_id = ? AND project_id = ?
    `).run(scope.workspace_id, scope.project_id)
  } else {
    db.prepare(`
      UPDATE code_files
      SET chunks_count = (SELECT COUNT(*) FROM code_chunks c WHERE c.file_id = code_files.file_id)
    `).run()
  }

  return { filesBackfilled, chunksLinked, alreadyLinked: before, staleFailuresPruned }
}
