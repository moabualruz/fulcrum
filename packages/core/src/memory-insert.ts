// packages/core/src/memory-insert.ts
//
// Lightweight direct-INSERT helper for internal lifecycle memory writes.
// Used by runs.ts (task_outcome / task_failure / task_decision) and
// cos-parser.ts (CoS memory_writes).
//
// Does NOT run the L0/L1/L2 extraction pipeline — that is intentional.
// Internal lifecycle events are persisted as raw rows with SHA-256 dedup.
// External callers should use fulcrum-memory for full pipeline writes.

import { createHash } from 'crypto'
import { getDb , Db} from './db/client.js'
import { newId } from './ids.js'
import type { MemoryKind, MemoryScope } from './types.js'

export interface LifecycleMemoryInput {
  workspace_id: string
  project_id: string
  content: string
  kind: MemoryKind
  scope: MemoryScope
  task_id?: string
  tags?: string[]
  importance?: number
  confidence?: number
  /** Provenance tag. 'auto' = written by run lifecycle hooks; 'setup' = written
   *  during install; 'manual' = written by an agent or user explicitly. Default: 'manual'. */
  source?: 'auto' | 'manual' | 'setup'
}

/**
 * Write a lifecycle memory row directly to SQLite.
 *
 * 1. Computes SHA-256 of content as content_hash.
 * 2. Checks for duplicate: if content_hash already exists in this
 *    workspace+project, bumps access_count and returns early.
 * 3. Otherwise INSERTs a new row with sensible defaults.
 *
 * Returns void — callers (safeWriteMemory wrappers) do not use the result.
 */
export async function writeLifecycleMemory(
  input: LifecycleMemoryInput,
  db: Db = getDb(),
): Promise<void> {
  if (!input.content.trim()) return

  const content_hash = createHash('sha256').update(input.content).digest('hex')
  const now = new Date().toISOString()

  // Dedup check: skip if same content_hash exists in this workspace+project
  const existing = db
    .prepare(
      'SELECT memory_id FROM memories WHERE workspace_id = ? AND project_id = ? AND content_hash = ? LIMIT 1',
    )
    .get(input.workspace_id, input.project_id, content_hash) as
    | { memory_id: string }
    | undefined

  if (existing) {
    db.prepare(
      'UPDATE memories SET access_count = access_count + 1, updated_at = ? WHERE memory_id = ?',
    ).run(now, existing.memory_id)
    return
  }

  const memory_id = newId('memory')
  const title = input.content.slice(0, 80)
  const summary = title
  const scope = input.scope
  const kind = input.kind
  const confidence = input.confidence ?? 1.0
  const importance = input.importance ?? 0.5
  const tags = JSON.stringify(input.tags ?? [])
  const source = input.source ?? 'manual'

  db.prepare(`
    INSERT INTO memories (
      memory_id, workspace_id, project_id,
      scope, kind, title, summary,
      content, tags, entities, confidence, freshness, importance,
      file_path, symbol_path, event_time, content_hash,
      task_id, issue_id, artifact_id, provenance_refs,
      embedding, source, created_at, updated_at, last_accessed_at, access_count
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, 0
    )
  `).run(
    memory_id,
    input.workspace_id,
    input.project_id,
    scope,
    kind,
    title,
    summary,
    input.content, // content (memory v3 PR 9.3 retired canonical_text)
    tags,
    '[]', // entities
    confidence,
    1.0, // freshness
    importance,
    null, // file_path
    null, // symbol_path
    null, // event_time
    content_hash,
    input.task_id ?? null,
    null, // issue_id
    null, // artifact_id
    '[]', // provenance_refs
    null, // embedding
    source,
    now,
    now,
    now,
  )
}
