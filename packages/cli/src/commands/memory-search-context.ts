import type { Db } from 'fulcrum-agent-core'

export interface MemorySearchContextCommandInput {
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

export async function executeMemorySearchContextCommand(input: MemorySearchContextCommandInput, db?: Db): Promise<unknown> {
  const { searchContext } = await import('fulcrum-memory')
  return searchContext(input, db)
}
