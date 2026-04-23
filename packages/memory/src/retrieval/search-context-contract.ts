import type { ContextPack } from './context-pack.js'
import type { GraphContributionDetail } from './query-trace.js'
import type { TypedContextResult } from './context-types.js'

export interface SearchContextInput {
  query: string
  workspace_id: string
  project_id: string
  limit?: number
  context_budget_tokens?: number
  explain?: boolean
  persist?: boolean
  include_graph?: boolean
  graph_mode?: 'local' | 'global_summary' | 'drift'
  graph_depth?: number
}

export interface SearchContextResponse {
  query_trace_id: string
  results: TypedContextResult[]
  skipped_stages: Array<{ stage: string; reason: string }>
  graph_contributions: GraphContributionDetail[]
  context_pack?: ContextPack
}
