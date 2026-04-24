import { getDb } from 'fulcrum-agent-core'
import type { Db } from 'fulcrum-agent-core'

export type RagCoverageSourceDomain =
  | 'memory'
  | 'l1_page'
  | 'file_chunk'
  | 'code_chunk'
  | 'graph_entity'
  | 'graph_edge'
  | 'task'
  | 'decision'

export type RagCoverageDerivedDomain =
  | 'fts'
  | 'vector'
  | 'graph'
  | 'code_index'
  | 'contextual_text'
  | 'eval_case'

export type RagCoverageStatus =
  | 'current'
  | 'stale'
  | 'failed'
  | 'skipped'
  | 'intentionally_unembedded'
  | 'legacy'

export interface RagCoverageRecord {
  coverage_id: string
  workspace_id: string
  project_id: string
  source_domain: RagCoverageSourceDomain
  source_id: string
  derived_domain: RagCoverageDerivedDomain
  content_hash: string | null
  status: RagCoverageStatus
  provider: string | null
  model: string | null
  actual_device: string | null
  dimensions: number | null
  freshness_checked_at: string | null
  failure_code: string | null
  failure_message: string | null
}

export interface RagCoverageSummary {
  current: number
  stale: number
  failed: number
  skipped: number
  intentionally_unembedded: number
  legacy: number
}

export interface VectorMetadataCoverageGroup {
  source_domain: 'memory' | 'code_chunk'
  provider: string | null
  model: string | null
  actual_provider: string | null
  actual_model: string | null
  requested_device: string | null
  actual_device: string | null
  dimensions: number | null
  status: string
  count: number
}

export interface VectorMetadataReconciliationSummary extends RagCoverageSummary {
  metadata_rows: number
  missing_vector_rows: number
  missing_source_rows: number
  content_hash_mismatches: number
  runtime_mismatches: number
  freshness_mismatches: number
  groups: VectorMetadataCoverageGroup[]
}

export function emptyCoverageSummary(): RagCoverageSummary {
  return {
    current: 0,
    stale: 0,
    failed: 0,
    skipped: 0,
    intentionally_unembedded: 0,
    legacy: 0,
  }
}

function safeCount(db: Db, sql: string, ...params: unknown[]): number {
  try {
    const row = db.prepare(sql).get(...params) as { n: number } | undefined
    return row?.n ?? 0
  } catch {
    return 0
  }
}

function safeRows<T>(db: Db, sql: string, ...params: unknown[]): T[] {
  try {
    return db.prepare(sql).all(...params) as T[]
  } catch {
    return []
  }
}

