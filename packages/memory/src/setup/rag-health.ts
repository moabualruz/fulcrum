import { existsSync } from 'fs'
import { getDb, newId, resolveRuntimeDataProfile } from 'fulcrum-agent-core'
import type {
  Db,
  RagHealthStatus,
  RuntimeDataProfile,
  RuntimeProfileError,
  RuntimeProfilePathKey,
} from 'fulcrum-agent-core'
import { summarizeGraphCoverage } from '../graph/coverage.js'
import { getVaultPath } from '../vault/client.js'
import { reconcileVectorMetadata } from './rag-coverage.js'
import type {
  RagHealthDomain,
  RagHealthProfileManifest,
  RagHealthReport,
} from './rag-types.js'
import {
  SCOPED_VECTOR_METADATA_CTE,
  type FtsParityCheck,
  type SourcePathRow,
  aggregateStatus,
  embedCommand,
  fileExistsInVault,
  fileMatchesScope,
  ftsParityCheck,
  healthStatusFromGraphCoverage,
  jobRetryCommand,
  missingObject,
  objectExists,
  pushAction,
  rebuildCommand,
  safeCount,
  safeRows,
  scopedVectorParams,
  toHealthProfileManifest,
  walkVaultMarkdown,
} from './rag-health-support.js'
export type {
  RagHealthDomain,
  RagHealthProfileError,
  RagHealthProfileManifest,
  RagHealthReport,
} from './rag-types.js'


function buildL0Domain(input: { workspace_id: string; project_id: string; vault_path: string }, db: Db): RagHealthDomain {
  if (!objectExists(db, 'l0_sources')) return missingObject('l0_sources')

  const rows = safeRows<SourcePathRow>(db, `
    SELECT source_id AS id, vault_path
      FROM l0_sources
     WHERE workspace_id = ? AND (project_id = ? OR project_id IS NULL)
  `, input.workspace_id, input.project_id)
  const rowPaths = new Set(rows.map(row => row.vault_path).filter((path): path is string => Boolean(path)))
  const rawFiles = walkVaultMarkdown(input.vault_path, 'raw')
    .filter(path => fileMatchesScope(input.vault_path, path, input))
  const missingFiles = rows.filter(row => !fileExistsInVault(input.vault_path, row.vault_path)).length
  const orphanFiles = rawFiles.filter(path => !rowPaths.has(path)).length
  const status: RagHealthStatus = missingFiles > 0 || orphanFiles > 0 ? 'degraded' : 'healthy'

  return {
    status,
    files: rawFiles.length,
    rows: rows.length,
    missing_files: missingFiles,
    orphan_files: orphanFiles,
    vault_found: existsSync(input.vault_path),
  }
}

function buildL1Domain(input: { workspace_id: string; project_id: string; vault_path: string }, db: Db): RagHealthDomain {
  if (!objectExists(db, 'l1_pages')) return missingObject('l1_pages')

  const rows = safeRows<SourcePathRow>(db, `
    SELECT page_id AS id, vault_path
      FROM l1_pages
     WHERE workspace_id = ? AND (project_id = ? OR project_id IS NULL)
  `, input.workspace_id, input.project_id)
  const rowPaths = new Set(rows.map(row => row.vault_path).filter((path): path is string => Boolean(path)))
  const curatedFiles = walkVaultMarkdown(input.vault_path, 'curated')
    .filter(path => fileMatchesScope(input.vault_path, path, input))
  const missingFiles = rows.filter(row => !fileExistsInVault(input.vault_path, row.vault_path)).length
  const orphanFiles = curatedFiles.filter(path => !rowPaths.has(path)).length
  const status: RagHealthStatus = missingFiles > 0 || orphanFiles > 0 ? 'degraded' : 'healthy'

  return {
    status,
    files: curatedFiles.length,
    rows: rows.length,
    missing_files: missingFiles,
    orphan_files: orphanFiles,
  }
}

