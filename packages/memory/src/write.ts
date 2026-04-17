// packages/memory/src/write.ts
import { createHash } from 'crypto'
import { getDb, FulcrumError, newId, Db, getTextEmbedder } from '@moabualruz/fulcrum-core'
import { contentHash, isDuplicate } from './dedup.js'
import { rowToFullMemory } from './mappers.js'
import { getVaultPath, vaultExists, writeMemoryFile } from './vault/client.js'
import { upsertStateEntry } from './vault/state.js'
import { appendToLog } from './vault/index-builder.js'
import type { WriteMemoryInput, FullMemory } from './types.js'
import { runExtractionPipeline } from './extractors/pipeline.js'
import { computeSparseVector } from './sparse.js'
import { validateKind, applyKindCap } from './validate-kind.js'
import { sanitizeOnWrite } from './sanitize/index.js'
import { appendWal, brandSanitized } from './wal/writer.js'

/**
 * Generate an embedding for `text` and store it in:
 *   - vec_memories (rowid + float vector) for ANN search
 *   - memories.embedding (blob) for inspection / rebuild
 * Fire-and-forget: call inside setImmediate or as a detached async task.
 * Non-fatal — if the embedder is unavailable the function returns silently.
 * Exported so the rebuild path and CLI backfill can call it explicitly.
 */
export async function storeEmbeddingInVec(db: Db, memory_id: string, text: string): Promise<void> {
  const embedder = getTextEmbedder()
  if (!embedder) return
  try {
    const exists = db.prepare('SELECT 1 FROM memories WHERE memory_id = ?').get(memory_id)
    if (!exists) return
    const embedFn = (embedder.embedDocument ?? embedder.embed).bind(embedder)
    const vec = await embedFn(text)
    const buf = Buffer.from(vec.buffer)
    db.prepare('INSERT OR REPLACE INTO vec_memories(memory_id, embedding) VALUES (?, ?)').run(memory_id, buf)
    db.prepare('UPDATE memories SET embedding = ? WHERE memory_id = ?').run(buf, memory_id)
  } catch { /* non-fatal: vec_memories is optional */ }
}

