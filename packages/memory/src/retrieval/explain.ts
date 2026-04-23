import type { Db } from 'fulcrum-agent-core'
import { resolveEmbeddingRuntimeDevice } from '../l2/embed.js'

export type RagProvenanceClass = 'raw-backed' | 'curated-backed' | 'code-backed' | 'legacy-unbacked' | 'generated'

export type RagResultType = 'memory' | 'code_chunk'

export interface RagRuntimeExplanation {
  provider: string | null
  model: string | null
  requested_device: string | null
  actual_device: string | null
  fallback_reason: string | null
  latency_ms: number | null
}

export interface RagTrustExplanation {
  provenance_class: RagProvenanceClass
  confidence: number | null
  freshness: number | null
  supersession: string | null
}

export interface RagGraphContribution {
  contributed: boolean
  seed_entity_ids: string[]
  matched_entity_ids: string[]
  hops: number
  rank: number | null
}

export interface RagRecallExplanation {
  result_id: string
  result_type: RagResultType
  stage_ranks: Record<string, number | null>
  stage_scores: Record<string, number | null>
  runtime: RagRuntimeExplanation
  trust: RagTrustExplanation
  sources: Array<Record<string, unknown>>
  graph_contribution: RagGraphContribution | null
}

export interface MemoryExplainInput {
  result_id: string
  workspace_id: string
  project_id?: string | null
  sources: string[]
  l0_wikilinks: string[]
  vault_path: string | null
  confidence: number | null
  freshness: number | null
  superseded_by: string | null
  stage_ranks?: Record<string, number | null | undefined>
  stage_scores?: Record<string, number | null | undefined>
  runtime?: Partial<RagRuntimeExplanation>
  graph_contribution?: RagGraphContribution | null
}

export interface CodeExplainInput {
  chunk_id: string
  rel_path: string
  start_line: number
  end_line: number
  file_id: string | null
  code_index_state: string
  stage_ranks?: Record<string, number | null | undefined>
  stage_scores?: Record<string, number | null | undefined>
}

type RuntimeAware = {
  provider_name?: unknown
  provider?: unknown
  model_name?: unknown
  model?: unknown
  requested_device?: unknown
  requestedDevice?: unknown
  device?: unknown
}

const MEMORY_STAGE_KEYS = ['fts', 'vector', 'graph', 'reranker'] as const
const CODE_STAGE_KEYS = ['fts', 'symbol', 'recency'] as const

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function normalizeRecord(keys: readonly string[], input?: Record<string, number | null | undefined>): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const key of keys) out[key] = input?.[key] ?? null
  if (input) {
    for (const [key, value] of Object.entries(input)) out[key] = value ?? null
  }
  return out
}

export function runtimeExplanationFromProvider(provider: unknown, latency_ms: number | null): RagRuntimeExplanation {
  if (!provider || typeof provider !== 'object') {
    return {
      provider: null,
      model: null,
      requested_device: null,
      actual_device: null,
      fallback_reason: null,
      latency_ms,
    }
  }

  const runtime = provider as RuntimeAware
  const requested = asString(runtime.requested_device) ?? asString(runtime.requestedDevice) ?? asString(runtime.device) ?? 'auto'
  let actual: string | null = null
  let fallback: string | null = null
  try {
    const resolved = resolveEmbeddingRuntimeDevice(provider, requested)
    actual = resolved.actual_device
    fallback = resolved.fallback_reason
  } catch (err) {
    fallback = err instanceof Error ? err.message : String(err)
  }

  return {
    provider: asString(runtime.provider_name) ?? asString(runtime.provider),
    model: asString(runtime.model_name) ?? asString(runtime.model),
    requested_device: requested,
    actual_device: actual,
    fallback_reason: fallback,
    latency_ms,
  }
}

export function emptyExplanation(result_id: string, result_type: RagResultType): RagRecallExplanation {
  return {
    result_id,
    result_type,
    stage_ranks: normalizeRecord(result_type === 'memory' ? MEMORY_STAGE_KEYS : CODE_STAGE_KEYS),
    stage_scores: normalizeRecord(result_type === 'memory' ? [...MEMORY_STAGE_KEYS, 'fused'] : [...CODE_STAGE_KEYS, 'fused']),
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
    graph_contribution: null,
  }
}

