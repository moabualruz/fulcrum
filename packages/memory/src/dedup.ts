// packages/memory/src/dedup.ts
import { createHash } from 'crypto'
import type Database from 'better-sqlite3'

export function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/**
 * Returns the existing memory_id if a memory with the same content_hash exists
 * in the given workspace+project scope, or null if none found.
 */
export function isDuplicate(input: {
  db: Database.Database
  workspace_id: string
  project_id: string | null
  hash: string
}): string | null {
  const { db, workspace_id, project_id, hash } = input
  const row = project_id !== null
    ? db.prepare(
        'SELECT memory_id FROM memories WHERE workspace_id = ? AND project_id = ? AND content_hash = ? LIMIT 1'
      ).get(workspace_id, project_id, hash) as { memory_id: string } | undefined
    : db.prepare(
        'SELECT memory_id FROM memories WHERE workspace_id = ? AND project_id IS NULL AND content_hash = ? LIMIT 1'
      ).get(workspace_id, hash) as { memory_id: string } | undefined

  return row?.memory_id ?? null
}
