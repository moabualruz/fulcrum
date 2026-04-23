import type { Db } from 'fulcrum-agent-core'

export type RagProvenanceClass = 'raw-backed' | 'curated-backed' | 'code-backed' | 'legacy-unbacked' | 'generated'
export type RagSourceKind = 'raw' | 'curated' | 'code' | 'legacy' | 'generated'
export type RagSourceStatus = 'resolved' | 'missing' | 'unresolved'

export interface RagRuntimeDetails {
  provider: string | null
  model: string | null
  requested_device: string | null
  actual_device: string | null
  fallback_reason: string | null
  latency_ms: number | null
}

export interface RagSourceReference {
  kind: RagSourceKind
  status: RagSourceStatus
  source_id?: string
  chunk_id?: string
  file_id?: string
  path?: string
  source_type?: string
  start_line?: number | null
  end_line?: number | null
  code_index_state?: string
}

export interface RagGraphContribution {
  affected: boolean
  seed_entity_ids: string[]
  reached_entity_ids: string[]
  matched_entity_ids: string[]
  hops: number
  rank: number | null
}

export interface RagRecallExplanation {
  result_id: string
  result_type: 'memory' | 'code_chunk'
  stage_ranks: Record<string, number | null>
  stage_scores: Record<string, number | null>
  runtime: RagRuntimeDetails
  trust: {
    provenance_class: RagProvenanceClass
    confidence: number | null
    freshness: number | null
    supersession: string | null
  }
  sources: RagSourceReference[]
  graph_contribution?: RagGraphContribution
}

export interface RecallExplainHit {
  memory_id: string
  confidence: number | null
  freshness?: number | null
  sources: string[]
  sources_via?: string[]
  l0_wikilinks: string[]
  superseded_by: string | null
  source?: string | null
  score: number
  stage_ranks: Record<string, number | undefined>
  stage_scores?: Record<string, number | undefined>
  graph_contribution?: RagGraphContribution
}

export interface CodeExplainHit {
  chunk_id: string
  rel_path: string
  start_line: number | null
  end_line: number | null
  score: number
  file_id?: string | null
  code_index_state?: string | null
  stage_ranks: Record<string, number | null>
  stage_scores: Record<string, number | null>
}

export function emptyExplanation(result_id: string, result_type: 'memory' | 'code_chunk'): RagRecallExplanation {
  return {
    result_id,
    result_type,
    stage_ranks: {},
    stage_scores: {},
    runtime: {
      provider: null,
      model: null,
      requested_device: null,
      actual_device: null,
      fallback_reason: null,
      latency_ms: null,
    },
    trust: {
      provenance_class: result_type === 'code_chunk' ? 'code-backed' : 'legacy-unbacked',
      confidence: null,
      freshness: null,
      supersession: null,
    },
    sources: [],
  }
}

function uniq<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function rankScore(rank: number | null | undefined): number | null {
  if (rank === null || rank === undefined) return null
  return 1 / (60 + rank)
}

function rawSourceIdFromPath(path: string): string | null {
  const parts = path.split('/').filter(Boolean)
  const tail = parts.at(-1)
  if (!tail) return null
  return tail.replace(/\.md$/, '')
}

function readRawRows(db: Db, workspace_id: string, sourceIds: string[]): Map<string, { source_type: string; vault_path: string }> {
  if (sourceIds.length === 0) return new Map()
  try {
    const placeholders = sourceIds.map(() => '?').join(',')
    const rows = db
      .prepare(
        `SELECT source_id, source_type, vault_path
         FROM l0_sources
         WHERE workspace_id = ? AND source_id IN (${placeholders})`,
      )
      .all(workspace_id, ...sourceIds) as Array<{ source_id: string; source_type: string; vault_path: string }>
    return new Map(rows.map((row) => [row.source_id, { source_type: row.source_type, vault_path: row.vault_path }]))
  } catch {
    return new Map()
  }
}

function readCuratedRows(db: Db, workspace_id: string, sourceIds: string[]): Map<string, { vault_path: string }> {
  if (sourceIds.length === 0) return new Map()
  try {
    const placeholders = sourceIds.map(() => '?').join(',')
    const rows = db
      .prepare(
        `SELECT memory_id, vault_path
         FROM memories
         WHERE workspace_id = ? AND memory_id IN (${placeholders}) AND schema_version >= 3`,
      )
      .all(workspace_id, ...sourceIds) as Array<{ memory_id: string; vault_path: string }>
    return new Map(rows.map((row) => [row.memory_id, { vault_path: row.vault_path }]))
  } catch {
    return new Map()
  }
}

