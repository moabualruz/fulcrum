// v2b PR 11 Task 2.3 — Dreaming deep phase: promotion + re-sanitize.
//
// Short-term entries clearing B.4 thresholds are re-sanitized via
// sanitizeOnWrite (security review finding #5) before being appended to host
// MEMORY.md / GEMINI.md. Promoted entries get embedded=1.

import { sanitizeOnWrite } from '../sanitize/index.js'

export interface DeepCandidateRow {
  memory_id: string
  slug: string
  content: string
  recall_count: number
  unique_query_count: number
  max_recall_score: number
  scope: string
}

export interface DeepPhaseSink {
  markEmbedded(memory_id: string): Promise<void>
  appendToHostFile(slug: string, content: string): Promise<void>
}

export interface DeepPhaseInput {
  candidates: DeepCandidateRow[]
}

export async function runDeepPhase(
  input: DeepPhaseInput,
  sink: DeepPhaseSink
): Promise<void> {
  for (const candidate of input.candidates) {
    // Re-sanitize per security review finding #5 — strip injections at promotion boundary.
    // If sanitization errors, skip this candidate entirely rather than appending empty/corrupt content.
    const result = sanitizeOnWrite(candidate.content)
    if (result.errored) continue

    await sink.appendToHostFile(candidate.slug, result.content)
    await sink.markEmbedded(candidate.memory_id)
  }
}