function buildFtsDomain(input: { workspace_id: string; project_id: string }, db: Db): RagHealthDomain {
  const checks: FtsParityCheck[] = []
  if (!objectExists(db, 'memories_fts')) {
    checks.push({ name: 'memories_fts_parity', status: 'fail', expected: 0, actual: 0, missing_index_rows: 0, unchecked_rows: 0, details: 'memories_fts is not available' })
  } else {
    checks.push(ftsParityCheck(db, {
      name: 'memories_fts_parity',
      table: 'memories_fts',
      sql: `
        SELECT rowid, content, title, summary
          FROM memories
         WHERE workspace_id = ? AND (project_id = ? OR project_id IS NULL)
      `,
      params: [input.workspace_id, input.project_id],
      tokenValues: row => [row.content, row.title, row.summary],
    }))
  }

  if (!objectExists(db, 'code_chunks_fts')) {
    checks.push({ name: 'code_chunks_fts_parity', status: 'fail', expected: 0, actual: 0, missing_index_rows: 0, unchecked_rows: 0, details: 'code_chunks_fts is not available' })
  } else {
    checks.push(ftsParityCheck(db, {
      name: 'code_chunks_fts_parity',
      table: 'code_chunks_fts',
      sql: `
        SELECT rowid, content, symbol_path
          FROM code_chunks
         WHERE workspace_id = ? AND project_id = ?
      `,
      params: [input.workspace_id, input.project_id],
      tokenValues: row => [row.content, row.symbol_path],
    }))
  }

  const failed = checks.filter(check => check.status === 'fail').length
  const memoryCheck = checks.find(check => check.name === 'memories_fts_parity')
  const codeCheck = checks.find(check => check.name === 'code_chunks_fts_parity')
  return {
    status: failed > 0 ? 'failed' : 'healthy',
    checked: checks.length,
    failed,
    memory_rows: memoryCheck?.expected ?? 0,
    code_chunk_rows: codeCheck?.expected ?? 0,
    missing_index_rows: checks.reduce((sum, check) => sum + check.missing_index_rows, 0),
    unchecked_rows: checks.reduce((sum, check) => sum + check.unchecked_rows, 0),
    checks,
  }
}

function buildCodeDomain(input: { workspace_id: string; project_id: string }, db: Db): RagHealthDomain {
  if (!objectExists(db, 'code_files')) return missingObject('code_files')
  if (!objectExists(db, 'code_chunks')) return missingObject('code_chunks')

  const files = safeCount(db, `
    SELECT COUNT(*) AS n FROM code_files
     WHERE workspace_id = ? AND project_id = ?
  `, input.workspace_id, input.project_id)
  const chunks = safeCount(db, `
    SELECT COUNT(*) AS n FROM code_chunks
     WHERE workspace_id = ? AND project_id = ?
  `, input.workspace_id, input.project_id)
  const orphanChunks = safeCount(db, `
    SELECT COUNT(*) AS n
      FROM code_chunks c
      LEFT JOIN code_files f
        ON f.file_id = c.file_id
       AND f.workspace_id = c.workspace_id
       AND f.project_id = c.project_id
     WHERE c.workspace_id = ? AND c.project_id = ?
       AND c.file_id IS NOT NULL
       AND f.file_id IS NULL
  `, input.workspace_id, input.project_id)
  const legacyChunks = safeCount(db, `
    SELECT COUNT(*) AS n FROM code_chunks
     WHERE workspace_id = ? AND project_id = ? AND file_id IS NULL
  `, input.workspace_id, input.project_id)
  const chunkCountMismatches = safeCount(db, `
    SELECT COUNT(*) AS n
      FROM code_files f
     WHERE f.workspace_id = ? AND f.project_id = ?
       AND f.chunks_count != (
         SELECT COUNT(*) FROM code_chunks c
          WHERE c.workspace_id = f.workspace_id
            AND c.project_id = f.project_id
            AND c.file_id = f.file_id
       )
  `, input.workspace_id, input.project_id)
  const failedFiles = safeCount(db, `
    SELECT COUNT(*) AS n FROM code_files
     WHERE workspace_id = ? AND project_id = ? AND status = 'failed'
  `, input.workspace_id, input.project_id)
  const parseFailedFiles = safeCount(db, `
    SELECT COUNT(*) AS n FROM code_files
     WHERE workspace_id = ? AND project_id = ? AND parse_status = 'failed'
  `, input.workspace_id, input.project_id)
  const parseSkippedFiles = safeCount(db, `
    SELECT COUNT(*) AS n FROM code_files
     WHERE workspace_id = ? AND project_id = ? AND parse_status = 'skipped'
  `, input.workspace_id, input.project_id)
  const vectorStatusRows = safeRows<{ vector_status: string; n: number }>(db, `
    SELECT vector_status, COUNT(*) AS n
      FROM code_files
     WHERE workspace_id = ? AND project_id = ?
     GROUP BY vector_status
  `, input.workspace_id, input.project_id)
  const failureSamples = safeRows<Record<string, unknown>>(db, `
    SELECT rel_path, status, parse_status, vector_status, failure_reason
      FROM code_files
     WHERE workspace_id = ? AND project_id = ?
       AND (status != 'indexed' OR parse_status != 'parsed' OR vector_status IN ('failed','stale'))
     ORDER BY last_error_at DESC, rel_path ASC
     LIMIT 10
  `, input.workspace_id, input.project_id)
  const status: RagHealthStatus =
    orphanChunks > 0 || legacyChunks > 0 || chunkCountMismatches > 0 || failedFiles > 0 || parseFailedFiles > 0 || parseSkippedFiles > 0
      ? 'degraded'
      : 'healthy'

  return {
    status,
    files,
    chunks,
    orphan_chunks: orphanChunks,
    legacy_chunks: legacyChunks,
    chunk_count_mismatches: chunkCountMismatches,
    failed_files: failedFiles,
    parse_failed_files: parseFailedFiles,
    parse_skipped_files: parseSkippedFiles,
    vector_status_counts: Object.fromEntries(vectorStatusRows.map(row => [row.vector_status, row.n])),
    failure_samples: failureSamples,
  }
}

