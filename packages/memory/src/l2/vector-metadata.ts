import { getDb, newId } from 'fulcrum-agent-core'
import type { Db, VectorMetadataSourceDomain, VectorMetadataStatus, VectorMetadataTable } from 'fulcrum-agent-core'
import { redactRagText } from '../setup/rag-redaction.js'

export interface VectorMetadataInput {
  workspace_id: string
  source_domain: VectorMetadataSourceDomain
  source_id: string
  content_hash?: string | null
  provider?: string | null
  model?: string | null
  requested_device?: string | null
  actual_device?: string | null
  dimensions?: number | null
  vector_table: VectorMetadataTable
  status?: VectorMetadataStatus
  error_type?: string | null
  error_message?: string | null
}

export interface VectorMetadataRow extends Required<Omit<VectorMetadataInput, 'status' | 'content_hash' | 'provider' | 'model' | 'requested_device' | 'actual_device' | 'dimensions' | 'error_type' | 'error_message'>> {
  vector_metadata_id: string
  content_hash: string | null
  provider: string | null
  model: string | null
  requested_device: string | null
  actual_device: string | null
  dimensions: number | null
  status: VectorMetadataStatus
  embedded_at: string | null
  error_type: string | null
  error_message: string | null
}

export interface VectorFreshnessInput {
  workspace_id: string
  source_domain: VectorMetadataSourceDomain
  source_id: string
  content_hash: string
  provider: string
  model: string
  requested_device?: string | null
  dimensions: number
}

function rowToVectorMetadata(row: Record<string, unknown>): VectorMetadataRow {
  return {
    vector_metadata_id: String(row['vector_metadata_id']),
    workspace_id: String(row['workspace_id']),
    source_domain: row['source_domain'] as VectorMetadataSourceDomain,
    source_id: String(row['source_id']),
    content_hash: row['content_hash'] === null ? null : String(row['content_hash']),
    provider: row['provider'] === null ? null : String(row['provider']),
    model: row['model'] === null ? null : String(row['model']),
    requested_device: row['requested_device'] === null ? null : String(row['requested_device']),
    actual_device: row['actual_device'] === null ? null : String(row['actual_device']),
    dimensions: row['dimensions'] === null ? null : Number(row['dimensions']),
    vector_table: row['vector_table'] as VectorMetadataTable,
    status: row['status'] as VectorMetadataStatus,
    embedded_at: row['embedded_at'] === null ? null : String(row['embedded_at']),
    error_type: row['error_type'] === null ? null : String(row['error_type']),
    error_message: row['error_message'] === null ? null : String(row['error_message']),
  }
}

export function writeVectorMetadata(input: VectorMetadataInput, db: Db = getDb()): VectorMetadataRow {
  const vector_metadata_id = newId('vector_metadata')
  const status = input.status ?? 'current'
  const embedded_at = new Date().toISOString()
  const error_message = input.error_message ? redactRagText(input.error_message) : null

  db.prepare(`
    INSERT INTO vector_metadata (
      vector_metadata_id, workspace_id, source_domain, source_id, content_hash,
      provider, model, requested_device, actual_device, dimensions, vector_table,
      status, embedded_at, error_type, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    vector_metadata_id,
    input.workspace_id,
    input.source_domain,
    input.source_id,
    input.content_hash ?? null,
    input.provider ?? null,
    input.model ?? null,
    input.requested_device ?? null,
    input.actual_device ?? null,
    input.dimensions ?? null,
    input.vector_table,
    status,
    embedded_at,
    input.error_type ?? null,
    error_message,
  )

  return rowToVectorMetadata(db.prepare('SELECT * FROM vector_metadata WHERE vector_metadata_id = ?').get(vector_metadata_id) as Record<string, unknown>)
}

export function classifyVectorMetadata(input: VectorFreshnessInput, db: Db = getDb()): VectorMetadataStatus {
  const rows = db.prepare(`
    SELECT content_hash, provider, model, requested_device, dimensions, status
      FROM vector_metadata
     WHERE workspace_id = ?
       AND source_domain = ?
       AND source_id = ?
     ORDER BY embedded_at DESC, rowid DESC
     LIMIT 20
  `).all(input.workspace_id, input.source_domain, input.source_id) as Array<{
    content_hash: string | null
    provider: string | null
    model: string | null
    requested_device: string | null
    dimensions: number | null
    status: VectorMetadataStatus
  }>

  if (rows.length === 0) return 'legacy'
  const row = rows.find(candidate =>
    candidate.content_hash === input.content_hash &&
    candidate.provider === input.provider &&
    candidate.model === input.model &&
    (input.requested_device === undefined || candidate.requested_device === input.requested_device) &&
    candidate.dimensions === input.dimensions,
  )
  if (!row) return 'stale'
  if (row.status === 'failed' || row.status === 'skipped') return row.status
  if (
    row.content_hash === input.content_hash &&
    row.provider === input.provider &&
    row.model === input.model &&
    (input.requested_device === undefined || row.requested_device === input.requested_device) &&
    row.dimensions === input.dimensions
  ) {
    return 'current'
  }
  return 'stale'
}
