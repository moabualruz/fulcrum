// packages/cli/src/commands/memory-recall.ts
//
// Memory v3 PR 5 unit 5.3 — `fulcrum memory recall` CLI + `recall_knowledge`
// MCP handler.
//
// Thin wrapper over runV3Search that keeps the operator surface stable:
//   * workspace_id / project_id default to CWD context (callers pass through).
//   * content truncated to max_chars (default 500) so JSON stdout stays compact.
//   * Every hit carries sources[] + l0_wikilinks[] so `fulcrum memory sources`
//     (PR 5.4) can render provenance without re-reading the row.
//
// PR 5.5 flipped `recall_memory` to delegate here by default; PR 9.5 retired
// the FULCRUM_MEMORY_V3 flag and removed the legacy fallback entirely — this
// handler is now the only recall path for both names.

import { runV3Search, type RagRecallExplanation, type V3RecallHit, type V3SearchInput } from 'fulcrum-memory'

export interface RecallKnowledgeInput {
  workspace_id: string
  project_id?: string | null
  query: string
  limit?: number
  offset?: number
  confidence_floor?: number
  graph_hops?: number
  include_superseded?: boolean
  max_chars?: number
  explain?: boolean
}

export interface RecallKnowledgeHit {
  memory_id: string
  title: string
  content: string
  confidence: number
  score: number
  sources: string[]
  l0_wikilinks: string[]
  retention_tier: string
  stage_ranks: V3RecallHit['stage_ranks']
  explanation?: RagRecallExplanation
}

export interface RecallKnowledgeResult {
  results: RecallKnowledgeHit[]
  reason?: 'no_match'
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n)
}

export async function recallKnowledge(input: RecallKnowledgeInput): Promise<RecallKnowledgeResult> {
  const maxChars = input.max_chars ?? 500
  const searchInput: V3SearchInput = {
    workspace_id: input.workspace_id,
    query: input.query,
  }
  if (input.project_id !== undefined) searchInput.project_id = input.project_id
  if (input.limit !== undefined) searchInput.limit = input.limit
  if (input.offset !== undefined) searchInput.offset = input.offset
  if (input.confidence_floor !== undefined) searchInput.confidence_floor = input.confidence_floor
  if (input.graph_hops !== undefined) searchInput.graph_hops = input.graph_hops
  if (input.include_superseded !== undefined) searchInput.include_superseded = input.include_superseded
  if (input.explain !== undefined) searchInput.explain = input.explain

  const hits = await runV3Search(searchInput)
  if (hits.length === 0) return { results: [], reason: 'no_match' }

  const results: RecallKnowledgeHit[] = hits.map((h) => {
    const result: RecallKnowledgeHit = {
      memory_id: h.memory_id,
      title: h.title,
      content: truncate(h.content, maxChars),
      confidence: h.confidence,
      score: h.score,
      sources: h.sources,
      l0_wikilinks: h.l0_wikilinks,
      retention_tier: h.retention_tier,
      stage_ranks: h.stage_ranks,
    }
    if (input.explain && h.explanation) result.explanation = h.explanation
    return result
  })
  return { results }
}