function buildVectorDomain(input: { workspace_id: string; project_id: string }, db: Db): RagHealthDomain {
  if (!objectExists(db, 'vector_metadata')) return missingObject('vector_metadata')

  const statusRows = safeRows<{ status: string; n: number }>(db, `
    ${SCOPED_VECTOR_METADATA_CTE}
    SELECT status, COUNT(*) AS n
      FROM scoped_vectors
     GROUP BY status
  `, ...scopedVectorParams(input))
  const byStatus = new Map(statusRows.map(row => [row.status, row.n]))
  const groups = safeRows<Record<string, unknown>>(db, `
    ${SCOPED_VECTOR_METADATA_CTE}
    SELECT source_domain, provider, model, actual_provider, actual_model, requested_device, actual_device,
           dimensions, status, COUNT(*) AS count
      FROM scoped_vectors
     GROUP BY source_domain, provider, model, actual_provider, actual_model, requested_device, actual_device, dimensions, status
     ORDER BY source_domain, provider, model, requested_device, actual_device, dimensions, status
  `, ...scopedVectorParams(input))
  const reconciliation = reconcileVectorMetadata(input, db)

  const missingMemoryMetadata = safeCount(db, `
    SELECT COUNT(*) AS n
      FROM memories m
     WHERE m.workspace_id = ? AND (m.project_id = ? OR m.project_id IS NULL)
       AND m.schema_version >= 3
       AND NOT EXISTS (
         SELECT 1 FROM vector_metadata v
          WHERE v.workspace_id = m.workspace_id
            AND v.source_domain = 'memory'
            AND v.source_id = m.memory_id
       )
  `, input.workspace_id, input.project_id)
  const missingCodeMetadata = safeCount(db, `
    SELECT COUNT(*) AS n
      FROM code_chunks c
     WHERE c.workspace_id = ? AND c.project_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM vector_metadata v
          WHERE v.workspace_id = c.workspace_id
            AND v.source_domain = 'code_chunk'
            AND v.source_id = c.chunk_id
       )
  `, input.workspace_id, input.project_id)
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

  const failedJobItems = safeCount(db, `
    SELECT COUNT(*) AS n
      FROM embedding_job_items i
      JOIN embedding_jobs j ON j.job_id = i.job_id AND j.workspace_id = i.workspace_id
     WHERE i.workspace_id = ? AND j.project_id = ? AND i.status = 'failed'
       AND NOT EXISTS (
         SELECT 1
           FROM vector_metadata v
          WHERE v.workspace_id = i.workspace_id
            AND v.source_domain = CASE i.source_domain WHEN 'code_chunks' THEN 'code_chunk' ELSE 'memory' END
            AND v.source_id = i.source_id
            AND v.status = 'current'
            AND (i.source_content_hash = '' OR v.content_hash = i.source_content_hash)
       )
  `, input.workspace_id, input.project_id)
  const failuresByReason = safeRows<Record<string, unknown>>(db, `
    SELECT COALESCE(i.error_type, 'unknown') AS error_type,
           COALESCE(i.error_message, '') AS error_message,
           COUNT(*) AS count
      FROM embedding_job_items i
      JOIN embedding_jobs j ON j.job_id = i.job_id AND j.workspace_id = i.workspace_id
     WHERE i.workspace_id = ? AND j.project_id = ? AND i.status = 'failed'
       AND NOT EXISTS (
         SELECT 1
           FROM vector_metadata v
          WHERE v.workspace_id = i.workspace_id
            AND v.source_domain = CASE i.source_domain WHEN 'code_chunks' THEN 'code_chunk' ELSE 'memory' END
            AND v.source_id = i.source_id
            AND v.status = 'current'
            AND (i.source_content_hash = '' OR v.content_hash = i.source_content_hash)
       )
     GROUP BY COALESCE(i.error_type, 'unknown'), COALESCE(i.error_message, '')
     ORDER BY count DESC, error_type
  `, input.workspace_id, input.project_id)
  const recoveryEvents = safeCount(db, `
    SELECT COUNT(*) AS n
      FROM rag_job_events e
      JOIN embedding_jobs j ON j.job_id = e.job_id AND j.workspace_id = e.workspace_id
     WHERE e.workspace_id = ? AND j.project_id = ? AND e.event_type IN ('split', 'fallback')
  `, input.workspace_id, input.project_id)

  const current = byStatus.get('current') ?? 0
  const stale = byStatus.get('stale') ?? 0
  const failed = byStatus.get('failed') ?? 0
  const skipped = byStatus.get('skipped') ?? 0
  const legacy = byStatus.get('legacy') ?? 0
  const missing_metadata = missingMemoryMetadata + missingCodeMetadata
  const status: RagHealthStatus =
    stale > 0 || failed > 0 || legacy > 0 || missing_metadata > 0 || missingSourceRows > 0 || failedJobItems > 0 ||
    reconciliation.missing_vector_rows > 0 || reconciliation.content_hash_mismatches > 0 || reconciliation.runtime_mismatches > 0 ||
    reconciliation.freshness_mismatches > 0
      ? 'degraded'
      : 'healthy'

  return {
    status,
    current,
    stale,
    failed,
    skipped,
    legacy,
    missing_metadata,
    missing_memory_metadata: missingMemoryMetadata,
    missing_code_metadata: missingCodeMetadata,
    missing_vector_rows: reconciliation.missing_vector_rows,
    content_hash_mismatches: reconciliation.content_hash_mismatches,
    runtime_mismatches: reconciliation.runtime_mismatches,
    freshness_mismatches: reconciliation.freshness_mismatches,
    missing_source_rows: missingSourceRows,
    failed_job_items: failedJobItems,
    recovery_events: recoveryEvents,
    groups,
    reconciliation,
    failures_by_reason: failuresByReason,
  }
}

