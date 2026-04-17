// License: Apache-2.0
//
// v2a PR 1 Task 7 — query-intent classifier. PR 2's runStagedSearch routes
// retrievers based on the detected intent (definition queries skip embedding
// rerank, usage queries widen diversification, etc.).

export interface SearchIntent {
  type: 'DEFINITION' | 'FLOW' | 'USAGE' | 'ARCHITECTURE' | 'GENERAL'
  filters?: {
    definitionsOnly?: boolean
    usagesOnly?: boolean
  }
  mode?: 'orchestration_first' | 'show_examples' | 'group_by_role'
}

export function detectIntent(query: string): SearchIntent {
  const normalized = query.toLowerCase()

  if (/where is|what is|define/.test(normalized)) {
    return { type: 'DEFINITION', filters: { definitionsOnly: true } }
  }
  if (/how does|how is|implementation/.test(normalized)) {
    return { type: 'FLOW', mode: 'orchestration_first' }
  }
  if (/example|how to use|usage/.test(normalized)) {
    return { type: 'USAGE', mode: 'show_examples' }
  }
  if (/architecture|system|overview/.test(normalized)) {
    return { type: 'ARCHITECTURE', mode: 'group_by_role' }
  }
  return { type: 'GENERAL' }
}