function rawReferences(db: Db, workspace_id: string, hit: RecallExplainHit): RagSourceReference[] {
  const pathById = new Map<string, string>()
  for (const link of hit.l0_wikilinks) {
    const sourceId = rawSourceIdFromPath(link)
    if (sourceId) pathById.set(sourceId, link)
  }
  const ids = uniq([...hit.sources, ...pathById.keys()])
  const rawRows = readRawRows(db, workspace_id, ids)
  return ids.map((source_id) => {
    const row = rawRows.get(source_id)
    if (row) {
      return {
        kind: 'raw',
        source_id,
        path: row.vault_path,
        source_type: row.source_type,
        status: 'resolved',
      }
    }
    const ref: RagSourceReference = {
      kind: 'raw',
      source_id,
      status: 'missing',
    }
    const path = pathById.get(source_id)
    if (path) ref.path = path
    return ref
  })
}

function curatedReferences(db: Db, workspace_id: string, hit: RecallExplainHit): RagSourceReference[] {
  const ids = uniq(hit.sources_via ?? [])
  const rows = readCuratedRows(db, workspace_id, ids)
  return ids.map((source_id) => {
    const row = rows.get(source_id)
    return {
      kind: 'curated',
      source_id,
      path: row?.vault_path,
      status: row ? 'resolved' : 'missing',
    }
  })
}

function provenanceClass(
  result_type: 'memory' | 'code_chunk',
  hitSource: string | null | undefined,
  rawRefs: RagSourceReference[],
  curatedRefs: RagSourceReference[],
): RagProvenanceClass {
  if (result_type === 'code_chunk') return 'code-backed'
  if (hitSource === 'generated') return 'generated'
  if (rawRefs.length > 0) return 'raw-backed'
  if (curatedRefs.length > 0) return 'curated-backed'
  return 'legacy-unbacked'
}

function supersessionState(superseded_by: string | null | undefined): string {
  return superseded_by ? 'superseded' : 'current'
}

export function buildRecallExplanation(input: {
  db: Db
  workspace_id: string
  hit: RecallExplainHit
  runtime?: RagRuntimeDetails
}): RagRecallExplanation {
  const rawRefs = rawReferences(input.db, input.workspace_id, input.hit)
  const curatedRefs = curatedReferences(input.db, input.workspace_id, input.hit)
  const provenance_class = provenanceClass('memory', input.hit.source, rawRefs, curatedRefs)
  const ranks = input.hit.stage_ranks
  const scores = input.hit.stage_scores ?? {}
  const explanation: RagRecallExplanation = {
    result_id: input.hit.memory_id,
    result_type: 'memory',
    stage_ranks: {
      fts: ranks['fts'] ?? null,
      vector: ranks['vector'] ?? ranks['vec'] ?? null,
      graph: ranks['graph'] ?? null,
      reranker: ranks['reranker'] ?? null,
    },
    stage_scores: {
      fts: scores['fts'] ?? rankScore(ranks['fts']),
      vector: scores['vector'] ?? scores['vec'] ?? rankScore(ranks['vector'] ?? ranks['vec']),
      graph: scores['graph'] ?? rankScore(ranks['graph']),
      reranker: scores['reranker'] ?? rankScore(ranks['reranker']),
      fused: scores['fused'] ?? input.hit.score,
    },
    runtime: input.runtime ?? {
      provider: null,
      model: null,
      requested_device: null,
      actual_device: null,
      fallback_reason: null,
      latency_ms: null,
    },
    trust: {
      provenance_class,
      confidence: input.hit.confidence,
      freshness: input.hit.freshness ?? null,
      supersession: supersessionState(input.hit.superseded_by),
    },
    sources: [...rawRefs, ...curatedRefs],
  }
  if (input.hit.graph_contribution) {
    explanation.graph_contribution = input.hit.graph_contribution
  }
  return explanation
}

export function buildCodeSearchExplanation(row: CodeExplainHit): RagRecallExplanation {
  return {
    result_id: row.chunk_id,
    result_type: 'code_chunk',
    stage_ranks: row.stage_ranks,
    stage_scores: row.stage_scores,
    runtime: {
      provider: null,
      model: null,
      requested_device: null,
      actual_device: null,
      fallback_reason: null,
      latency_ms: null,
    },
    trust: {
      provenance_class: 'code-backed',
      confidence: null,
      freshness: null,
      supersession: 'current',
    },
    sources: [{
      kind: 'code',
      chunk_id: row.chunk_id,
      path: row.rel_path,
      start_line: row.start_line,
      end_line: row.end_line,
      file_id: row.file_id ?? undefined,
      code_index_state: row.code_index_state ?? undefined,
      status: 'resolved',
    }],
  }
}
