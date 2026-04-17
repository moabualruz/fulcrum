// v2b PR 12 Task 3.4 — Global pointer pre-filter for global-scope recall.
//
// Before fanning out to full FTS+vec+graph for global scope, probe the
// global_index.md pointer. If no pointer match, short-circuit with no_pointer_match.

export interface GlobalPointerLine {
  topic: string
  entities: string
  kind: string
  slug: string
  workspaceProject: string
  score: number
}

export interface PointerCheckResult {
  matched: boolean
  hits: GlobalPointerLine[]
  reason?: 'no_pointer_match'
}

export function checkGlobalPointer(
  lines: GlobalPointerLine[],
  query: string
): PointerCheckResult {
  if (lines.length === 0) return { matched: false, hits: [], reason: 'no_pointer_match' }

  const q = query.toLowerCase()
  const hits = lines.filter(l =>
    l.topic.toLowerCase().includes(q) || l.entities.toLowerCase().includes(q)
  )

  if (hits.length === 0) return { matched: false, hits: [], reason: 'no_pointer_match' }
  return { matched: true, hits }
}

export function parseGlobalPointerFile(content: string): GlobalPointerLine[] {
  return content
    .split('\n')
    .filter(l => l.includes(' | '))
    .map(l => {
      const parts = l.split(' | ')
      if (parts.length < 6) return null
      return {
        topic: parts[0]!.trim(),
        entities: parts[1]!.trim(),
        kind: parts[2]!.trim(),
        slug: parts[3]!.trim(),
        workspaceProject: parts[4]!.trim(),
        score: parseFloat(parts[5] ?? '0'),
      }
    })
    .filter((l): l is GlobalPointerLine => l !== null)
}