function rawSourceIdFromLink(link: string): string {
  const last = link.split('/').pop() ?? link
  return last.endsWith('.md') ? last.slice(0, -3) : last
}

function rawPathFromLink(link: string): string {
  return link.endsWith('.md') ? link : `${link}.md`
}

function loadRawSources(db: Db, workspace_id: string, sourceIds: string[]): Map<string, { source_id: string; source_type: string; vault_path: string }> {
  const unique = [...new Set(sourceIds.filter(Boolean))]
  if (unique.length === 0) return new Map()
  const placeholders = unique.map(() => '?').join(',')
  try {
    const rows = db.prepare(
      `SELECT source_id, source_type, vault_path
       FROM l0_sources
       WHERE workspace_id = ? AND source_id IN (${placeholders})`,
    ).all(workspace_id, ...unique) as Array<{ source_id: string; source_type: string; vault_path: string }>
    return new Map(rows.map((row) => [row.source_id, row]))
  } catch {
    return new Map()
  }
}

export function buildMemoryExplanation(input: MemoryExplainInput, db: Db): RagRecallExplanation {
  const idsFromSources = input.sources
  const idsFromLinks = input.l0_wikilinks.map(rawSourceIdFromLink)
  const rawSourceIds = [...new Set([...idsFromSources, ...idsFromLinks])]
  const rawRows = loadRawSources(db, input.workspace_id, rawSourceIds)
  const sourceRows: Array<Record<string, unknown>> = []

  for (const sourceId of rawSourceIds) {
    const row = rawRows.get(sourceId)
    const link = input.l0_wikilinks.find((candidate) => rawSourceIdFromLink(candidate) === sourceId)
    sourceRows.push({
      kind: 'raw',
      source_id: sourceId,
      source_type: row?.source_type ?? null,
      path: row?.vault_path ?? (link ? rawPathFromLink(link) : null),
      missing: row ? false : true,
    })
  }

  const hasResolvedRawSource = sourceRows.some((source) => source['kind'] === 'raw' && source['missing'] === false)
  let provenanceClass: RagProvenanceClass = 'legacy-unbacked'
  if (hasResolvedRawSource) {
    provenanceClass = 'raw-backed'
  } else if (rawSourceIds.length === 0 && input.vault_path?.startsWith('curated/')) {
    provenanceClass = 'curated-backed'
    sourceRows.push({
      kind: 'curated',
      source_id: input.result_id,
      path: input.vault_path,
      missing: false,
    })
  }

  return {
    result_id: input.result_id,
    result_type: 'memory',
    stage_ranks: normalizeRecord(MEMORY_STAGE_KEYS, input.stage_ranks),
    stage_scores: normalizeRecord([...MEMORY_STAGE_KEYS, 'fused'], input.stage_scores),
    runtime: {
      provider: input.runtime?.provider ?? null,
      model: input.runtime?.model ?? null,
      requested_device: input.runtime?.requested_device ?? null,
      actual_device: input.runtime?.actual_device ?? null,
      fallback_reason: input.runtime?.fallback_reason ?? null,
      latency_ms: input.runtime?.latency_ms ?? null,
    },
    trust: {
      provenance_class: provenanceClass,
      confidence: input.confidence,
      freshness: input.freshness,
      supersession: input.superseded_by ? 'superseded' : 'current',
    },
    sources: sourceRows,
    graph_contribution: input.graph_contribution ?? null,
  }
}

export function buildCodeExplanation(input: CodeExplainInput): RagRecallExplanation {
  return {
    result_id: input.chunk_id,
    result_type: 'code_chunk',
    stage_ranks: normalizeRecord(CODE_STAGE_KEYS, input.stage_ranks),
    stage_scores: normalizeRecord([...CODE_STAGE_KEYS, 'fused'], input.stage_scores),
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
      source_id: input.chunk_id,
      path: input.rel_path,
      start_line: input.start_line,
      end_line: input.end_line,
      file_id: input.file_id,
      code_index_state: input.code_index_state,
    }],
    graph_contribution: null,
  }
}
