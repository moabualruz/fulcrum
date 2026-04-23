import { createHash } from 'crypto'
import { getDb, newId } from 'fulcrum-agent-core'
import type { Db } from 'fulcrum-agent-core'
import { pathFingerprintForRoadmap, redactRagDetails, redactRagText, redactRoadmapArtifact } from '../setup/rag-redaction.js'
import type { TypedContextResult } from './context-types.js'

export type QueryTraceStageStatus = 'ok' | 'skipped' | 'degraded' | 'failed'

export interface QueryTraceStage {
  name: string
  status: QueryTraceStageStatus
  candidate_count: number
  limit: number
  latency_ms: number
  reason?: string
  ranks?: Array<{ source_id: string; rank: number; score: number }>
  score_summary?: Record<string, number>
}

export interface GraphContributionDetail {
  mode: 'local' | 'global_summary' | 'drift'
  seed_count: number
  seed_ids: string[]
  expanded_entities: number
  expanded_edges: number
  contributed_result_ids: string[]
  changed_candidates: boolean
  changed_ranking: boolean
  changed_context_pack: boolean
}

export interface RagQueryTrace {
  query_trace_id: string
  workspace_id: string
  project_id: string
  query_hash: string
  stages: QueryTraceStage[]
  fusion: Record<string, unknown>
  rerank: Record<string, unknown>
  runtime_truth: Record<string, unknown>
  freshness: Record<string, unknown>
  provenance: Record<string, unknown>
  graph_contributions: GraphContributionDetail[]
  redaction_summary: {
    absolute_paths_redacted: boolean
    secrets_redacted: boolean
  }
}

export interface PersistRagQueryTraceInput {
  query_trace_id?: string
  workspace_id: string
  project_id: string
  query: string
  stages: QueryTraceStage[]
  fusion: Record<string, unknown>
  rerank?: Record<string, unknown>
  runtime_truth?: Record<string, unknown>
  freshness?: Record<string, unknown>
  provenance?: Record<string, unknown>
  graph_contributions?: GraphContributionDetail[]
}

export function createEmptyQueryTrace(input: {
  query_trace_id: string
  workspace_id: string
  project_id: string
  query_hash: string
}): RagQueryTrace {
  return {
    ...input,
    stages: [],
    fusion: {},
    rerank: {},
    runtime_truth: {},
    freshness: {},
    provenance: {},
    graph_contributions: [],
    redaction_summary: {
      absolute_paths_redacted: true,
      secrets_redacted: true,
    },
  }
}

export function hashQuery(query: string): string {
  return createHash('sha256').update(query).digest('hex')
}

export function redactQueryForTrace(query: string): string {
  return redactAbsolutePathsForTrace(redactRagText(query))
}

