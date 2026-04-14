// packages/memory/src/extractors/semantic.ts
// Track 2 — LLM async extraction
// This module extracts semantic edges (ABOUT, CRITIQUES, RECOMMENDS, AVOIDS,
// CAUSES, PREVENTS) from memory content using an LLM.
// Full implementation deferred until LLM integration layer is available.

export interface SemanticEdge {
  fromId: string
  toEntityId: string
  edgeType: 'ABOUT' | 'CRITIQUES' | 'RECOMMENDS' | 'AVOIDS' | 'CAUSES' | 'PREVENTS'
  confidence: number
  source: 'llm'
}

/**
 * Extract semantic edges from memory content using an LLM.
 * Currently a stub — returns empty array until LLM layer is wired.
 */
export async function extractSemantic(
  _memoryId: string,
  _content: string,
  _workspaceId: string
): Promise<SemanticEdge[]> {
  // TODO: integrate with @fulcrum/core LLM client
  return []
}
