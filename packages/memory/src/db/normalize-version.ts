// PR 15 Task 6.2 — normalize_version background re-processor.
//
// Scans rows where normalize_version < CURRENT_VERSION, re-runs sanitize + chunker,
// updates rows. Triggered at MCP server start.

import type { Db } from 'fulcrum-agent-core'
import { getDb } from 'fulcrum-agent-core'
import { sanitizeOnWrite } from '../sanitize/index.js'

/** Bump this when sanitizer or chunker rules change. Old rows will be reprocessed. */
export const CURRENT_VERSION = 1

export interface StaleRow {
  memory_id: string
  content: string
  kind: string
  workspace_id: string
}

export interface NormalizeResult {
  updated: number
  errors: string[]
}

export function scanStaleRows(db: Db): StaleRow[] {
  return db.prepare(`
    SELECT memory_id, content, kind, workspace_id
    FROM memories
    WHERE normalize_version < ?
    LIMIT 500
  `).all(CURRENT_VERSION) as StaleRow[]
}

export async function runNormalizeVersion(db: Db = getDb()): Promise<NormalizeResult> {
  const stale = scanStaleRows(db)
  const errors: string[] = []
  let updated = 0

  for (const row of stale) {
    try {
      // Re-sanitize content
      const sanitized = sanitizeOnWrite(row.content, { workspace_id: row.workspace_id })
      const now = new Date().toISOString()
      db.prepare(`
        UPDATE memories
        SET content = ?, normalize_version = ?, updated_at = ?
        WHERE memory_id = ?
      `).run(sanitized.content, CURRENT_VERSION, now, row.memory_id)
      updated++
    } catch (err) {
      errors.push(`${row.memory_id}: ${String(err)}`)
    }
  }

  return { updated, errors }
}

/** Run normalize sweep in background (fire-and-forget, called at MCP server start). */
export function startNormalizeVersionSweep(db: Db = getDb()): void {
  setImmediate(() => {
    runNormalizeVersion(db).catch(err => {
      console.error('[fulcrum] normalize_version sweep error:', err)
    })
  })
}
