// packages/memory/src/write.ts
import { ulid } from 'ulid'
import { getDb, FulcrumError } from '@fulcrum/core'
import { contentHash, isDuplicate } from './dedup.js'
import type { WriteMemoryInput, FullMemory } from './types.js'

function rowToFullMemory(row: Record<string, unknown>): FullMemory {
  return {
    memory_id: row.memory_id as string,
    scope: row.scope as FullMemory['scope'],
    kind: row.kind as FullMemory['kind'],
    workspace_id: row.workspace_id as string,
    project_id: row.project_id as string | null,
    file_path: row.file_path as string | null,
    symbol_path: row.symbol_path as string | null,
    title: row.title as string,
    summary: row.summary as string,
    canonical_text: row.canonical_text as string | null,
    tags: (() => { try { return JSON.parse(row.tags as string) as string[] } catch { return [] } })(),
    entities: (() => { try { return JSON.parse(row.entities as string) as string[] } catch { return [] } })(),
    confidence: row.confidence as number,
    access_count: row.access_count as number,
    event_time: row.event_time as string | null,
    content_hash: row.content_hash as string | null,
    task_id: row.task_id as string | null,
    issue_id: row.issue_id as string | null,
    artifact_id: row.artifact_id as string | null,
    provenance_refs: (() => { try { return JSON.parse(row.provenance_refs as string) as string[] } catch { return [] } })(),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    last_accessed_at: row.last_accessed_at as string,
  }
}

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
      content, tags, entities, confidence,
      file_path, symbol_path, event_time, content_hash,
      task_id, issue_id, artifact_id, provenance_refs,
      embedding, created_at, updated_at, last_accessed_at, access_count
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, 0
    )
  `).run(
    memory_id, input.workspace_id, input.project_id ?? null,
    input.scope, input.kind, input.title, input.summary, input.content,
    input.content, JSON.stringify(input.tags ?? []), JSON.stringify(input.entities ?? []), input.confidence ?? 1.0,
    input.file_path ?? null, input.symbol_path ?? null, input.event_time ?? null, hash,
    input.task_id ?? null, input.issue_id ?? null, input.artifact_id ?? null, JSON.stringify(input.provenance_refs ?? []),
    embeddingBuffer, now, now, now
  )

  const row = db.prepare('SELECT * FROM memories WHERE memory_id = ?').get(memory_id) as Record<string, unknown> | undefined
  if (!row) throw new FulcrumError(`Memory ${memory_id} not found after insert`, 'not_found')
  return rowToFullMemory(row)
}