export function reconcileVectorMetadata(
  input: { workspace_id: string; project_id: string },
  db: Db = getDb(),
): VectorMetadataReconciliationSummary {
  const baseParams = [input.workspace_id, input.project_id, input.workspace_id, input.project_id]
  const scoped = `
    WITH scoped_vectors AS (
      SELECT v.*, m.content_hash AS source_hash
       FROM vector_metadata v
        JOIN memories m ON m.memory_id = v.source_id AND m.workspace_id = v.workspace_id
       WHERE v.workspace_id = ?
         AND v.source_domain = 'memory'
         AND (m.project_id = ? OR m.project_id IS NULL)
         AND m.schema_version >= 3
         AND (
           v.status = 'current'
           OR NOT EXISTS (
             SELECT 1
               FROM vector_metadata current_v
              WHERE current_v.workspace_id = v.workspace_id
                AND current_v.source_domain = v.source_domain
                AND current_v.source_id = v.source_id
                AND current_v.status = 'current'
                AND current_v.rowid > v.rowid
           )
         )
      UNION ALL
      SELECT v.*, c.content_hash AS source_hash
        FROM vector_metadata v
        JOIN code_chunks c ON c.chunk_id = v.source_id AND c.workspace_id = v.workspace_id
       WHERE v.workspace_id = ?
         AND v.source_domain = 'code_chunk'
         AND c.project_id = ?
         AND (
           v.status = 'current'
           OR NOT EXISTS (
             SELECT 1
               FROM vector_metadata current_v
              WHERE current_v.workspace_id = v.workspace_id
                AND current_v.source_domain = v.source_domain
                AND current_v.source_id = v.source_id
                AND current_v.status = 'current'
                AND current_v.rowid > v.rowid
           )
         )
    )
  `
  const rowsByStatus = safeRows<{ status: RagCoverageStatus; n: number }>(db, `
    ${scoped}
    SELECT status, COUNT(*) AS n
      FROM scoped_vectors
     GROUP BY status
  `, ...baseParams)
  const byStatus = new Map(rowsByStatus.map(row => [row.status, row.n]))
  const groups = safeRows<VectorMetadataCoverageGroup>(db, `
    ${scoped}
    SELECT source_domain, provider, model, actual_provider, actual_model, requested_device,
           actual_device, dimensions, status, COUNT(*) AS count
      FROM scoped_vectors
     GROUP BY source_domain, provider, model, actual_provider, actual_model,
              requested_device, actual_device, dimensions, status
     ORDER BY source_domain, provider, model, requested_device, actual_device, dimensions, status
  `, ...baseParams)

  const missingMemoryRows = safeCount(db, `
    ${scoped}
    SELECT COUNT(*) AS n
      FROM scoped_vectors v
     WHERE v.source_domain = 'memory'
       AND NOT EXISTS (SELECT 1 FROM vec_memories vm WHERE vm.memory_id = v.source_id)
  `, ...baseParams)
  const missingCodeRows = safeCount(db, `
    ${scoped}
    SELECT COUNT(*) AS n
      FROM scoped_vectors v
     WHERE v.source_domain = 'code_chunk'
       AND NOT EXISTS (SELECT 1 FROM vec_chunks vc WHERE vc.chunk_id = v.source_id)
  `, ...baseParams)
  const missingSourceRows = safeCount(db, `
    SELECT COUNT(*) AS n
      FROM vector_metadata v
      LEFT JOIN memories m ON m.memory_id = v.source_id AND m.workspace_id = v.workspace_id
     WHERE v.workspace_id = ? AND v.source_domain = 'memory' AND m.memory_id IS NULL
  `, input.workspace_id) + safeCount(db, `
    SELECT COUNT(*) AS n
      FROM vector_metadata v
      LEFT JOIN code_chunks c ON c.chunk_id = v.source_id AND c.workspace_id = v.workspace_id
     WHERE v.workspace_id = ? AND v.source_domain = 'code_chunk' AND c.chunk_id IS NULL
  `, input.workspace_id)
  const contentHashMismatches = safeCount(db, `
    ${scoped}
    SELECT COUNT(*) AS n
     FROM scoped_vectors
     WHERE source_hash IS NOT NULL
       AND COALESCE(content_hash, '') != COALESCE(source_hash, '')
  `, ...baseParams)
  const runtimeMismatches = safeCount(db, `
    ${scoped}
    SELECT COUNT(*) AS n
      FROM scoped_vectors
     WHERE (actual_provider IS NOT NULL AND provider IS NOT NULL AND actual_provider != provider)
        OR (actual_model IS NOT NULL AND model IS NOT NULL AND actual_model != model)
        OR (requested_device IS NOT NULL AND requested_device != 'auto' AND actual_device IS NOT NULL AND actual_device != requested_device)
  `, ...baseParams)
  const freshnessMismatches = safeCount(db, `
    ${scoped}
    SELECT COUNT(*) AS n
      FROM scoped_vectors
     WHERE status = 'current'
       AND (
         (source_hash IS NOT NULL AND COALESCE(content_hash, '') != COALESCE(source_hash, ''))
         OR (source_domain = 'memory' AND NOT EXISTS (SELECT 1 FROM vec_memories vm WHERE vm.memory_id = scoped_vectors.source_id))
         OR (source_domain = 'code_chunk' AND NOT EXISTS (SELECT 1 FROM vec_chunks vc WHERE vc.chunk_id = scoped_vectors.source_id))
       )
  `, ...baseParams)

  return {
    current: byStatus.get('current') ?? 0,
    stale: byStatus.get('stale') ?? 0,
    failed: byStatus.get('failed') ?? 0,
    skipped: byStatus.get('skipped') ?? 0,
    intentionally_unembedded: 0,
    legacy: byStatus.get('legacy') ?? 0,
    metadata_rows: groups.reduce((sum, group) => sum + Number(group.count), 0),
    missing_vector_rows: missingMemoryRows + missingCodeRows,
    missing_source_rows: missingSourceRows,
    content_hash_mismatches: contentHashMismatches,
    runtime_mismatches: runtimeMismatches,
    freshness_mismatches: freshnessMismatches,
    groups,
  }
}
