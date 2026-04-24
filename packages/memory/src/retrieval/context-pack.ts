import { newId } from 'fulcrum-agent-core'
import type { TypedContextResult } from './context-types.js'

export interface ContextPackBudget {
  budget_tokens: number
  used_tokens: number
}

export interface ContextPack {
  pack_id: string
  query_trace_id: string | null
  results: TypedContextResult[]
  budget: ContextPackBudget
  source_diversity: Record<string, number>
  deduplicated_results: number
  truncated_results: number
  created_at: string
}

export function packContext(results: TypedContextResult[], budgetTokens: number): ContextPack {
  const seenSources = new Set<string>()
  const packedResults: TypedContextResult[] = []
  const sourceDiversity: Record<string, number> = {}
  let deduplicatedResults = 0
  let truncatedResults = 0
  let usedTokens = 0

  for (const result of results) {
    const sourceKey = [
      result.type,
      result.source_ref.source_id ?? '',
      result.source_ref.file_path ?? '',
      result.source_ref.path_fingerprint ?? '',
      result.source_ref.task_id ?? '',
      result.source_ref.graph_id ?? '',
    ].join(':')
    if (seenSources.has(sourceKey)) {
      deduplicatedResults += 1
      continue
    }

    const tokenCount = estimateContextTokens(result)
    if (usedTokens + tokenCount > budgetTokens) {
      truncatedResults += 1
      continue
    }

    seenSources.add(sourceKey)
    packedResults.push(result)
    usedTokens += tokenCount
    sourceDiversity[result.type] = (sourceDiversity[result.type] ?? 0) + 1
  }

  return {
    pack_id: newId('context_pack'),
    query_trace_id: null,
    results: packedResults,
    budget: {
      budget_tokens: budgetTokens,
      used_tokens: usedTokens,
    },
    source_diversity: sourceDiversity,
    deduplicated_results: deduplicatedResults,
    truncated_results: truncatedResults,
    created_at: new Date().toISOString(),
  }
}

export function estimateContextTokens(result: Pick<TypedContextResult, 'title' | 'snippet'>): number {
  const text = `${result.title} ${result.snippet}`.trim()
  if (!text) return 0
  const tokenLikePieces = text.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? []
  const charBudgetFloor = Math.ceil(text.length / 4)
  return Math.max(tokenLikePieces.length, charBudgetFloor)
}