function bodyHash(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

// GAP-RAG-3: Normalize code identifiers for FTS5 recall.
//
// FTS5's default tokenizer (unicode61) splits on whitespace and punctuation
// but does NOT split camelCase or snake_case identifiers. A query for "user"
// will not match "getUserById" or "user_profile_service".
//
// This function expands identifiers into separate tokens so FTS5 can match
// any word within a compound identifier:
//   getUserById         → "get User By Id"
//   UserProfileService  → "User Profile Service"
//   user_profile_svc    → "user profile svc"
//   SCREAMING_SNAKE     → "SCREAMING SNAKE"
//
// Only applied to code-type memories (symbol, code, doc, diff) — prose
// memories like 'fact' and 'decision' should be indexed as written.
const CODE_KINDS = new Set<string>(['symbol', 'code', 'doc', 'diff'])

export function normalizeCodeText(text: string): string {
  return text
    // Insert space before an uppercase letter that follows a lowercase letter (camelCase)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Insert space before an uppercase letter that starts a word in a sequence of caps followed by lower
    // (e.g. "XMLParser" → "XML Parser", not "X M L Parser")
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // Replace underscores with spaces (snake_case, SCREAMING_SNAKE_CASE)
    .replace(/_+/g, ' ')
    // Collapse multiple spaces
    .replace(/  +/g, ' ')
    .trim()
}

export async function writeMemory(input: WriteMemoryInput, db: Db = getDb()): Promise<FullMemory> {
  if (!input.title.trim()) throw new FulcrumError('title must not be empty', 'invalid_input')
  if (!input.content.trim()) throw new FulcrumError('content must not be empty', 'invalid_input')
  if (input.confidence !== undefined && (input.confidence < 0 || input.confidence > 1)) {
    throw new FulcrumError('confidence must be between 0 and 1', 'invalid_input')
  }
  if (input.importance !== undefined && (input.importance < 0 || input.importance > 1)) {
    throw new FulcrumError('importance must be between 0 and 1', 'invalid_input')
  }
  if (input.scope === 'task' && !input.task_id) {
    throw new FulcrumError('scope=task requires task_id', 'invalid_input')
  }

  // v2a PR 6 Task 34 — non-primary write drop (defense-in-depth).
  // Writes from runs with context_type ≠ 'primary' are silently dropped
  // unless kind='delegation_summary'. Guard runs even when FULCRUM_MEMORY_V2
  // is off. Telemetry goes to hook_events for auditability.
  const ctxType = input.provenance?.context_type
  if (ctxType && ctxType !== 'primary' && input.kind !== 'delegation_summary') {
    try {
      db.prepare(`INSERT INTO hook_events (workspace_id, event_type, payload, created_at)
                  VALUES (?, 'non_primary_write_dropped', ?, datetime('now'))`)
        .run(input.workspace_id, JSON.stringify({ kind: input.kind, context_type: ctxType, run_id: input.provenance?.run_id }))
    } catch { /* telemetry is best-effort */ }
    // Return a synthesized "skipped" memory — preserves caller expectations
    // (most callers don't check) and keeps the contract non-throwing.
    return {
      memory_id: 'skip_' + newId('mem').slice(4),
      workspace_id: input.workspace_id,
      project_id: input.project_id,
      scope: input.scope,
      kind: input.kind,
      title: input.title,
      summary: input.summary,
      content: '',
      canonical_text: '',
      tags: [],
      entities: [],
      confidence: 0,
      importance: 0,
      freshness: 0,
      file_path: null,
      symbol_path: null,
      event_time: null,
      content_hash: '',
      task_id: null,
      issue_id: null,
      artifact_id: null,
      provenance_refs: [],
      embedding: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_accessed_at: new Date().toISOString(),
      access_count: 0,
    } as FullMemory
  }

  // v2a Task 9: kind validation + per-kind char cap. The DB-level CHECK was
  // dropped in PR 1 Task 1; this is the single canonical policy point.
  validateKind(input.kind)
  const cappedContent = applyKindCap(input.kind, input.content)
  // v2a PR 5 Tasks 24-26: sanitize-before-anything (constraint #8). Strip
  // fence markers, redact prompt injection + credentials + invisible Unicode.
  // Errors are non-fatal — content passes through with sanitize_event=error.
  const sanitized = sanitizeOnWrite(cappedContent, {
    workspace_id: input.workspace_id,
    project_id: input.project_id,
  })
  input = { ...input, content: sanitized.content }

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

  const memory_id = newId('memory')

  // v2a PR 5 Task 26: WAL append BEFORE L0 / L1 / L2. content_sha256 only —
  // never the body. Sync errno (ENOSPC, EROFS, EIO) blocks the write via
  // WalDurabilityError; transient errors retry once then proceed-with-skip.
  // sanitize_events from the middleware are recorded in the audit row.
  appendWal({
    op: 'WRITE',
    memory_id,
    kind: input.kind,
    workspace_id: input.workspace_id,
    project_id: input.project_id ?? null,
    provenance: { hook_point: 'write_memory', errored: sanitized.errored },
    content: brandSanitized(input.content),
    sanitize_events: sanitized.events,
  })

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
    content: input.content,
    canonical_text: input.canonical_text ?? (
      CODE_KINDS.has(input.kind) ? normalizeCodeText(input.content) : input.content
    ),
    tags: input.tags ?? [],
    entities: input.entities ?? [],
    confidence: input.confidence ?? 1.0,
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
      const bodyContent = memoryForVault.canonical_text
      upsertStateEntry(vaultPath, {
        id: memory_id,
        path: relPath,
        mtime: Date.now(),
        sha256: bodyHash(bodyContent ?? ''),
      })
      appendToLog(vaultPath, {
        ts: now,
        op: 'WRITE',
        id: memory_id,
        meta: `kind=${input.kind} scope=${input.scope} by=agent`,
      })
    }
  }

  // ── Sparse vector (GAP-RAG-7) ─────────────────────────────────────────────
  // Compute a BM25-style sparse vector from canonical_text for the 3rd RRF
  // signal in recall. Stored as JSON; top-128 terms, L2-normalised.
  const sparseVec = computeSparseVector(memoryForVault.canonical_text ?? input.content)
  const sparseVectorJson = Object.keys(sparseVec).length > 0 ? JSON.stringify(sparseVec) : null

  // ── L1 SQLite insert (synchronous) ────────────────────────────────────────
  // freshness is NOT written here — it is computed at query time from updated_at
  db.prepare(`
    INSERT INTO memories (
      memory_id, workspace_id, project_id,
      scope, kind, title, summary, canonical_text,
      content, tags, entities, confidence, importance,
      file_path, symbol_path, event_time, content_hash,
      task_id, issue_id, artifact_id, provenance_refs,
      embedding, sparse_vector, created_at, updated_at, last_accessed_at, access_count
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, 0
    )
  `).run(
    memory_id, input.workspace_id, input.project_id ?? null,
    input.scope, input.kind, input.title, input.summary, memoryForVault.canonical_text,
    input.content, JSON.stringify(input.tags ?? []), JSON.stringify(input.entities ?? []), input.confidence ?? 1.0, input.importance ?? 0.5,
    input.file_path ?? null, input.symbol_path ?? null, input.event_time ?? null, hash,
    input.task_id ?? null, input.issue_id ?? null, input.artifact_id ?? null, JSON.stringify(input.provenance_refs ?? []),
    embeddingBuffer, sparseVectorJson, now, now, now
  )

  const row = db.prepare('SELECT * FROM memories WHERE memory_id = ?').get(memory_id) as Record<string, unknown> | undefined
  if (!row) throw new FulcrumError(`Memory ${memory_id} not found after insert`, 'not_found')

  // ── Vec embedding (fire-and-forget) ──────────────────────────────────────
  // Populate vec_memories for ANN recall. Runs async so it never blocks the
  // write response. Silently skips if no embedder is initialized.
  setImmediate(() => {
    storeEmbeddingInVec(db, memory_id, memoryForVault.canonical_text ?? input.content).catch(() => {})
  })

  // ── L2 async enqueue (fire-and-forget when KuzuClient is active) ──────────
  const vaultRoot = getVaultPath()
  if (!input.skipVaultWrite) {
    setImmediate(() => {
      runExtractionPipeline(vaultRoot, rowToFullMemory(row!)).catch(() => {})
    })
  }

  // ── v2a PR 7 Task 38 — Memory↔code edge reducer (fire-and-forget) ─────────
  // Runs async after L1 insert per L0→L1→L2 ordering invariant. No blocking
  // on Kuzu availability — the reducer itself is a no-op when KuzuClient is
  // not wired.
  setImmediate(() => {
    void import('./kuzu/reducers/memory.js').then(({ reduceMemoryWrite }) =>
      reduceMemoryWrite(db, {
        memoryId: memory_id,
        workspaceId: input.workspace_id,
        projectId: input.project_id ?? null,
        kind: input.kind,
        content: input.content,
        filePaths: input.file_path ? [input.file_path] : undefined,
      }).catch(() => { /* logged in reducer */ })
    ).catch(() => { /* module import failure; best-effort */ })
  })

  return rowToFullMemory(row)
}

