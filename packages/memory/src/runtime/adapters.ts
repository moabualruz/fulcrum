import { redactRagDetails, redactRoadmapArtifact } from '../setup/rag-redaction.js'
import type { RagRuntimeTruth } from 'fulcrum-agent-core'

export type RuntimeAdapterKind = 'vector_store' | 'graph_store' | 'code_indexer' | 'model_runtime'
export type RuntimeAdapterAvailabilityStatus = 'available' | 'disabled' | 'failed'
export type RuntimeAdapterScope = 'local_baseline' | 'optional_candidate' | 'out_of_scope'
export type RuntimeAdapterBaselineImpact = 'none' | 'read_only' | 'degraded' | 'blocking'

export interface RuntimeAdapterAvailability {
  status: RuntimeAdapterAvailabilityStatus
  scope: RuntimeAdapterScope
  local_baseline_impact: RuntimeAdapterBaselineImpact
  adapter_kind?: RuntimeAdapterKind
  adapter_name?: string
  reason?: string
  details?: Record<string, unknown>
}

export interface RuntimeAdapterBase {
  kind: RuntimeAdapterKind
  name: string
  optional: boolean
  description?: string
  availability: () => RuntimeAdapterAvailability | Promise<RuntimeAdapterAvailability>
}

export interface RuntimeScopeInput {
  workspace_id: string
  project_id: string
}

export interface RuntimeVectorRecord {
  id: string
  vector: Float32Array
  metadata?: Record<string, unknown>
}

export interface RuntimeVectorUpsertInput extends RuntimeScopeInput {
  records: RuntimeVectorRecord[]
  namespace?: string
}

export interface RuntimeVectorUpsertResult {
  written: number
  skipped: number
  failures?: Array<{ id?: string; reason: string }>
}

export interface RuntimeVectorQueryInput extends RuntimeScopeInput {
  vector: Float32Array
  limit: number
  namespace?: string
  filter?: Record<string, unknown>
}

export interface RuntimeVectorQueryHit {
  id: string
  score: number
  metadata?: Record<string, unknown>
}

export interface RuntimeVectorDeleteInput extends RuntimeScopeInput {
  ids: string[]
  namespace?: string
}

export interface RuntimeVectorDeleteResult {
  deleted: number
}

export interface VectorStoreAdapter extends RuntimeAdapterBase {
  kind: 'vector_store'
  upsert: (input: RuntimeVectorUpsertInput) => Promise<RuntimeVectorUpsertResult>
  query: (input: RuntimeVectorQueryInput) => Promise<RuntimeVectorQueryHit[]>
  delete?: (input: RuntimeVectorDeleteInput) => Promise<RuntimeVectorDeleteResult>
}

export interface RuntimeGraphEntity {
  entity_id: string
  entity_type?: string
  name?: string
  properties?: Record<string, unknown>
}

export interface RuntimeGraphEdge {
  edge_id?: string
  source_id: string
  target_id: string
  relation: string
  properties?: Record<string, unknown>
}

export interface RuntimeGraphUpsertInput extends RuntimeScopeInput {
  entities: RuntimeGraphEntity[]
  edges: RuntimeGraphEdge[]
}

export interface RuntimeGraphUpsertResult {
  entities_written: number
  edges_written: number
  failures?: Array<{ id?: string; reason: string }>
}

export interface RuntimeGraphExpandInput extends RuntimeScopeInput {
  seed_entity_ids: string[]
  max_hops?: number
  limit?: number
}

export interface RuntimeGraphExpandResult {
  entities: RuntimeGraphEntity[]
  edges: RuntimeGraphEdge[]
}

export interface GraphStoreAdapter extends RuntimeAdapterBase {
  kind: 'graph_store'
  upsertEntities: (input: RuntimeGraphUpsertInput) => Promise<RuntimeGraphUpsertResult>
  expand: (input: RuntimeGraphExpandInput) => Promise<RuntimeGraphExpandResult>
}

export interface RuntimeCodeIndexInput extends RuntimeScopeInput {
  root_path?: string
  include_globs?: string[]
  exclude_globs?: string[]
  force?: boolean
}

export interface RuntimeCodeIndexResult {
  files_seen: number
  chunks_written: number
  skipped: number
  failures: Array<{ file_path?: string; reason: string }>
}

export interface CodeIndexerAdapter extends RuntimeAdapterBase {
  kind: 'code_indexer'
  indexProject: (input: RuntimeCodeIndexInput) => Promise<RuntimeCodeIndexResult>
}

export interface RuntimeModelEmbedInput {
  texts: string[]
  dimensions?: number
  purpose?: 'memory' | 'code' | 'query'
}

export interface RuntimeModelEmbedResult {
  vectors: Float32Array[]
  dimensions: number
  runtime_truth: Partial<RagRuntimeTruth['actual']> & Record<string, unknown>
}

export interface RuntimeModelRerankInput {
  query: string
  candidates: Array<{ id: string; text: string; metadata?: Record<string, unknown> }>
  limit?: number
}

export interface RuntimeModelRerankResult {
  id: string
  score: number
}

export interface ModelRuntimeAdapter extends RuntimeAdapterBase {
  kind: 'model_runtime'
  embed: (input: RuntimeModelEmbedInput) => Promise<RuntimeModelEmbedResult>
  rerank?: (input: RuntimeModelRerankInput) => Promise<RuntimeModelRerankResult[]>
}

export type RuntimeAdapter = VectorStoreAdapter | GraphStoreAdapter | CodeIndexerAdapter | ModelRuntimeAdapter

export interface DisabledRuntimeAdapterStatusInput {
  adapter_kind: RuntimeAdapterKind
  adapter_name?: string
  reason?: string
  details?: Record<string, unknown>
}

export function sanitizeRuntimeAdapterDescriptor<T>(value: T): T {
  return redactRoadmapArtifact(redactRagDetails(value))
}

export function disabledRuntimeAdapterStatus(input: DisabledRuntimeAdapterStatusInput): RuntimeAdapterAvailability {
  return sanitizeRuntimeAdapterDescriptor({
    status: 'disabled',
    scope: 'out_of_scope',
    local_baseline_impact: 'none',
    adapter_kind: input.adapter_kind,
    adapter_name: input.adapter_name,
    reason: input.reason ?? 'optional runtime adapter disabled by default',
    details: input.details ?? {},
  })
}
