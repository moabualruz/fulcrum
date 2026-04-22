import { getCodeEmbedder, getDb, getTextEmbedder, newId } from 'fulcrum-agent-core'
import type { Db, EmbeddingJobItemStatus, EmbeddingJobSourceDomain, EmbeddingJobStatus } from 'fulcrum-agent-core'
import { contentHash } from '../dedup.js'
import { redactRagDetails, redactRagText } from '../setup/rag-redaction.js'
import { resolveEmbeddingRuntimeDevice } from './embed.js'
import { classifyVectorMetadata, writeVectorMetadata } from './vector-metadata.js'

export interface EmbeddingJobCounts {
  scanned: number
  current: number
  stale: number
  pending: number
  failed: number
  skipped: number
}

export interface EmbeddingJobScope {
  allow_empty?: boolean
  ids?: string[]
}

export interface EmbeddingJobRow {
  job_id: string
  workspace_id: string
  project_id: string
  source_domain: EmbeddingJobSourceDomain
  status: EmbeddingJobStatus
  requested_provider: string | null
  requested_model: string | null
  requested_device: string | null
  dimensions: number | null
  scope: EmbeddingJobScope
  preflight_counts: EmbeddingJobCounts
  summary: Record<string, unknown>
  started_at: string | null
  finished_at: string | null
  cancel_requested_at: string | null
}

export interface EmbeddingJobItemRow {
  job_item_id: string
  job_id: string
  workspace_id: string
  source_domain: EmbeddingJobSourceDomain
  source_id: string
  source_content_hash: string
  chunk_key: string
  requested_provider: string | null
  requested_model: string | null
  requested_device: string | null
  actual_provider: string | null
  actual_model: string | null
  actual_device: string | null
  dimensions: number | null
  status: EmbeddingJobItemStatus
  attempts: number
  error_type: string | null
  error_message: string | null
  started_at: string | null
  finished_at: string | null
}

export interface RagJobEventRow {
  event_id: string
  job_id: string
  workspace_id: string
  event_type: string
  source_id: string | null
  message: string
  details: Record<string, unknown>
  created_at: string
}

export interface EmbeddingJobStartInput {
  workspace_id: string
  project_id: string
  source_domain: EmbeddingJobSourceDomain
  provider?: string
  model?: string
  requested_device?: string
  dimensions?: number
  scope?: EmbeddingJobScope
}

export interface EmbeddingJobRunInput {
  job_id: string
  workspace_id: string
  batch_size?: number
  max_items?: number
  retry_failed?: boolean
  embedder?: EmbeddingProviderLike
}

export interface EmbeddingJobStatusView {
  job_id: string
  status: EmbeddingJobStatus
  source_domain: EmbeddingJobSourceDomain
  progress: {
    total: number
    embedded: number
    failed: number
    skipped: number
    stale: number
    pending: number
    running: number
  }
  events: RagJobEventRow[]
}

export interface EmbeddingProviderLike {
  dimensions: number
  embed(text: string): Promise<Float32Array>
  embedBatch?(texts: string[]): Promise<Float32Array[]>
  embedDocument?(text: string): Promise<Float32Array>
  actualDevice?: string
  actual_device?: string
}