/**
 * Insert a memory directly from a FullMemory object, preserving the original memory_id.
 * Used by the rebuild path to rehydrate L0→L1 without generating new ULIDs.
 * Bypasses: dedup, ULID generation, L0 write, L2 enqueue.
 * Uses INSERT OR REPLACE so it's idempotent.
 */
export function insertMemoryDirect(memory: FullMemory, db: Db = getDb()): void {
  const embeddingBuffer = null  // embeddings are re-generated by L2 rebuild separately

  // MEM-008: compute sparse vector so L1 recall has the BM25 rescue signal
  const sparseVec = computeSparseVector(memory.canonical_text ?? '')
  const sparseVectorJson = Object.keys(sparseVec).length > 0 ? JSON.stringify(sparseVec) : null

  db.prepare(`
    INSERT OR REPLACE INTO memories (
      memory_id, workspace_id, project_id,
      scope, kind, title, summary, canonical_text,
      content, tags, entities, confidence, freshness, importance,
      file_path, symbol_path, event_time, content_hash,
      task_id, issue_id, artifact_id, provenance_refs,
      embedding, sparse_vector, created_at, updated_at, last_accessed_at, access_count
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `).run(
    memory.memory_id, memory.workspace_id, memory.project_id ?? null,
    memory.scope, memory.kind, memory.title, memory.summary, memory.canonical_text ?? '',
    memory.canonical_text ?? '', JSON.stringify(memory.tags), JSON.stringify(memory.entities),
    memory.confidence, memory.freshness, memory.importance,
    memory.file_path ?? null, memory.symbol_path ?? null, memory.event_time ?? null, memory.content_hash ?? null,
    memory.task_id ?? null, memory.issue_id ?? null, memory.artifact_id ?? null, JSON.stringify(memory.provenance_refs),
    embeddingBuffer, sparseVectorJson, memory.created_at, memory.updated_at, memory.last_accessed_at, memory.access_count
  )

  // Populate vec_memories for ANN recall (fire-and-forget)
  setImmediate(() => {
    storeEmbeddingInVec(db, memory.memory_id, memory.canonical_text ?? '').catch(() => {})
  })
}
