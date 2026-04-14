// packages/memory/src/write.ts
import { ulid } from 'ulid'
import { getDb, FulcrumError } from '@fulcrum/core'
import { contentHash, isDuplicate } from './dedup.js'
import { rowToFullMemory } from './mappers.js'
import type { WriteMemoryInput, FullMemory } from './types.js'

export async function writeMemory(input: WriteMemoryInput): Promise<FullMemory> {
  if (!input.title.trim()) throw new FulcrumError('title must not be empty', 'invalid_input')
  if (!input.content.trim()) throw new FulcrumError('content must not be empty', 'invalid_input')
  if (input.confidence !== undefined && (input.confidence < 0 || input.confidence > 1)) {
    throw new FulcrumError('confidence must be between 0 and 1', 'invalid_input')
  }

  const db = getDb()
  const now = new Date().toISOString()
  const hash = contentHash(input.content)

  // SHA256 dedup: if same content_hash exists in this workspace+project, bump access_count
  const existingId = isDuplicate({ db, workspace_id: input.workspace_id, project_id: input.project_id, hash })
  if (existingId) {
    db.prepare(
      'UPDATE memories SET access_count = access_count + 1, updated_at = ? WHERE memory_id = ?'
    ).run(now, existingId)
    const updated = db.prepare('SELECT * FROM memories WHERE memory_id = ?').get(existingId) as Record<string, unknown>
    return rowToFullMemory(updated)
  }

  const memory_id = ulid()
  const embeddingBuffer = input.embedding ? Buffer.from(input.embedding.buffer) : null

  db.prepare(`
    INSERT INTO memories (
      memory_id, workspace_id, project_id,
      scope, kind, title, summary, canonical_text,
      content, tags, entities, confidence, freshness,
      file_path, symbol_path, event_time, content_hash,
      task_id, issue_id, artifact_id, provenance_refs,
      embedding, created_at, updated_at, last_accessed_at, access_count
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, 0
    )
  `).run(
    memory_id, input.workspace_id, input.project_id ?? null,
    // canonical_text defaults to raw content when no structured canonical form is provided;
    // callers may override by passing explicit canonical_text in WriteMemoryInput
    input.scope, input.kind, input.title, input.summary, input.canonical_text ?? input.content,
    input.content, JSON.stringify(input.tags ?? []), JSON.stringify(input.entities ?? []), input.confidence ?? 1.0, input.freshness ?? 1.0,
    input.file_path ?? null, input.symbol_path ?? null, input.event_time ?? null, hash,
    input.task_id ?? null, input.issue_id ?? null, input.artifact_id ?? null, JSON.stringify(input.provenance_refs ?? []),
    embeddingBuffer, now, now, now
  )

  const row = db.prepare('SELECT * FROM memories WHERE memory_id = ?').get(memory_id) as Record<string, unknown> | undefined
  if (!row) throw new FulcrumError(`Memory ${memory_id} not found after insert`, 'not_found')
  return rowToFullMemory(row)
}