interface GraphDomainCoverage {
  sources: number
  graph_entities: number
  graph_edges?: number
  current?: number
  stale?: number
  failed?: number
  status: RagHealthStatus
}

function buildGraphDomain(input: { workspace_id: string; project_id: string }, db: Db): RagHealthDomain {
  if (!objectExists(db, 'graph_entities')) return missingObject('graph_entities')
  if (!objectExists(db, 'graph_edges')) return missingObject('graph_edges')

  const memorySources = safeCount(db, `
    SELECT COUNT(*) AS n FROM memories
     WHERE workspace_id = ? AND (project_id = ? OR project_id IS NULL)
  `, input.workspace_id, input.project_id)
  const taskSources = safeCount(db, `
    SELECT COUNT(*) AS n FROM tasks
     WHERE workspace_id = ? AND project_id = ?
  `, input.workspace_id, input.project_id)
  const decisionSources = safeCount(db, `
    SELECT COUNT(*) AS n FROM memories
     WHERE workspace_id = ? AND (project_id = ? OR project_id IS NULL) AND kind = 'decision'
  `, input.workspace_id, input.project_id)
  const fileSources = safeCount(db, `
    SELECT COUNT(*) AS n FROM code_files
     WHERE workspace_id = ? AND project_id = ?
  `, input.workspace_id, input.project_id)
  const symbolSources = safeCount(db, `
    SELECT COUNT(*) AS n
      FROM code_symbols s
      JOIN code_files f ON f.file_id = s.file_id
     WHERE f.workspace_id = ? AND f.project_id = ?
  `, input.workspace_id, input.project_id)
  const coverage = summarizeGraphCoverage(input, db)
  const evidenceUnits = coverage.evidence_units
  const projectEntityIds = new Set(evidenceUnits
    .filter(unit => unit.kind !== 'edge')
    .map(unit => unit.graph_unit_id))
  const entities = projectEntityIds.size
  const edges = evidenceUnits.filter(unit => unit.kind === 'edge').length
  const brokenEdges = evidenceUnits.filter(unit => (
    unit.kind === 'edge'
    && (!unit.from_id || !unit.to_id || !projectEntityIds.has(unit.from_id) || !projectEntityIds.has(unit.to_id))
  )).length
  const domainCoverage: Record<string, GraphDomainCoverage> = Object.fromEntries(
    Object.entries(coverage.domains).map(([domain, summary]) => [domain, {
      sources: summary.sources,
      graph_entities: summary.graph_entities,
      graph_edges: summary.graph_edges,
      current: summary.current,
      stale: summary.stale,
      failed: summary.failed,
      status: healthStatusFromGraphCoverage(summary.status),
    }]),
  )
  const coverageGaps = Object.entries(domainCoverage)
    .filter(([, coverage]) => coverage.status === 'degraded')
    .map(([domain]) => domain)
  if (coverageGaps.includes('memory')) coverageGaps.push('memories')
  if (coverageGaps.includes('file') || coverageGaps.includes('symbol')) coverageGaps.push('code')
  const status: RagHealthStatus = brokenEdges > 0 || coverageGaps.length > 0 ? 'degraded' : 'healthy'

  return {
    status,
    entities,
    edges,
    broken_edges: brokenEdges,
    coverage_gaps: coverageGaps,
    domain_coverage: domainCoverage,
    coverage_totals: coverage.totals,
    evidence_units: evidenceUnits.length,
    source_counts: {
      memory: memorySources,
      task: taskSources,
      decision: decisionSources,
      file: fileSources,
      symbol: symbolSources,
    },
  }
}


