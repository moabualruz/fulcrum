// v2a PR 3 Task 16 — backfill code_files rows for existing code_chunks.
//
// Walks distinct file_path values from code_chunks, joins to projects via
// project_id, computes file_id = sha256(project_id + ':' + rel_path),
// inserts a code_files row, and updates code_chunks.file_id. Idempotent —
// safe to re-run.

import { createHash } from 'node:crypto'
import type { Db } from 'fulcrum-core'
import { getDb } from 'fulcrum-core'

export interface BackfillResult {
  filesBackfilled: number
  chunksLinked: number
  alreadyLinked: number
}

export function computeFileId(project_id: string, rel_path: string): string {
  return createHash('sha256').update(`${project_id}:${rel_path}`).digest('hex')
}

export function backfillCodeFiles(db: Db = getDb()): BackfillResult {
  const distinct = db.prepare(`
    SELECT DISTINCT workspace_id, project_id, file_path
    FROM code_chunks
    WHERE file_id IS NULL
  `).all() as Array<{ workspace_id: string; project_id: string; file_path: string }>

  const insertFile = db.prepare(`
    INSERT OR IGNORE INTO code_files (file_id, workspace_id, project_id, rel_path, language, sha256, mtime_ns, size_bytes, chunks_count, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const updateChunks = db.prepare(`UPDATE code_chunks SET file_id = ? WHERE file_id IS NULL AND workspace_id = ? AND project_id = ? AND file_path = ?`)
  const countLinked = db.prepare(`SELECT COUNT(*) AS n FROM code_chunks WHERE file_id IS NOT NULL`).get() as { n: number }
  const before = countLinked.n

  let filesBackfilled = 0
  let chunksLinked = 0
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
  db.prepare(`
    UPDATE code_files
    SET chunks_count = (SELECT COUNT(*) FROM code_chunks c WHERE c.file_id = code_files.file_id)
  `).run()

  return { filesBackfilled, chunksLinked, alreadyLinked: before }
}
