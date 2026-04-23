import type { ContextResultType } from 'fulcrum-agent-core'

export type TypedContextResultType = ContextResultType

export type ContextFreshness = 'current' | 'stale' | 'failed' | 'unknown'

export interface StageContribution {
  stage: string
  rank: number
  score: number
}

export interface ContextSourceReference {
  source_id?: string
  file_path?: string
  path_fingerprint?: string
  line_start?: number
  line_end?: number
  symbol_path?: string
  task_id?: string
  run_id?: string
  graph_id?: string
  legacy_class?: string
}

export interface TypedContextResult {
  type: TypedContextResultType
  rank: number
  score: number
  title: string
  snippet: string
  source_ref: ContextSourceReference
  provenance_class:
    | 'raw_backed'
    | 'curated_backed'
    | 'code_backed'
    | 'graph_backed'
    | 'task_backed'
    | 'legacy_unbacked'
  freshness: ContextFreshness
  stage_contributions: StageContribution[]
  explanation_status: 'complete' | 'partial' | 'unavailable'
}
