import { getDb, newId } from 'fulcrum-agent-core'
import type { Db } from 'fulcrum-agent-core'
import { backfillCodeFiles } from './backfill-code-files.js'
import { captureRebuildInputSnapshot, validateRebuildInputSnapshot } from './rebuild-snapshot.js'
import { createRebuildCandidate, finishRebuildCandidate, updateRebuildCandidateStatus } from './rebuild-candidate.js'
import { runRebuildParityChecks } from './rebuild-parity.js'
import { createRunningRebuildReport, finishRebuildReport } from './rebuild-report.js'
import { redactRagDetails } from './rag-redaction.js'
import { RAG_REBUILD_DOMAINS } from './rag-types.js'
import type { RagParityCheck, RagRebuildActor, RagRebuildDomain, RagRebuildReport, RagRebuildRequest } from './rag-types.js'

export { RAG_REBUILD_DOMAINS } from './rag-types.js'
export type { RagParityCheck, RagRebuildActor, RagRebuildDomain, RagRebuildReport, RagRebuildRequest } from './rag-types.js'

function safeCount(db: Db, sql: string, ...params: unknown[]): number {
  try {
    const row = db.prepare(sql).get(...params) as { n: number } | undefined
    return row?.n ?? 0
  } catch {
    return 0
  }
}

function normalizeDomains(domains: RagRebuildDomain[] | undefined): RagRebuildDomain[] {
  if (!domains || domains.length === 0) return [...RAG_REBUILD_DOMAINS]
  const seen = new Set<RagRebuildDomain>()
  for (const domain of domains) {
    if (!RAG_REBUILD_DOMAINS.includes(domain)) throw new Error(`unknown RAG rebuild domain: ${domain}`)
    seen.add(domain)
  }
  return [...seen]
}

export function planRagRebuildScope(
  input: { workspace_id: string; project_id: string; domains?: RagRebuildDomain[] },
  db: Db = getDb(),
): { domains: RagRebuildDomain[]; counts: Record<string, number>; total: number } {
  const domains = normalizeDomains(input.domains)
  const counts: Record<string, number> = {
    raw_files: 0,
    l0_sources: safeCount(db, 'SELECT COUNT(*) AS n FROM l0_sources WHERE workspace_id = ? AND (project_id = ? OR project_id IS NULL)', input.workspace_id, input.project_id),
    memory_files: 0,
    memories: safeCount(db, 'SELECT COUNT(*) AS n FROM memories WHERE workspace_id = ? AND (project_id = ? OR project_id IS NULL)', input.workspace_id, input.project_id),
    code_files: safeCount(db, 'SELECT COUNT(*) AS n FROM code_files WHERE workspace_id = ? AND project_id = ?', input.workspace_id, input.project_id),
    code_chunks: safeCount(db, 'SELECT COUNT(*) AS n FROM code_chunks WHERE workspace_id = ? AND project_id = ?', input.workspace_id, input.project_id),
    vectors: safeCount(db, 'SELECT COUNT(*) AS n FROM vector_metadata WHERE workspace_id = ?', input.workspace_id),
    graph_entities: safeCount(db, 'SELECT COUNT(*) AS n FROM graph_entities WHERE workspace_id = ?', input.workspace_id),
    graph_edges: safeCount(db, 'SELECT COUNT(*) AS n FROM graph_edges WHERE workspace_id = ?', input.workspace_id),
  }
  counts['raw_files'] = counts['l0_sources'] ?? 0
  counts['memory_files'] = counts['memories'] ?? 0
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
  return { domains, counts, total }
}

function rebuildFts(db: Db): string[] {
  const warnings: string[] = []
  for (const table of ['memories_fts', 'code_chunks_fts']) {
    try {
      db.prepare(`INSERT INTO ${table}(${table}) VALUES ('rebuild')`).run()
    } catch (err) {
      warnings.push(`${table} rebuild skipped: ${(err as Error).message}`)
    }
  }
  return warnings
}

