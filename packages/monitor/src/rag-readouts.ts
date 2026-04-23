import { getDb } from 'fulcrum-agent-core'

function parseJsonColumn(value: unknown, fallback: unknown): unknown {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function readRagEvalRuns(
  ws: string,
  proj: string,
  limit: number,
  offset: number,
  redact: <T>(value: T) => T,
): { data: unknown[]; total: number } {
  const db = getDb()
  const total = (db.prepare(`
    SELECT COUNT(*) AS n
      FROM rag_eval_runs
     WHERE workspace_id = ?
       AND project_id = ?
  `).get(ws, proj) as { n: number }).n
  const rows = db.prepare(`
    SELECT eval_run_id, workspace_id, project_id, suite, status, trigger_source,
           trigger_scope, gate_required, started_at, finished_at, results
      FROM rag_eval_runs
     WHERE workspace_id = ?
       AND project_id = ?
     ORDER BY COALESCE(finished_at, started_at) DESC, eval_run_id DESC
     LIMIT ? OFFSET ?
  `).all(ws, proj, limit, offset) as Array<Record<string, unknown>>
  return {
    total,
    data: rows.map(row => redact({
      ...row,
      gate_required: Boolean(row['gate_required']),
      results: parseJsonColumn(row['results'], {}),
    })),
  }
}

export function readRagDegradedDomains(
  ws: string,
  proj: string,
  limit: number,
  offset: number,
  redact: <T>(value: T) => T,
): { data: unknown[]; total: number } {
  const db = getDb()
  const total = (db.prepare(`
    SELECT COUNT(*) AS n
      FROM rag_coverage_records
     WHERE workspace_id = ?
       AND project_id = ?
       AND status != 'current'
  `).get(ws, proj) as { n: number }).n
  const data = db.prepare(`
    SELECT coverage_id, source_domain, source_id, derived_domain, status,
           failure_code, failure_message, freshness_checked_at, updated_at
      FROM rag_coverage_records
     WHERE workspace_id = ?
       AND project_id = ?
       AND status != 'current'
     ORDER BY updated_at DESC, coverage_id DESC
     LIMIT ? OFFSET ?
  `).all(ws, proj, limit, offset)
  return { data: redact(data), total }
}

export function readRagJobs(
  ws: string,
  proj: string,
  limit: number,
  offset: number,
  redact: <T>(value: T) => T,
): { data: unknown[]; total: number } {
  const db = getDb()
  const total = (db.prepare(`
    SELECT COUNT(*) AS n
      FROM embedding_jobs
     WHERE workspace_id = ?
       AND project_id = ?
  `).get(ws, proj) as { n: number }).n
  const rows = db.prepare(`
    SELECT job_id, workspace_id, project_id, source_domain, status,
           requested_provider, requested_model, requested_device, dimensions,
           started_at, finished_at, summary
      FROM embedding_jobs
     WHERE workspace_id = ?
       AND project_id = ?
     ORDER BY COALESCE(finished_at, started_at) DESC, job_id DESC
     LIMIT ? OFFSET ?
  `).all(ws, proj, limit, offset) as Array<Record<string, unknown>>
  return {
    total,
    data: rows.map(row => redact({
      ...row,
      summary: parseJsonColumn(row['summary'], {}),
    })),
  }
}

export function readRagQueryTraces(
  ws: string,
  proj: string,
  limit: number,
  offset: number,
  redact: <T>(value: T) => T,
): { data: unknown[]; total: number } {
  const db = getDb()
  const total = (db.prepare(`
    SELECT COUNT(*) AS n
      FROM rag_query_traces
     WHERE workspace_id = ?
       AND project_id = ?
  `).get(ws, proj) as { n: number }).n
  const rows = db.prepare(`
    SELECT query_trace_id, workspace_id, project_id, query_hash, stages,
           fusion, rerank, runtime_truth, freshness, provenance,
           redaction_summary, created_at
      FROM rag_query_traces
     WHERE workspace_id = ?
       AND project_id = ?
     ORDER BY created_at DESC, query_trace_id DESC
     LIMIT ? OFFSET ?
  `).all(ws, proj, limit, offset) as Array<Record<string, unknown>>
  return {
    total,
    data: rows.map(row => redact({
      ...row,
      stages: parseJsonColumn(row['stages'], []),
      fusion: parseJsonColumn(row['fusion'], {}),
      rerank: parseJsonColumn(row['rerank'], {}),
      runtime_truth: parseJsonColumn(row['runtime_truth'], {}),
      freshness: parseJsonColumn(row['freshness'], {}),
      provenance: parseJsonColumn(row['provenance'], {}),
      redaction_summary: parseJsonColumn(row['redaction_summary'], {}),
    })),
  }
}
