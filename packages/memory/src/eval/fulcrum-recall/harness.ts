// PR 14 Task 5.1 — Fulcrum-specific code-change-memory recall eval harness.
//
// Gate 4 ADR: corpus seeded from memory_recall_events; synthetic seed bootstraps
// until real dogfood data accumulates. Metrics: R@5, R@10, MRR, nDCG@10, latency_p95.

import { readFileSync } from 'node:fs'

export interface EvalCorpusEntry {
  query: string
  expected_ids: string[]
  scope: 'session' | 'project' | 'workspace' | 'global'
  kind?: string
}

/** Retriever under test: given query + scope + expected_ids, return ordered result ids. */
export type EvalRetriever = (
  query: string,
  scope: string,
  expectedIds: string[]
) => Promise<string[]>

export interface KindMetrics {
  r_at_5: number
  r_at_10: number
  mrr: number
  ndcg_at_10: number
  count: number
}

export interface FulcrumEvalResult {
  r_at_5: number
  r_at_10: number
  mrr: number
  ndcg_at_10: number
  latency_p95: number
  total_queries: number
  per_kind: Record<string, KindMetrics>
}

// ── Metric helpers ────────────────────────────────────────────────────────────

export function computeMrr(retrieved: string[][], expected: string[][]): number {
  if (retrieved.length === 0) return 0
  let total = 0
  for (let i = 0; i < retrieved.length; i++) {
    const hits = new Set(expected[i])
    const r = retrieved[i]
    let rr = 0
    for (let j = 0; j < r.length; j++) {
      if (hits.has(r[j])) { rr = 1 / (j + 1); break }
    }
    total += rr
  }
  return total / retrieved.length
}

export function computeNdcg(retrieved: string[][], expected: string[][], k: number): number {
  if (retrieved.length === 0) return 0
  let total = 0
  for (let i = 0; i < retrieved.length; i++) {
    const hits = new Set(expected[i])
    const r = retrieved[i].slice(0, k)
    // DCG
    let dcg = 0
    for (let j = 0; j < r.length; j++) {
      if (hits.has(r[j])) dcg += 1 / Math.log2(j + 2)
    }
    // ideal DCG: all hits at the top
    let idcg = 0
    const idealHits = Math.min(hits.size, k)
    for (let j = 0; j < idealHits; j++) idcg += 1 / Math.log2(j + 2)
    total += idcg > 0 ? dcg / idcg : 0
  }
  return total / retrieved.length
}

function recallAtK(retrieved: string[], expected: string[], k: number): number {
  const hits = new Set(expected)
  return retrieved.slice(0, k).some(id => hits.has(id)) ? 1 : 0
}

function p95(latencies: number[]): number {
  if (latencies.length === 0) return 0
  const sorted = [...latencies].sort((a, b) => a - b)
  const idx = Math.ceil(sorted.length * 0.95) - 1
  return sorted[Math.max(0, idx)]
}

// ── Main harness ──────────────────────────────────────────────────────────────

export async function runFulcrumEval(
  corpus: EvalCorpusEntry[],
  retriever: EvalRetriever
): Promise<FulcrumEvalResult> {
  const allRetrieved: string[][] = []
  const allExpected: string[][] = []
  const latencies: number[] = []
  const byKind: Record<string, { retrieved: string[][]; expected: string[][] }> = {}

  for (const entry of corpus) {
    const t0 = Date.now()
    const results = await retriever(entry.query, entry.scope, entry.expected_ids)
    latencies.push(Date.now() - t0)

    allRetrieved.push(results)
    allExpected.push(entry.expected_ids)

    const kind = entry.kind ?? 'unknown'
    if (!byKind[kind]) byKind[kind] = { retrieved: [], expected: [] }
    byKind[kind].retrieved.push(results)
    byKind[kind].expected.push(entry.expected_ids)
  }

  const per_kind: Record<string, KindMetrics> = {}
  for (const [kind, { retrieved, expected }] of Object.entries(byKind)) {
    const rAt5 = retrieved.reduce((sum, r, i) => sum + recallAtK(r, expected[i], 5), 0) / retrieved.length
    const rAt10 = retrieved.reduce((sum, r, i) => sum + recallAtK(r, expected[i], 10), 0) / retrieved.length
    per_kind[kind] = {
      r_at_5: rAt5,
      r_at_10: rAt10,
      mrr: computeMrr(retrieved, expected),
      ndcg_at_10: computeNdcg(retrieved, expected, 10),
      count: retrieved.length,
    }
  }

  const r_at_5 = allRetrieved.reduce((sum, r, i) => sum + recallAtK(r, allExpected[i], 5), 0) / (allRetrieved.length || 1)
  const r_at_10 = allRetrieved.reduce((sum, r, i) => sum + recallAtK(r, allExpected[i], 10), 0) / (allRetrieved.length || 1)

  return {
    r_at_5,
    r_at_10,
    mrr: computeMrr(allRetrieved, allExpected),
    ndcg_at_10: computeNdcg(allRetrieved, allExpected, 10),
    latency_p95: p95(latencies),
    total_queries: corpus.length,
    per_kind,
  }
}

/** Load corpus from a JSON file and run eval. */
export async function runFulcrumEvalFromFile(
  corpusPath: string,
  retriever: EvalRetriever
): Promise<FulcrumEvalResult> {
  const corpus: EvalCorpusEntry[] = JSON.parse(readFileSync(corpusPath, 'utf8'))
  return runFulcrumEval(corpus, retriever)
}
