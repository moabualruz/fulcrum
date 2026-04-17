// License: MIT (Copyright (c) 2025 Peter Steinberger)
//
// v2a PR 1 Task 7 — Maximal Marginal Relevance (MMR) re-ranking.
// Balances relevance with diversity by iteratively selecting items that
// maximize: λ * relevance - (1-λ) * max_similarity_to_selected.
// See Carbonell & Goldstein, "The Use of MMR, Diversity-Based Reranking" (1998).
//
// to keep this module dependency-free (one tiny pure helper).

export type MMRItem = {
  id: string
  score: number
  content: string
}

export type MMRConfig = {
  /** Enable/disable MMR re-ranking. Default: false (opt-in) */
  enabled: boolean
  /** Lambda: 0 = max diversity, 1 = max relevance. Default: 0.7 */
  lambda: number
}

export const DEFAULT_MMR_CONFIG: MMRConfig = {
  enabled: false,
  lambda: 0.7,
}

function normalizeLowercaseStringOrEmpty(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.toLowerCase()
}

const CJK_RE = /[\u3040-\u309f\u30a0-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\u1100-\u11ff]/

export function tokenize(text: string): Set<string> {
  const lower = normalizeLowercaseStringOrEmpty(text)
  const ascii = lower.match(/[a-z0-9_]+/g) ?? []

  const chars = Array.from(lower)
  const cjkData: { char: string; index: number }[] = []
  for (let i = 0; i < chars.length; i++) {
    if (CJK_RE.test(chars[i]!)) cjkData.push({ char: chars[i]!, index: i })
  }

  const bigrams: string[] = []
  for (let i = 0; i < cjkData.length - 1; i++) {
    if (cjkData[i + 1]!.index === cjkData[i]!.index + 1) {
      bigrams.push(cjkData[i]!.char + cjkData[i + 1]!.char)
    }
  }

  const unigrams = cjkData.map(d => d.char)
  return new Set([...ascii, ...bigrams, ...unigrams])
}

export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1
  if (setA.size === 0 || setB.size === 0) return 0
  let intersectionSize = 0
  const smaller = setA.size <= setB.size ? setA : setB
  const larger = setA.size <= setB.size ? setB : setA
  for (const token of smaller) if (larger.has(token)) intersectionSize++
  const unionSize = setA.size + setB.size - intersectionSize
  return unionSize === 0 ? 0 : intersectionSize / unionSize
}

export function textSimilarity(contentA: string, contentB: string): number {
  return jaccardSimilarity(tokenize(contentA), tokenize(contentB))
}

function maxSimilarityToSelected(
  item: MMRItem,
  selectedItems: MMRItem[],
  tokenCache: Map<string, Set<string>>,
): number {
  if (selectedItems.length === 0) return 0
  let maxSim = 0
  const itemTokens = tokenCache.get(item.id) ?? tokenize(item.content)
  for (const selected of selectedItems) {
    const selectedTokens = tokenCache.get(selected.id) ?? tokenize(selected.content)
    const sim = jaccardSimilarity(itemTokens, selectedTokens)
    if (sim > maxSim) maxSim = sim
  }
  return maxSim
}

export function computeMMRScore(relevance: number, maxSimilarity: number, lambda: number): number {
  return lambda * relevance - (1 - lambda) * maxSimilarity
}

export function mmrRerank<T extends MMRItem>(items: T[], config: Partial<MMRConfig> = {}): T[] {
  const { enabled = DEFAULT_MMR_CONFIG.enabled, lambda = DEFAULT_MMR_CONFIG.lambda } = config
  if (!enabled || items.length <= 1) return [...items]

  const clampedLambda = Math.max(0, Math.min(1, lambda))
  if (clampedLambda === 1) return [...items].sort((a, b) => b.score - a.score)

  const tokenCache = new Map<string, Set<string>>()
  for (const item of items) tokenCache.set(item.id, tokenize(item.content))

  const maxScore = Math.max(...items.map(i => i.score))
  const minScore = Math.min(...items.map(i => i.score))
  const scoreRange = maxScore - minScore
  const normalizeScore = (score: number): number => scoreRange === 0 ? 1 : (score - minScore) / scoreRange

  const selected: T[] = []
  const remaining = new Set(items)

  while (remaining.size > 0) {
    let bestItem: T | null = null
    let bestMMRScore = -Infinity
    for (const candidate of remaining) {
      const normalizedRelevance = normalizeScore(candidate.score)
      const maxSim = maxSimilarityToSelected(candidate, selected, tokenCache)
      const mmrScore = computeMMRScore(normalizedRelevance, maxSim, clampedLambda)
      if (
        mmrScore > bestMMRScore ||
        (mmrScore === bestMMRScore && candidate.score > (bestItem?.score ?? -Infinity))
      ) {
        bestMMRScore = mmrScore
        bestItem = candidate
      }
    }
    if (bestItem) {
      selected.push(bestItem)
      remaining.delete(bestItem)
    } else {
      break
    }
  }

  return selected
}

export function applyMMRToHybridResults<
  T extends { score: number; snippet: string; path: string; startLine: number },
>(results: T[], config: Partial<MMRConfig> = {}): T[] {
  if (results.length === 0) return results
  const itemById = new Map<string, T>()
  const mmrItems: MMRItem[] = results.map((r, index) => {
    const id = `${r.path}:${r.startLine}:${index}`
    itemById.set(id, r)
    return { id, score: r.score, content: r.snippet }
  })
  const reranked = mmrRerank(mmrItems, config)
  return reranked.map(item => itemById.get(item.id)!)
}
