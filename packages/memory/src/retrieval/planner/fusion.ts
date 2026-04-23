export function boundedRankScore(rank: number, weight = 1.2, offset = 1): number {
  if (!Number.isFinite(rank) || rank <= 0) return 0
  return weight / (rank + offset)
}

export function sumStageScores(stageScores: Record<string, number>): number {
  return Object.values(stageScores).reduce((sum, score) => sum + score, 0)
}

export function rankCandidates<T>(
  candidates: T[],
  options: {
    limit: number
    score: (candidate: T) => number
    tieBreaker: (candidate: T) => string
  },
): Array<{ candidate: T; score: number }> {
  return candidates
    .map(candidate => ({ candidate, score: options.score(candidate) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || options.tieBreaker(a.candidate).localeCompare(options.tieBreaker(b.candidate)))
    .slice(0, options.limit)
}