export async function runRagRebuild(request: RagRebuildRequest, db: Db = getDb()): Promise<RagRebuildReport> {
  const domains = normalizeDomains(request.domains)
  const actor = request.actor ?? { kind: 'agent', role: 'software_engineer', id: 'unknown' }
  const planned = planRagRebuildScope({ ...request, domains }, db)
  const errors: unknown[] = []
  const warnings: string[] = []

  if (planned.total === 0 && request.allow_empty !== true) {
    errors.push({ code: 'empty_scope', message: 'RAG rebuild scope is empty; pass allow_empty to continue' })
    return {
      report_id: newId('rag_rebuild_report'),
      status: 'failed',
      mode: request.mode,
      scope: { workspace_id: request.workspace_id, project_id: request.project_id, domains },
      candidate: null,
      counts: planned.counts,
      parity: [],
      warnings,
      errors,
      artifact_path: null,
    }
  }

  if (request.mode !== 'execute') {
    return {
      report_id: newId('rag_rebuild_report'),
      status: 'completed',
      mode: request.mode,
      scope: { workspace_id: request.workspace_id, project_id: request.project_id, domains },
      candidate: null,
      counts: planned.counts,
      parity: [],
      warnings,
      errors,
      artifact_path: null,
    }
  }

  const report_id = createRunningRebuildReport({
    workspace_id: request.workspace_id,
    project_id: request.project_id,
    requested_by: actor.id,
    actor_role: actor.role,
    mode: request.mode,
    domains,
  }, db)

  try {
    const snapshot = captureRebuildInputSnapshot({ ...request, domains }, db)
    const candidate = createRebuildCandidate({
      report_id,
      workspace_id: request.workspace_id,
      project_id: request.project_id,
      domains,
      input_snapshot_id: snapshot.input_snapshot_id,
    }, db)

    updateRebuildCandidateStatus(candidate.candidate_id, 'verifying', [], db)
    if (domains.includes('code')) backfillCodeFiles(db)
    if (domains.includes('fts') || domains.includes('l1') || domains.includes('code')) warnings.push(...rebuildFts(db))

    await request.on_before_promote?.()

    const parity = runRebuildParityChecks({ ...request, domains }, db)
    const validated = validateRebuildInputSnapshot(snapshot.input_snapshot_id, db)
    const disposition = finishRebuildCandidate({
      candidate_id: candidate.candidate_id,
      snapshot_status: validated.status,
      parity,
    }, db)

    if (validated.status !== 'current') {
      errors.push({ code: 'stale_snapshot', message: validated.stale_reason ?? 'snapshot is stale' })
    }
    for (const failed of parity.filter(check => check.status === 'fail')) {
      errors.push({ code: 'parity_failed', check: failed.name, details: failed.details ?? null })
    }

    const status = errors.length > 0 ? 'failed' : 'completed'
    const finalCounts = planRagRebuildScope({ ...request, domains }, db).counts
    finishRebuildReport({
      report_id,
      status,
      candidate_id: candidate.candidate_id,
      candidate_disposition: disposition.disposition,
      input_snapshot_id: snapshot.input_snapshot_id,
      summary: finalCounts,
      parity,
      warnings,
      errors: redactRagDetails(errors),
    }, db)

    return {
      report_id,
      status,
      mode: request.mode,
      scope: { workspace_id: request.workspace_id, project_id: request.project_id, domains },
      candidate: {
        candidate_id: candidate.candidate_id,
        status: disposition.status,
        disposition: disposition.disposition,
        input_snapshot_id: snapshot.input_snapshot_id,
        input_snapshot_status: validated.status,
        served_state_unchanged: disposition.disposition !== 'promoted',
      },
      counts: finalCounts,
      parity,
      warnings,
      errors,
      artifact_path: null,
    }
  } catch (err) {
    errors.push({ code: 'rebuild_failed', message: (err as Error).message })
    finishRebuildReport({
      report_id,
      status: 'failed',
      candidate_disposition: 'none',
      summary: planned.counts,
      parity: [],
      warnings,
      errors,
    }, db)
    return {
      report_id,
      status: 'failed',
      mode: request.mode,
      scope: { workspace_id: request.workspace_id, project_id: request.project_id, domains },
      candidate: null,
      counts: planned.counts,
      parity: [],
      warnings,
      errors,
      artifact_path: null,
    }
  }
}
