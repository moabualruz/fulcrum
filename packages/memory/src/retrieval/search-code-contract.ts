import type { RagRecallExplanation } from './explain.js'

export interface SearchCodeInput {
  workspace_id: string
  project_id?: string
  text?: string
  symbol?: string
  lang?: string
  path?: string
  package?: string
  module?: string
  dependency?: string
  changed_files?: string[]
  scope?: 'session' | 'project' | 'workspace' | 'global'
  min_score?: number
  limit?: number
  caller_run_id?: string
  caller_role?: string
  explain?: boolean
  persist?: boolean
}

export interface SearchCodeStageContribution {
  stage: string
  rank: number
  score: number
}

export interface SearchCodeRuntimeTruth {
  provider: string | null
  model: string | null
  actual_provider: string | null
  actual_model: string | null
  requested_device: string | null
  actual_device: string | null
  dimensions: number | null
}

export interface SearchCodeResultRow {
  chunk_id: string
  rel_path: string
  start_line: number
  end_line: number
  line_start: number
  line_end: number
  symbol_path: string | null
  language: string | null
  content: string
  score: number
  project_id: string
  file_id: string | null
  code_index_state: 'current' | 'legacy' | 'orphaned'
  parse_status: 'parsed' | 'skipped' | 'failed'
  vector_status: 'pending' | 'current' | 'stale' | 'failed' | 'skipped' | 'legacy'
  freshness: 'current' | 'stale' | 'failed' | 'unknown'
  indexed_at: string
  stage_scores: Record<string, number>
  stage_contributions: SearchCodeStageContribution[]
  runtime_truth: SearchCodeRuntimeTruth | null
  explanation?: RagRecallExplanation
}

export interface SearchCodeResponse {
  query_trace_id?: string
  results: SearchCodeResultRow[]
  reason?: 'no_match' | 'below_floor'
  skipped_stages?: Array<{ stage: string; reason: string }>
}