interface EmbeddingSource {
  source_id: string
  content: string
  content_hash: string
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function rowToJob(row: Record<string, unknown>): EmbeddingJobRow {
  return {
    job_id: String(row['job_id']),
    workspace_id: String(row['workspace_id']),
    project_id: String(row['project_id']),
    source_domain: row['source_domain'] as EmbeddingJobSourceDomain,
    status: row['status'] as EmbeddingJobStatus,
    requested_provider: row['requested_provider'] === null ? null : String(row['requested_provider']),
    requested_model: row['requested_model'] === null ? null : String(row['requested_model']),
    requested_device: row['requested_device'] === null ? null : String(row['requested_device']),
    dimensions: row['dimensions'] === null ? null : Number(row['dimensions']),
    scope: parseJson(String(row['scope'] ?? '{}'), {}),
    preflight_counts: parseJson(String(row['preflight_counts'] ?? '{}'), emptyCounts()),
    summary: parseJson(String(row['summary'] ?? '{}'), {}),
    started_at: row['started_at'] === null ? null : String(row['started_at']),
    finished_at: row['finished_at'] === null ? null : String(row['finished_at']),
    cancel_requested_at: row['cancel_requested_at'] === null ? null : String(row['cancel_requested_at']),
  }
}

function rowToItem(row: Record<string, unknown>): EmbeddingJobItemRow {
  return {
    job_item_id: String(row['job_item_id']),
    job_id: String(row['job_id']),
    workspace_id: String(row['workspace_id']),
    source_domain: row['source_domain'] as EmbeddingJobSourceDomain,
    source_id: String(row['source_id']),
    source_content_hash: String(row['source_content_hash'] ?? ''),
    chunk_key: String(row['chunk_key'] ?? ''),
    requested_provider: row['requested_provider'] === null ? null : String(row['requested_provider']),
    requested_model: row['requested_model'] === null ? null : String(row['requested_model']),
    requested_device: row['requested_device'] === null ? null : String(row['requested_device']),
    actual_provider: row['actual_provider'] === null ? null : String(row['actual_provider']),
    actual_model: row['actual_model'] === null ? null : String(row['actual_model']),
    actual_device: row['actual_device'] === null ? null : String(row['actual_device']),
    dimensions: row['dimensions'] === null ? null : Number(row['dimensions']),
    status: row['status'] as EmbeddingJobItemStatus,
    attempts: Number(row['attempts']),
    error_type: row['error_type'] === null ? null : String(row['error_type']),
    error_message: row['error_message'] === null ? null : String(row['error_message']),
    started_at: row['started_at'] === null ? null : String(row['started_at']),
    finished_at: row['finished_at'] === null ? null : String(row['finished_at']),
  }
}

function rowToEvent(row: Record<string, unknown>): RagJobEventRow {
  return {
    event_id: String(row['event_id']),
    job_id: String(row['job_id']),
    workspace_id: String(row['workspace_id']),
    event_type: String(row['event_type']),
    source_id: row['source_id'] === null ? null : String(row['source_id']),
    message: String(row['message'] ?? ''),
    details: parseJson(String(row['details'] ?? '{}'), {}),
    created_at: String(row['created_at']),
  }
}

function emptyCounts(): EmbeddingJobCounts {
  return { scanned: 0, current: 0, stale: 0, pending: 0, failed: 0, skipped: 0 }
}

function sourceDomainToVectorDomain(source_domain: EmbeddingJobSourceDomain): 'memory' | 'code_chunk' {
  return source_domain === 'code_chunks' ? 'code_chunk' : 'memory'
}

function sourceDomainToVectorTable(source_domain: EmbeddingJobSourceDomain): 'vec_memories' | 'vec_chunks' {
  return source_domain === 'code_chunks' ? 'vec_chunks' : 'vec_memories'
}

function providerForDomain(source_domain: EmbeddingJobSourceDomain): EmbeddingProviderLike | null {
  return source_domain === 'code_chunks' ? getCodeEmbedder() : getTextEmbedder()
}

function rowsForSources(input: EmbeddingJobStartInput, db: Db): EmbeddingSource[] {
  const scopeIds = input.scope?.ids
  const params: unknown[] = [input.workspace_id, input.project_id]
  let idFilter = ''
  if (scopeIds && scopeIds.length > 0) {
    idFilter = ` AND source_id IN (${scopeIds.map(() => '?').join(',')})`
    params.push(...scopeIds)
  }

  let sql: string
  if (input.source_domain === 'code_chunks') {
    sql = `
      SELECT chunk_id AS source_id, content, COALESCE(content_hash, '') AS stored_hash
        FROM code_chunks
       WHERE workspace_id = ? AND project_id = ?${idFilter}
       ORDER BY chunk_id
    `
  } else if (input.source_domain === 'l1_pages') {
    sql = `
      SELECT page_id AS source_id, body AS content, COALESCE(body_hash, '') AS stored_hash
        FROM l1_pages
       WHERE workspace_id = ? AND project_id = ?${idFilter}
       ORDER BY page_id
    `
  } else {
    sql = `
      SELECT memory_id AS source_id, content, COALESCE(content_hash, '') AS stored_hash
        FROM memories
       WHERE workspace_id = ? AND project_id = ?${idFilter}
       ORDER BY memory_id
    `
  }

  const rows = db.prepare(sql).all(...params) as Array<{ source_id: string; content: string; stored_hash: string | null }>
  return rows.map(row => ({
    source_id: row.source_id,
    content: row.content,
    content_hash: row.stored_hash || contentHash(row.content),
  }))
}

function computePreflightCounts(input: EmbeddingJobStartInput, sources: EmbeddingSource[], db: Db): EmbeddingJobCounts {
  const counts = emptyCounts()
  counts.scanned = sources.length
  const provider = input.provider ?? 'local'
  const model = input.model ?? 'unknown'
  const dimensions = input.dimensions ?? 1024
  const source_domain = sourceDomainToVectorDomain(input.source_domain)
  for (const source of sources) {
    const status = classifyVectorMetadata({
      workspace_id: input.workspace_id,
      source_domain,
      source_id: source.source_id,
      content_hash: source.content_hash,
      provider,
      model,
      requested_device: input.requested_device,
      dimensions,
    }, db)
    if (status === 'current') counts.current += 1
    else if (status === 'failed') counts.failed += 1
    else if (status === 'skipped') counts.skipped += 1
    else if (status === 'stale') counts.stale += 1
    else counts.pending += 1
  }
  return counts
}

export function getEmbeddingJob(input: { job_id: string; workspace_id: string }, db: Db = getDb()): EmbeddingJobRow {
  const row = db.prepare('SELECT * FROM embedding_jobs WHERE job_id = ? AND workspace_id = ?').get(input.job_id, input.workspace_id) as Record<string, unknown> | undefined
  if (!row) throw new Error(`embedding job not found: ${input.job_id}`)
  return rowToJob(row)
}

export function listEmbeddingJobItems(input: { job_id: string; workspace_id: string; statuses?: EmbeddingJobItemStatus[] }, db: Db = getDb()): EmbeddingJobItemRow[] {
  const params: unknown[] = [input.job_id, input.workspace_id]
  let statusFilter = ''
  if (input.statuses && input.statuses.length > 0) {
    statusFilter = ` AND status IN (${input.statuses.map(() => '?').join(',')})`
    params.push(...input.statuses)
  }
  return (db.prepare(`
    SELECT * FROM embedding_job_items
     WHERE job_id = ? AND workspace_id = ?${statusFilter}
     ORDER BY rowid
  `).all(...params) as Record<string, unknown>[]).map(rowToItem)
}

export function listRagJobEvents(input: { job_id: string; workspace_id: string; limit?: number }, db: Db = getDb()): RagJobEventRow[] {
  return (db.prepare(`
    SELECT * FROM rag_job_events
     WHERE job_id = ? AND workspace_id = ?
     ORDER BY created_at ASC, rowid ASC
     LIMIT ?
  `).all(input.job_id, input.workspace_id, input.limit ?? 200) as Record<string, unknown>[]).map(rowToEvent)
}

export function appendRagJobEvent(
  input: { job_id: string; workspace_id: string; event_type: RagJobEventRow['event_type']; source_id?: string | null; message?: string; details?: Record<string, unknown> },
  db: Db = getDb(),
): RagJobEventRow {
  const event_id = newId('rag_job_event')
  db.prepare(`
    INSERT INTO rag_job_events (event_id, job_id, workspace_id, event_type, source_id, message, details)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    event_id,
    input.job_id,
    input.workspace_id,
    input.event_type,
    input.source_id ?? null,
    input.message ?? '',
    JSON.stringify(redactRagDetails(input.details ?? {})),
  )
  return rowToEvent(db.prepare('SELECT * FROM rag_job_events WHERE event_id = ?').get(event_id) as Record<string, unknown>)
}

export function createEmbeddingJob(input: EmbeddingJobStartInput, db: Db = getDb()): EmbeddingJobRow {
  const provider = input.provider ?? 'local'
  const model = input.model ?? 'unknown'
  const requested_device = input.requested_device ?? 'auto'
  const dimensions = input.dimensions ?? 1024
  const scope = redactRagDetails(input.scope ?? {})
  const sources = rowsForSources(input, db)
  const preflight_counts = computePreflightCounts({ ...input, provider, model, requested_device, dimensions }, sources, db)
  const job_id = newId('embedding_job')
  const failedEmpty = sources.length === 0 && input.scope?.allow_empty !== true

  db.prepare(`
    INSERT INTO embedding_jobs (
      job_id, workspace_id, project_id, source_domain, status, requested_provider,
      requested_model, requested_device, dimensions, scope, preflight_counts, summary, finished_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    job_id,
    input.workspace_id,
    input.project_id,
    input.source_domain,
    failedEmpty ? 'failed' : 'pending',
    provider,
    model,
    requested_device,
    dimensions,
    JSON.stringify(scope),
    JSON.stringify(preflight_counts),
    JSON.stringify(failedEmpty ? { error: 'empty_scope' } : {}),
    failedEmpty ? new Date().toISOString() : null,
  )

  const insertItem = db.prepare(`
    INSERT OR IGNORE INTO embedding_job_items (
      job_item_id, job_id, workspace_id, source_domain, source_id, source_content_hash,
      chunk_key, requested_provider, requested_model, requested_device, dimensions, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const vectorDomain = sourceDomainToVectorDomain(input.source_domain)
  for (const source of sources) {
    const freshness = classifyVectorMetadata({
      workspace_id: input.workspace_id,
      source_domain: vectorDomain,
      source_id: source.source_id,
      content_hash: source.content_hash,
      provider,
      model,
      requested_device,
      dimensions,
    }, db)
    insertItem.run(
      newId('embedding_job_item'),
      job_id,
      input.workspace_id,
      input.source_domain,
      source.source_id,
      source.content_hash,
      '',
      provider,
      model,
      requested_device,
      dimensions,
      freshness === 'current' ? 'skipped' : freshness === 'stale' ? 'stale' : freshness === 'skipped' ? 'skipped' : 'pending',
    )
  }

  if (failedEmpty) {
    appendRagJobEvent({
      job_id,
      workspace_id: input.workspace_id,
      event_type: 'failed',
      message: 'embedding scope matched zero sources',
      details: { code: 'empty_scope' },
    }, db)
  }

  return getEmbeddingJob({ job_id, workspace_id: input.workspace_id }, db)
}

export function createEmbeddingJobPlaceholder(
  input: { workspace_id: string; project_id: string; source_domain: EmbeddingJobSourceDomain; scope?: Record<string, unknown> },
  db: Db = getDb(),
): EmbeddingJobRow {
  return createEmbeddingJob({
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    source_domain: input.source_domain,
    scope: input.scope,
  }, db)
}

function itemText(item: EmbeddingJobItemRow, db: Db): string {
  if (item.source_domain === 'code_chunks') {
    const row = db.prepare('SELECT content FROM code_chunks WHERE chunk_id = ? AND workspace_id = ?').get(item.source_id, item.workspace_id) as { content: string } | undefined
    return row?.content ?? ''
  }
  const row = db.prepare('SELECT content FROM memories WHERE memory_id = ? AND workspace_id = ?').get(item.source_id, item.workspace_id) as { content: string } | undefined
  return row?.content ?? ''
}

function writeVector(
  item: EmbeddingJobItemRow,
  vector: Float32Array,
  runtime: { actual_device: string },
  db: Db,
): void {
  const buf = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength)
  if (item.source_domain === 'code_chunks') {
    db.prepare('DELETE FROM vec_chunks WHERE chunk_id = ?').run(item.source_id)
    db.prepare('INSERT INTO vec_chunks(chunk_id, embedding) VALUES (?, ?)').run(item.source_id, buf)
    db.prepare('UPDATE code_chunks SET embedding = ? WHERE chunk_id = ? AND workspace_id = ?').run(buf, item.source_id, item.workspace_id)
  } else {
    db.prepare('DELETE FROM vec_memories WHERE memory_id = ?').run(item.source_id)
    db.prepare('INSERT INTO vec_memories(memory_id, embedding) VALUES (?, ?)').run(item.source_id, buf)
    db.prepare('UPDATE memories SET embedding = ?, embedded = 1 WHERE memory_id = ? AND workspace_id = ?').run(buf, item.source_id, item.workspace_id)
  }

  writeVectorMetadata({
    workspace_id: item.workspace_id,
    source_domain: sourceDomainToVectorDomain(item.source_domain),
    source_id: item.source_id,
    content_hash: item.source_content_hash,
    provider: item.requested_provider,
    model: item.requested_model,
    requested_device: item.requested_device,
    actual_device: runtime.actual_device,
    dimensions: item.dimensions,
    vector_table: sourceDomainToVectorTable(item.source_domain),
    status: 'current',
  }, db)
}

function markItemRunning(item: EmbeddingJobItemRow, db: Db): void {
  db.prepare(`
    UPDATE embedding_job_items
       SET status = 'running', attempts = attempts + 1, started_at = datetime('now'), error_type = NULL, error_message = NULL
     WHERE job_item_id = ? AND workspace_id = ?
  `).run(item.job_item_id, item.workspace_id)
}

function markItemEmbedded(item: EmbeddingJobItemRow, runtime: { actual_device: string }, db: Db): void {
  db.prepare(`
    UPDATE embedding_job_items
       SET status = 'embedded', actual_provider = requested_provider, actual_model = requested_model,
           actual_device = ?, finished_at = datetime('now'), error_type = NULL, error_message = NULL
     WHERE job_item_id = ? AND workspace_id = ?
  `).run(runtime.actual_device, item.job_item_id, item.workspace_id)
}

function markItemFailed(item: EmbeddingJobItemRow, err: unknown, db: Db): void {
  const message = redactRagText(err instanceof Error ? err.message : String(err))
  db.prepare(`
    UPDATE embedding_job_items
       SET status = 'failed', finished_at = datetime('now'), error_type = ?, error_message = ?
     WHERE job_item_id = ? AND workspace_id = ?
  `).run(err instanceof Error ? err.name : 'Error', message, item.job_item_id, item.workspace_id)
  writeVectorMetadata({
    workspace_id: item.workspace_id,
    source_domain: sourceDomainToVectorDomain(item.source_domain),
    source_id: item.source_id,
    content_hash: item.source_content_hash,
    provider: item.requested_provider,
    model: item.requested_model,
    requested_device: item.requested_device,
    dimensions: item.dimensions,
    vector_table: sourceDomainToVectorTable(item.source_domain),
    status: 'failed',
    error_type: err instanceof Error ? err.name : 'Error',
    error_message: message,
  }, db)
}

async function embedBatch(embedder: EmbeddingProviderLike, texts: string[]): Promise<Float32Array[]> {
  if (embedder.embedBatch) return embedder.embedBatch(texts)
  const embedFn = (embedder.embedDocument ?? embedder.embed).bind(embedder)
  return Promise.all(texts.map(text => embedFn(text)))
}

async function processBatch(items: EmbeddingJobItemRow[], embedder: EmbeddingProviderLike, db: Db): Promise<void> {
  if (items.length === 0) return
  for (const item of items) markItemRunning(item, db)

  try {
    const runtime = resolveEmbeddingRuntimeDevice(embedder, items[0]?.requested_device ?? 'auto')
    if (runtime.fallback_reason) {
      appendRagJobEvent({
        job_id: items[0]!.job_id,
        workspace_id: items[0]!.workspace_id,
        event_type: 'fallback',
        source_id: items[0]!.source_id,
        message: runtime.fallback_reason,
        details: { requested_device: runtime.requested_device, actual_device: runtime.actual_device },
      }, db)
    }
    const vectors = await embedBatch(embedder, items.map(item => itemText(item, db)))
    if (vectors.length !== items.length) throw new Error(`embedder returned ${vectors.length} vectors for ${items.length} rows`)
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!
      const vector = vectors[i]!
      writeVector(item, vector, runtime, db)
      markItemEmbedded(item, runtime, db)
    }
  } catch (err) {
    if (items.length > 1) {
      const mid = Math.ceil(items.length / 2)
      appendRagJobEvent({
        job_id: items[0]!.job_id,
        workspace_id: items[0]!.workspace_id,
        event_type: 'split',
        message: 'embedding batch failed; reducing batch size',
        details: { from: items.length, to: [mid, items.length - mid], error: err instanceof Error ? err.message : String(err) },
      }, db)
      await processBatch(items.slice(0, mid), embedder, db)
      await processBatch(items.slice(mid), embedder, db)
      return
    }
    markItemFailed(items[0]!, err, db)
    appendRagJobEvent({
      job_id: items[0]!.job_id,
      workspace_id: items[0]!.workspace_id,
      event_type: 'failed',
      source_id: items[0]!.source_id,
      message: 'embedding item failed',
      details: { error: err instanceof Error ? err.message : String(err) },
    }, db)
  }
}

function summarizeItems(job_id: string, workspace_id: string, db: Db): EmbeddingJobStatusView['progress'] {
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS n
      FROM embedding_job_items
     WHERE job_id = ? AND workspace_id = ?
     GROUP BY status
  `).all(job_id, workspace_id) as Array<{ status: EmbeddingJobItemStatus; n: number }>
  const byStatus = new Map(rows.map(row => [row.status, row.n]))
  return {
    total: rows.reduce((sum, row) => sum + row.n, 0),
    embedded: byStatus.get('embedded') ?? 0,
    failed: byStatus.get('failed') ?? 0,
    skipped: byStatus.get('skipped') ?? 0,
    stale: byStatus.get('stale') ?? 0,
    pending: byStatus.get('pending') ?? 0,
    running: byStatus.get('running') ?? 0,
  }
}

function finalizeJob(job_id: string, workspace_id: string, db: Db): EmbeddingJobStatus {
  const job = getEmbeddingJob({ job_id, workspace_id }, db)
  const progress = summarizeItems(job_id, workspace_id, db)
  const status: EmbeddingJobStatus =
    progress.total === 0 ? job.scope.allow_empty === true ? 'completed' : 'failed'
      : progress.failed > 0 ? 'degraded'
        : progress.pending > 0 || progress.stale > 0 || progress.running > 0 ? 'running'
          : 'completed'
  if (status !== 'running') {
    db.prepare(`
      UPDATE embedding_jobs
         SET status = ?, finished_at = datetime('now'), summary = ?
       WHERE job_id = ? AND workspace_id = ?
    `).run(status, JSON.stringify(progress), job_id, workspace_id)
    appendRagJobEvent({
      job_id,
      workspace_id,
      event_type: status === 'completed' ? 'completed' : 'failed',
      message: status === 'completed' ? 'embedding job completed' : 'embedding job completed with failed items',
      details: progress,
    }, db)
  } else {
    db.prepare('UPDATE embedding_jobs SET status = ?, summary = ? WHERE job_id = ? AND workspace_id = ?')
      .run(status, JSON.stringify(progress), job_id, workspace_id)
  }
  return status
}

export async function runEmbeddingJob(input: EmbeddingJobRunInput, db: Db = getDb()): Promise<EmbeddingJobStatusView> {
  const job = getEmbeddingJob({ job_id: input.job_id, workspace_id: input.workspace_id }, db)
  if (job.status === 'cancelled' && input.retry_failed !== true) {
    appendRagJobEvent({ job_id: job.job_id, workspace_id: job.workspace_id, event_type: 'resumed', message: 'embedding job resumed' }, db)
  }

  if (input.retry_failed) {
    db.prepare(`
      UPDATE embedding_job_items
         SET status = 'pending'
       WHERE job_id = ? AND workspace_id = ? AND status IN ('failed', 'stale')
    `).run(job.job_id, job.workspace_id)
    appendRagJobEvent({ job_id: job.job_id, workspace_id: job.workspace_id, event_type: 'retry', message: 'retrying failed or stale embedding items' }, db)
  }

  db.prepare(`
    UPDATE embedding_job_items
       SET status = 'pending'
     WHERE job_id = ? AND workspace_id = ? AND status = 'running'
  `).run(job.job_id, job.workspace_id)

  db.prepare(`
    UPDATE embedding_jobs
       SET status = 'running', started_at = COALESCE(started_at, datetime('now')), finished_at = NULL, cancel_requested_at = NULL
     WHERE job_id = ? AND workspace_id = ?
  `).run(job.job_id, job.workspace_id)

  const eligible = listEmbeddingJobItems({
    job_id: job.job_id,
    workspace_id: job.workspace_id,
    statuses: ['pending', 'stale'],
  }, db)
  if (eligible.length === 0) {
    finalizeJob(job.job_id, job.workspace_id, db)
    return getEmbeddingJobStatus({ job_id: job.job_id, workspace_id: job.workspace_id }, db)
  }

  const embedder = input.embedder ?? providerForDomain(job.source_domain)
  if (!embedder) {
    db.prepare('UPDATE embedding_jobs SET status = ?, finished_at = datetime(\'now\'), summary = ? WHERE job_id = ? AND workspace_id = ?')
      .run('failed', JSON.stringify({ error: 'missing_embedder' }), job.job_id, job.workspace_id)
    appendRagJobEvent({ job_id: job.job_id, workspace_id: job.workspace_id, event_type: 'failed', message: 'no embedder registered', details: { code: 'missing_embedder' } }, db)
    return getEmbeddingJobStatus({ job_id: job.job_id, workspace_id: job.workspace_id }, db)
  }

  const batchSize = Math.max(1, input.batch_size ?? 32)
  let processed = 0
  while (true) {
    const remainingLimit = input.max_items === undefined ? batchSize : Math.min(batchSize, input.max_items - processed)
    if (remainingLimit <= 0) break
    const items = listEmbeddingJobItems({
      job_id: job.job_id,
      workspace_id: job.workspace_id,
      statuses: ['pending', 'stale'],
    }, db).slice(0, remainingLimit)
    if (items.length === 0) break

    await processBatch(items, embedder, db)
    processed += items.length

    const cancel = db.prepare('SELECT cancel_requested_at FROM embedding_jobs WHERE job_id = ? AND workspace_id = ?').get(job.job_id, job.workspace_id) as { cancel_requested_at: string | null }
    if (cancel.cancel_requested_at) {
      db.prepare('UPDATE embedding_jobs SET status = ?, finished_at = datetime(\'now\') WHERE job_id = ? AND workspace_id = ?').run('cancelled', job.job_id, job.workspace_id)
      appendRagJobEvent({ job_id: job.job_id, workspace_id: job.workspace_id, event_type: 'cancelled', message: 'embedding job cancelled' }, db)
      return getEmbeddingJobStatus({ job_id: job.job_id, workspace_id: job.workspace_id }, db)
    }
  }

  finalizeJob(job.job_id, job.workspace_id, db)
  return getEmbeddingJobStatus({ job_id: job.job_id, workspace_id: job.workspace_id }, db)
}

export async function resumeEmbeddingJob(input: Omit<EmbeddingJobRunInput, 'retry_failed'>, db: Db = getDb()): Promise<EmbeddingJobStatusView> {
  appendRagJobEvent({ job_id: input.job_id, workspace_id: input.workspace_id, event_type: 'resumed', message: 'embedding job resumed' }, db)
  return runEmbeddingJob(input, db)
}

export async function retryFailedEmbeddingJob(input: Omit<EmbeddingJobRunInput, 'retry_failed'>, db: Db = getDb()): Promise<EmbeddingJobStatusView> {
  return runEmbeddingJob({ ...input, retry_failed: true }, db)
}

export function cancelEmbeddingJob(input: { job_id: string; workspace_id: string }, db: Db = getDb()): EmbeddingJobStatusView {
  getEmbeddingJob(input, db)
  db.prepare(`
    UPDATE embedding_jobs
       SET status = 'cancelled', cancel_requested_at = datetime('now'), finished_at = datetime('now')
     WHERE job_id = ? AND workspace_id = ?
  `).run(input.job_id, input.workspace_id)
  appendRagJobEvent({ job_id: input.job_id, workspace_id: input.workspace_id, event_type: 'cancelled', message: 'embedding job cancellation requested' }, db)
  return getEmbeddingJobStatus(input, db)
}

export function getEmbeddingJobStatus(input: { job_id: string; workspace_id: string }, db: Db = getDb()): EmbeddingJobStatusView {
  const job = getEmbeddingJob(input, db)
  return {
    job_id: job.job_id,
    status: job.status,
    source_domain: job.source_domain,
    progress: summarizeItems(job.job_id, job.workspace_id, db),
    events: listRagJobEvents(input, db),
  }
}