function redactAbsolutePathsForTrace(query: string): string {
  return query.replace(/(^|[\s=:,;([{'\"`])((?:\/|~\/)[^\s"'{}[\]),;]+)/g, (_match, prefix: string, path: string) => {
    return `${prefix}[REDACTED_PATH:${pathFingerprintForRoadmap(path)}]`
  })
}

function parseJson(value: unknown, fallback: unknown): unknown {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function readRagQueryTrace(
  input: { query_trace_id: string; workspace_id: string; project_id: string },
  db: Db = getDb(),
): RagQueryTrace | null {
  const row = db.prepare(`
    SELECT * FROM rag_query_traces
     WHERE query_trace_id = ?
       AND workspace_id = ?
       AND project_id = ?
  `).get(input.query_trace_id, input.workspace_id, input.project_id) as Record<string, unknown> | undefined
  if (!row) return null

  return {
    query_trace_id: row['query_trace_id'] as string,
    workspace_id: row['workspace_id'] as string,
    project_id: row['project_id'] as string,
    query_hash: row['query_hash'] as string,
    stages: parseJson(row['stages'], []) as QueryTraceStage[],
    fusion: parseJson(row['fusion'], {}) as Record<string, unknown>,
    rerank: parseJson(row['rerank'], {}) as Record<string, unknown>,
    runtime_truth: parseJson(row['runtime_truth'], {}) as Record<string, unknown>,
    freshness: parseJson(row['freshness'], {}) as Record<string, unknown>,
    provenance: parseJson(row['provenance'], {}) as Record<string, unknown>,
    graph_contributions: graphContributionsFromFusion(parseJson(row['fusion'], {}) as Record<string, unknown>),
    redaction_summary: parseJson(row['redaction_summary'], {
      absolute_paths_redacted: true,
      secrets_redacted: true,
    }) as RagQueryTrace['redaction_summary'],
  }
}

export function persistRagQueryTrace(
  input: PersistRagQueryTraceInput,
  db: Db = getDb(),
): string {
  const query_trace_id = input.query_trace_id ?? newId('rag_query_trace')
  const secretRedactedQuery = redactRagText(input.query)
  const pathRedactedQuery = redactAbsolutePathsForTrace(input.query)
  const traceQuery = redactAbsolutePathsForTrace(secretRedactedQuery)
  const fusion = {
    ...input.fusion,
    graph_contributions: input.graph_contributions ?? [],
  }
  const rawDetails = {
    stages: input.stages,
    fusion,
    rerank: input.rerank ?? {},
    runtime_truth: input.runtime_truth ?? { model_calls: 0, source: 'sqlite' },
    freshness: input.freshness ?? {},
    provenance: input.provenance ?? {},
  }
  const secretRedactedDetails = redactRagDetails(rawDetails)
  const pathRedactedDetails = redactRoadmapArtifact(secretRedactedDetails)
  const redactedDetails = pathRedactedDetails
  const redaction_summary = {
    absolute_paths_redacted: input.query !== pathRedactedQuery || JSON.stringify(secretRedactedDetails) !== JSON.stringify(pathRedactedDetails),
    secrets_redacted: input.query !== secretRedactedQuery || JSON.stringify(rawDetails) !== JSON.stringify(secretRedactedDetails),
  }

  db.prepare(`
    INSERT INTO rag_query_traces (
      query_trace_id, workspace_id, project_id, query_hash, query_redacted,
      stages, fusion, rerank, runtime_truth, freshness, provenance, redaction_summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    query_trace_id,
    input.workspace_id,
    input.project_id,
    hashQuery(input.query),
    traceQuery,
    JSON.stringify(redactedDetails.stages),
    JSON.stringify(redactedDetails.fusion),
    JSON.stringify(redactedDetails.rerank),
    JSON.stringify(redactedDetails.runtime_truth),
    JSON.stringify(redactedDetails.freshness),
    JSON.stringify(redactedDetails.provenance),
    JSON.stringify(redaction_summary),
  )

  return query_trace_id
}

function graphContributionsFromFusion(fusion: Record<string, unknown>): GraphContributionDetail[] {
  const raw = fusion['graph_contributions']
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is GraphContributionDetail => {
    if (!item || typeof item !== 'object') return false
    const record = item as Record<string, unknown>
    return record['mode'] === 'local' || record['mode'] === 'global_summary' || record['mode'] === 'drift'
  })
}

export function persistRagContextResults(
  input: {
    query_trace_id: string
    workspace_id: string
    project_id: string
    results: TypedContextResult[]
  },
  db: Db = getDb(),
): void {
  const stmt = db.prepare(`
    INSERT INTO rag_context_results (
      context_result_id, query_trace_id, workspace_id, project_id, result_type,
      rank, score, source_ref, stage_contributions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertMany = db.transaction((results: TypedContextResult[]) => {
    for (const result of results) {
      stmt.run(
        `${input.query_trace_id}:${result.rank}`,
        input.query_trace_id,
        input.workspace_id,
        input.project_id,
        result.type,
        result.rank,
        result.score,
        JSON.stringify(redactRoadmapArtifact(redactRagDetails(result.source_ref))),
        JSON.stringify(redactRagDetails(result.stage_contributions)),
      )
    }
  })
  insertMany(input.results)
}
