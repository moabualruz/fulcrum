import { newId } from 'fulcrum-agent-core'
import type { TypedContextResult } from './context-types.js'

export interface TokenEstimator {
  name: string
  model?: string
  count(text: string): number
  truncate(text: string, maxTokens: number): string
}

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

export function packContext(results: TypedContextResult[], budgetTokens: number, estimator: TokenEstimator = heuristicTokenEstimator): ContextPack {
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

    let tokenCount = estimateContextTokens(result, estimator)
    let packedResult = result
    if (usedTokens + tokenCount > budgetTokens) {
      const remaining = budgetTokens - usedTokens
      const overhead = estimateContextTokens({ title: result.title, snippet: '' }, estimator)
      const snippetBudget = remaining - overhead
      if (snippetBudget <= 0) {
        truncatedResults += 1
        continue
      }
      const snippet = estimator.truncate(result.snippet, snippetBudget)
      packedResult = { ...result, snippet }
      tokenCount = estimateContextTokens(packedResult, estimator)
      if (!snippet || usedTokens + tokenCount > budgetTokens) {
        truncatedResults += 1
        continue
      }
      truncatedResults += 1
    }

    seenSources.add(sourceKey)
    packedResults.push(packedResult)
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

export function estimateContextTokens(result: Pick<TypedContextResult, 'title' | 'snippet'>, estimator: TokenEstimator = heuristicTokenEstimator): number {
  const text = serializeContextForBudget(result)
  if (!text) return 0
  return estimator.count(text)
}

function serializeContextForBudget(result: Pick<TypedContextResult, 'title' | 'snippet'>): string {
  return `${result.title}\n${result.snippet}`.trim()
}

export const heuristicTokenEstimator: TokenEstimator = {
  name: 'heuristic',
  count(text: string): number {
  const tokenLikePieces = text.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? []
  const charBudgetFloor = Math.ceil(text.length / 4)
  return Math.max(tokenLikePieces.length, charBudgetFloor)
  },
  truncate(text: string, maxTokens: number): string {
    if (maxTokens <= 0) return ''
    if (this.count(text) <= maxTokens) return text
    const pieces = text.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? []
    let out = ''
    for (const piece of pieces) {
      const next = out ? `${out}${/\s/.test(piece) ? '' : ' '}${piece}` : piece
      if (this.count(next) > maxTokens) break
      out = next
    }
    if (out) return out.trim()
    return text.slice(0, Math.max(0, maxTokens * 4)).trim()
  },
}
