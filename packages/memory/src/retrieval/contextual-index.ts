import { createHash } from 'crypto'
import { getDb, newId } from 'fulcrum-agent-core'
import type { Db } from 'fulcrum-agent-core'

export type ContextualIndexStatus = 'current' | 'stale' | 'failed' | 'skipped'

export interface ContextualIndexRecord {
  contextual_index_id: string
  workspace_id: string
  project_id: string
  source_domain: string
  source_id: string
  canonical_content_hash: string
  context_version: string
  template_version: string
  index_text_hash: string
  index_text: string
  status: ContextualIndexStatus
  created_at: string
  updated_at: string
}

export interface WriteContextualIndexRecordInput {
  workspace_id: string
  project_id: string
  source_domain: string
  source_id: string
  canonical_content_hash: string
  context_version: string
  template_version: string
  index_text: string
  status?: ContextualIndexStatus
}

export interface ReadContextualIndexRecordInput {
  workspace_id: string
  project_id: string
  source_domain: string
  source_id: string
  context_version?: string
  template_version?: string
  status?: ContextualIndexStatus
}

export interface MarkStaleContextualIndexRecordsInput {
  workspace_id: string
  project_id: string
  source_domain: string
  source_id: string
  canonical_content_hash: string
  context_version: string
  template_version: string
}

export function isContextualIndexStale(
  record: Pick<ContextualIndexRecord, 'canonical_content_hash' | 'context_version' | 'template_version'>,
  current: Pick<ContextualIndexRecord, 'canonical_content_hash' | 'context_version' | 'template_version'>,
): boolean {
  return record.canonical_content_hash !== current.canonical_content_hash ||
    record.context_version !== current.context_version ||
    record.template_version !== current.template_version
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function rowToContextualIndexRecord(row: Record<string, unknown>): ContextualIndexRecord {
  return {
    contextual_index_id: String(row['contextual_index_id']),
    workspace_id: String(row['workspace_id']),
    project_id: String(row['project_id']),
    source_domain: String(row['source_domain']),
    source_id: String(row['source_id']),
    canonical_content_hash: String(row['canonical_content_hash']),
    context_version: String(row['context_version']),
    template_version: String(row['template_version']),
    index_text_hash: String(row['index_text_hash']),
    index_text: String(row['index_text']),
    status: row['status'] as ContextualIndexStatus,
    created_at: String(row['created_at']),
    updated_at: String(row['updated_at']),
  }
}

export function writeContextualIndexRecord(
  input: WriteContextualIndexRecordInput,
  db: Db = getDb(),
): ContextualIndexRecord {
  const contextual_index_id = newId('contextual_index')
  const index_text_hash = hashText(input.index_text)
  const status = input.status ?? 'current'
  if (status === 'current') markStaleContextualIndexRecords(input, db)

  db.prepare(`
    INSERT INTO contextual_index_records (
      contextual_index_id, workspace_id, project_id, source_domain, source_id,
      canonical_content_hash, context_version, template_version, index_text_hash,
      index_text, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, project_id, source_domain, source_id, canonical_content_hash, context_version, template_version)
    DO UPDATE SET
      canonical_content_hash = excluded.canonical_content_hash,
      index_text_hash = excluded.index_text_hash,
      index_text = excluded.index_text,
      status = excluded.status,
      updated_at = datetime('now')
  `).run(
    contextual_index_id,
    input.workspace_id,
    input.project_id,
    input.source_domain,
    input.source_id,
    input.canonical_content_hash,
    input.context_version,
    input.template_version,
    index_text_hash,
    input.index_text,
    status,
  )

  const row = db.prepare(`
    SELECT *
      FROM contextual_index_records
     WHERE workspace_id = ?
       AND project_id = ?
       AND source_domain = ?
       AND source_id = ?
       AND canonical_content_hash = ?
       AND context_version = ?
       AND template_version = ?
  `).get(
    input.workspace_id,
    input.project_id,
    input.source_domain,
    input.source_id,
    input.canonical_content_hash,
    input.context_version,
    input.template_version,
  ) as Record<string, unknown>

  return rowToContextualIndexRecord(row)
}

export function readContextualIndexRecord(
  input: ReadContextualIndexRecordInput,
  db: Db = getDb(),
): ContextualIndexRecord | null {
  const row = db.prepare(`
    SELECT *
      FROM contextual_index_records
     WHERE workspace_id = ?
       AND project_id = ?
       AND source_domain = ?
       AND source_id = ?
       AND (? IS NULL OR context_version = ?)
       AND (? IS NULL OR template_version = ?)
       AND status = ?
     ORDER BY updated_at DESC, rowid DESC
     LIMIT 1
  `).get(
    input.workspace_id,
    input.project_id,
    input.source_domain,
    input.source_id,
    input.context_version ?? null,
    input.context_version ?? null,
    input.template_version ?? null,
    input.template_version ?? null,
    input.status ?? 'current',
  ) as Record<string, unknown> | undefined

  return row ? rowToContextualIndexRecord(row) : null
}

export function markStaleContextualIndexRecords(
  input: MarkStaleContextualIndexRecordsInput,
  db: Db = getDb(),
): number {
  const result = db.prepare(`
    UPDATE contextual_index_records
       SET status = 'stale',
           updated_at = datetime('now')
     WHERE workspace_id = ?
       AND project_id = ?
       AND source_domain = ?
       AND source_id = ?
       AND status = 'current'
       AND (
         canonical_content_hash <> ?
         OR context_version <> ?
         OR template_version <> ?
       )
  `).run(
    input.workspace_id,
    input.project_id,
    input.source_domain,
    input.source_id,
    input.canonical_content_hash,
    input.context_version,
    input.template_version,
  )
  return result.changes
}