function recommendedActions(
  input: { workspace_id: string; project_id: string },
  domains: Record<string, RagHealthDomain>,
  runtime_profile: RuntimeDataProfile,
): string[] {
  const actions: string[] = []
  if (domains['l0']?.status !== 'healthy' && domains['l0']?.status !== 'out_of_scope') {
    pushAction(actions, `Repair raw-source coverage from canonical vault files, then rerun \`fulcrum memory doctor --workspace-id ${input.workspace_id} --project-id ${input.project_id} --json\`.`)
  }
  if (domains['l1']?.status !== 'healthy' && domains['l1']?.status !== 'out_of_scope') {
    pushAction(actions, `Repair curated L1 files from canonical sources, then rerun \`fulcrum memory doctor --workspace-id ${input.workspace_id} --project-id ${input.project_id} --json\`.`)
  }
  if (domains['fts']?.status !== 'healthy' && domains['fts']?.status !== 'out_of_scope') {
    pushAction(actions, `Run \`${rebuildCommand('fts', input, runtime_profile)}\` to repair text-search indexes.`)
  }
  if (domains['code']?.status !== 'healthy' && domains['code']?.status !== 'out_of_scope') {
    pushAction(actions, `Run code index rebuild via \`${rebuildCommand('code', input, runtime_profile)}\` to repair file/chunk parity.`)
  }
  if (domains['vectors']?.status !== 'healthy' && domains['vectors']?.status !== 'out_of_scope') {
    if (runtime_profile === 'dev') {
      pushAction(actions, `Run \`${embedCommand('memories', input)}\` or \`${embedCommand('code', input)}\` to refresh vector coverage.`)
    } else {
      pushAction(actions, `Vector repair for runtime_profile ${runtime_profile} requires profile-aware embedding support; use a dev profile or repair vectors manually for the selected profile.`)
    }
  }
  const vectors = domains['vectors']
  if (vectors?.status !== 'out_of_scope' && Number(vectors?.['failed_job_items'] ?? 0) > 0) {
    if (runtime_profile === 'dev') {
      pushAction(actions, `Run \`${jobRetryCommand(input)}\` for retryable embedding failures.`)
    } else {
      pushAction(actions, `Embedding job retry for runtime_profile ${runtime_profile} requires profile-aware job execution; retry failed jobs from the selected profile with workspace/project scope.`)
    }
  }
  if (domains['graph']?.status !== 'healthy' && domains['graph']?.status !== 'out_of_scope') {
    pushAction(actions, `Run \`${rebuildCommand('graph', input, runtime_profile)}\` to refresh graph coverage.`)
  }
  return actions
}

