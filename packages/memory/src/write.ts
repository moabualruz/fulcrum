// packages/memory/src/write.ts
import { ulid } from 'ulid'
import { createHash } from 'crypto'
import { getDb, FulcrumError } from '@fulcrum/core'
import { contentHash, isDuplicate } from './dedup.js'
import { rowToFullMemory } from './mappers.js'
import { getVaultPath, vaultExists, writeMemoryFile } from './vault/client.js'
import { upsertStateEntry } from './vault/state.js'
import { appendToLog } from './vault/index-builder.js'
import type { WriteMemoryInput, FullMemory } from './types.js'
import { runExtractionPipeline } from './extractors/pipeline.js'

function bodyHash(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export async function writeMemory(input: WriteMemoryInput): Promise<FullMemory> {
  if (!input.title.trim()) throw new FulcrumError('title must not be empty', 'invalid_input')
  if (!input.content.trim()) throw new FulcrumError('content must not be empty', 'invalid_input')
  if (input.confidence !== undefined && (input.confidence < 0 || input.confidence > 1)) {
    throw new FulcrumError('confidence must be between 0 and 1', 'invalid_input')
  }
  if (input.freshness !== undefined && (input.freshness < 0 || input.freshness > 1)) {
    throw new FulcrumError('freshness must be between 0 and 1', 'invalid_input')
  }
  if (input.importance !== undefined && (input.importance < 0 || input.importance > 1)) {
    throw new FulcrumError('importance must be between 0 and 1', 'invalid_input')
  }
  if (input.scope === 'task' && !input.task_id) {
    throw new FulcrumError('scope=task requires task_id', 'invalid_input')
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

  // Build the FullMemory object we'll need for L0 write
  const memoryForVault: FullMemory = {
    memory_id,
    scope: input.scope,
    kind: input.kind,
    workspace_id: input.workspace_id,
    project_id: input.project_id ?? null,
    file_path: input.file_path ?? null,
    symbol_path: input.symbol_path ?? null,
    title: input.title,
    summary: input.summary,
    canonical_text: input.canonical_text ?? input.content,
    tags: input.tags ?? [],
    entities: input.entities ?? [],
    confidence: input.confidence ?? 1.0,
    freshness: input.freshness ?? 1.0,
    importance: input.importance ?? 0.5,
    access_count: 0,
    event_time: input.event_time ?? null,
    content_hash: hash,
    task_id: input.task_id ?? null,
    issue_id: input.issue_id ?? null,
    artifact_id: input.artifact_id ?? null,
    provenance_refs: input.provenance_refs ?? [],
    created_at: now,
    updated_at: now,
    last_accessed_at: now,
  }

  // ── L0 write — canonical commit point; must succeed before L1 ────────────
  if (!input.skipVaultWrite) {
    const vaultPath = getVaultPath()
    if (vaultExists(vaultPath)) {
      const filePath = await writeMemoryFile(vaultPath, memoryForVault)
      const relPath = filePath.replace(vaultPath + '/', '')
      const bodyContent = input.canonical_text ?? input.content
      upsertStateEntry(vaultPath, {
        id: memory_id,
        path: relPath,
        mtime: Date.now(),
        sha256: bodyHash(bodyContent),
      })
      appendToLog(vaultPath, {
        ts: now,
        op: 'WRITE',
        id: memory_id,
        meta: `kind=${input.kind} scope=${input.scope} by=agent`,
      })
    }
  }

  // ── L1 SQLite insert (synchronous) ────────────────────────────────────────
  db.prepare(`
    INSERT INTO memories (
      memory_id, workspace_id, project_id,
      scope, kind, title, summary, canonical_text,
      content, tags, entities, confidence, freshness, importance,
      file_path, symbol_path, event_time, content_hash,
      task_id, issue_id, artifact_id, provenance_refs,
      embedding, created_at, updated_at, last_accessed_at, access_count
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, 0
    )
  `).run(
    memory_id, input.workspace_id, input.project_id ?? null,
    input.scope, input.kind, input.title, input.summary, input.canonical_text ?? input.content,
    input.content, JSON.stringify(input.tags ?? []), JSON.stringify(input.entities ?? []), input.confidence ?? 1.0, input.freshness ?? 1.0, input.importance ?? 0.5,
    input.file_path ?? null, input.symbol_path ?? null, input.event_time ?? null, hash,
    input.task_id ?? null, input.issue_id ?? null, input.artifact_id ?? null, JSON.stringify(input.provenance_refs ?? []),
    embeddingBuffer, now, now, now
  )

  const row = db.prepare('SELECT * FROM memories WHERE memory_id = ?').get(memory_id) as Record<string, unknown> | undefined
  if (!row) throw new FulcrumError(`Memory ${memory_id} not found after insert`, 'not_found')

  // ── L2 async enqueue (fire-and-forget when KuzuClient is active) ──────────
  const vaultRoot = getVaultPath()
  if (!input.skipVaultWrite) {
    setImmediate(() => {
      runExtractionPipeline(vaultRoot, rowToFullMemory(row!)).catch(() => {})
    })
  }

  return rowToFullMemory(row)
}

/**
 * Insert a memory directly from a FullMemory object, preserving the original memory_id.
 * Used by the rebuild path to rehydrate L0→L1 without generating new ULIDs.
 * Bypasses: dedup, ULID generation, L0 write, L2 enqueue.
 * Uses INSERT OR REPLACE so it's idempotent.
 */
export function insertMemoryDirect(memory: FullMemory): void {
  const db = getDb()
  const embeddingBuffer = null  // embeddings are re-generated by L2 rebuild separately

  db.prepare(`
    INSERT OR REPLACE INTO memories (
      memory_id, workspace_id, project_id,
      scope, kind, title, summary, canonical_text,
      content, tags, entities, confidence, freshness, importance,
      file_path, symbol_path, event_time, content_hash,
      task_id, issue_id, artifact_id, provenance_refs,
      embedding, created_at, updated_at, last_accessed_at, access_count
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `).run(
    memory.memory_id, memory.workspace_id, memory.project_id ?? null,
    memory.scope, memory.kind, memory.title, memory.summary, memory.canonical_text ?? '',
    memory.canonical_text ?? '', JSON.stringify(memory.tags), JSON.stringify(memory.entities),
    memory.confidence, memory.freshness, memory.importance,
    memory.file_path ?? null, memory.symbol_path ?? null, memory.event_time ?? null, memory.content_hash ?? null,
    memory.task_id ?? null, memory.issue_id ?? null, memory.artifact_id ?? null, JSON.stringify(memory.provenance_refs),
    embeddingBuffer, memory.created_at, memory.updated_at, memory.last_accessed_at, memory.access_count
  )
}
