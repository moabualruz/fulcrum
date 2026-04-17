// v2b PR 11 Task 2.0 — Dreaming light phase.
//
// Observation-only: scans short-term memory entries, computes B.4 utility
// scores, identifies dangling wikilinks. No promotion happens here.

// B.4 thresholds — unvalidated (Gate 3 ADR 2026-04-16-dreaming-thresholds.md)
export const THRESHOLDS = {
  minRecallCount: 3,
  minUniqueQueries: 2,
  minScore: 0.75,
}

// B.4 scoring weights
const ALPHA = 0.4  // recall_count weight
const BETA = 0.4   // unique_query_count weight
const GAMMA = 0.2  // max_recall_score weight

export interface MemoryRow {
  memory_id: string
  slug: string
  recall_count: number
  unique_query_count: number
  max_recall_score: number
  scope: string
}

export interface WikilinkRow {
  src_memory_id: string
  dst_slug: string
  dst_memory_id: string | null
}

export interface RecallEventRow {
  memory_id: string
  query: string
  score: number
  created_at: number
}

export interface LightPhaseInput {
  memories: MemoryRow[]
  wikilinks: WikilinkRow[]
  recallEvents: RecallEventRow[]
}

export interface ScoreEntry {
  memory_id: string
  score: number
  meetsThreshold: boolean
}

export interface LightPhaseResult {
  danglingIds: string[]
  scores: ScoreEntry[]
  report: string
}

export async function runLightPhase(input: LightPhaseInput): Promise<LightPhaseResult> {
  const { memories, wikilinks } = input

  // Build set of memory IDs that have at least one incoming resolved backlink
  const hasIncomingLink = new Set<string>()
  for (const wl of wikilinks) {
    if (wl.dst_memory_id != null) hasIncomingLink.add(wl.dst_memory_id)
  }

  const danglingIds: string[] = []
  const scores: ScoreEntry[] = []

  for (const mem of memories) {
    if (!hasIncomingLink.has(mem.memory_id)) danglingIds.push(mem.slug)

    const score = ALPHA * mem.recall_count + BETA * mem.unique_query_count + GAMMA * mem.max_recall_score
    scores.push({
      memory_id: mem.memory_id,
      score,
      meetsThreshold:
        mem.recall_count >= THRESHOLDS.minRecallCount &&
        mem.unique_query_count >= THRESHOLDS.minUniqueQueries &&
        score >= THRESHOLDS.minScore,
    })
  }

  const report = buildReport(danglingIds, scores)
  return { danglingIds, scores, report }
}

function buildReport(danglingIds: string[], scores: ScoreEntry[]): string {
  const lines: string[] = [
    '# Dreaming Light Phase Report',
    '',
    `## Dangling Links (${danglingIds.length})`,
    '',
  ]
  if (danglingIds.length === 0) {
    lines.push('_No dangling links detected._')
  } else {
    for (const slug of danglingIds) lines.push(`- ${slug}`)
  }
  lines.push('', `## Promotion Candidates (${scores.filter(s => s.meetsThreshold).length})`, '')
  for (const s of scores.filter(s => s.meetsThreshold)) {
    lines.push(`- ${s.memory_id} (score=${s.score.toFixed(3)})`)
  }
  return lines.join('\n')
}