export function buildRagHealthReport(
  input: {
    workspace_id: string
    project_id: string
    persist?: boolean
    vault_path?: string
    runtime_profile?: RuntimeDataProfile
    data_dir?: string
    out_of_scope_domains?: string[]
  },
  db: Db = getDb(),
): RagHealthReport {
  const runtime_profile = input.runtime_profile ?? 'dev'
  const profile_manifest = resolveRuntimeDataProfile({ profile: runtime_profile, data_dir: input.data_dir })
  const safe_profile_manifest = toHealthProfileManifest(profile_manifest)
  const vault_path = input.vault_path ?? (input.runtime_profile ? profile_manifest.paths.vault : getVaultPath())
  const domains: Record<string, RagHealthDomain> = {
    l0: buildL0Domain({ ...input, vault_path }, db),
    l1: buildL1Domain({ ...input, vault_path }, db),
    fts: buildFtsDomain(input, db),
    code: buildCodeDomain(input, db),
    vectors: buildVectorDomain(input, db),
    graph: buildGraphDomain(input, db),
  }
  for (const domain of input.out_of_scope_domains ?? []) {
    if (domains[domain]) {
      domains[domain] = {
        ...domains[domain],
        status: 'out_of_scope',
        out_of_scope_reason: 'explicitly_excluded',
      }
    }
  }
  const report: RagHealthReport = {
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    status: aggregateStatus(domains),
    runtime_profile,
    profile_manifest: safe_profile_manifest,
    generated_at: new Date().toISOString(),
    domains,
    recommended_actions: recommendedActions(input, domains, runtime_profile),
    warnings: [],
    errors: [],
  }
  if (input.persist) {
    db.prepare(`
      INSERT INTO rag_health_reports (
        health_report_id, workspace_id, project_id, status, runtime_profile, profile_manifest, generated_at, domains,
        recommended_actions, warnings, errors
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId('rag_health_report'),
      input.workspace_id,
      input.project_id,
      report.status,
      report.runtime_profile,
      JSON.stringify(report.profile_manifest),
      report.generated_at,
      JSON.stringify(report.domains),
      JSON.stringify(report.recommended_actions),
      JSON.stringify(report.warnings),
      JSON.stringify(report.errors),
    )
  }
  return report
}
