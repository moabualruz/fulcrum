export type RagProvenanceClass = 'raw-backed' | 'curated-backed' | 'code-backed' | 'legacy-unbacked' | 'generated'

export interface RagRecallExplanation {
  result_id: string
  result_type: 'memory' | 'code_chunk'
  stage_ranks: Record<string, number | null>
  stage_scores: Record<string, number | null>
  runtime: {
    provider: string | null
    model: string | null
    requested_device: string | null
    actual_device: string | null
    fallback_reason: string | null
    latency_ms: number | null
  }
  trust: {
    provenance_class: RagProvenanceClass
    confidence: number | null
    freshness: number | null
    supersession: string | null
  }
  sources: Array<Record<string, unknown>>
}

export function emptyExplanation(result_id: string, result_type: 'memory' | 'code_chunk'): RagRecallExplanation {
  return {
    result_id,
    result_type,
    stage_ranks: {},
    stage_scores: {},
    runtime: {
      provider: null,
      model: null,
      requested_device: null,
      actual_device: null,
      fallback_reason: null,
      latency_ms: null,
    },
    trust: {
      provenance_class: result_type === 'code_chunk' ? 'code-backed' : 'legacy-unbacked',
      confidence: null,
      freshness: null,
      supersession: null,
    },
    sources: [],
  }
}

