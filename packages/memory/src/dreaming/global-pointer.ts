// v2b PR 12 Task 3.1 — Global pointer collection writer.
//
// Writes {globalDataDir()}/memory/dreaming/global_index.md
// Format per Part 06 §8.3: topic | entities | kind | memory_slug | workspace_id/project_id | score
// Max 2000 lines; oldest + lowest-utility pruned.

const MAX_LINES = 2000

export interface DurableEntry {
  memory_id: string
  slug: string
  topic: string
  entities: string
  kind: string
  workspace_id: string
  project_id: string
  score: number
}

export function buildGlobalPointerLines(entries: DurableEntry[]): string[] {
  // Sort by score descending (highest utility first), keep top MAX_LINES
  const sorted = [...entries].sort((a, b) => b.score - a.score).slice(0, MAX_LINES)
  return sorted.map(e =>
    `${e.topic} | ${e.entities} | ${e.kind} | ${e.slug} | ${e.workspace_id}/${e.project_id} | ${e.score.toFixed(4)}`
  )
}

export async function writeGlobalPointer(
  entries: DurableEntry[],
  outputPath: string
): Promise<void> {
  const { writeFileSync, chmodSync, mkdirSync } = await import('node:fs')
  const { dirname } = await import('node:path')
  const lines = buildGlobalPointerLines(entries)
  const content = `# Global Pointer Index\n\n${lines.join('\n')}\n`
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, content, 'utf8')
  // Task 3.2: file-level ACL — restrict to owner-read/write only
  chmodSync(outputPath, 0o600)
}
