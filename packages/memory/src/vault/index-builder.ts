// packages/memory/src/vault/index-builder.ts
import { appendFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { listMemoryFiles, readMemoryFile } from './client.js'

export interface LogEntry {
  ts: string
  op: 'WRITE' | 'EDIT' | 'DELETE' | 'INDEX-L1' | 'INDEX-L2' | 'REBUILD' | 'MERGE' | 'ERROR'
  id: string
  meta?: string
}

export function appendToLog(vaultPath: string, entry: LogEntry): void {
  const logPath = join(vaultPath, 'log.md')
  const metaPart = entry.meta ? ` ${entry.meta}` : ''
  const line = `${entry.ts} ${entry.op.padEnd(10)} ${entry.id}${metaPart}\n`
  appendFileSync(logPath, line, 'utf-8')
}

export async function rebuildIndex(vaultPath: string): Promise<void> {
  const files = await listMemoryFiles(vaultPath, 'curated')
  const now = new Date().toISOString()
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

  interface IndexEntry {
    id: string
    title: string
    kind: string
    created_at: string
    tags: string[]
    entities: string[]
    relPath: string
  }

  const entries: IndexEntry[] = []

  for (const filePath of files) {
    try {
      const { frontmatter } = await readMemoryFile(filePath)
      const relPath = filePath.replace(vaultPath + '/', '')
      entries.push({
        id: frontmatter.id,
        title: frontmatter.title,
        kind: frontmatter.kind,
        created_at: frontmatter.created_at ?? '',
        tags: frontmatter.tags ?? [],
        entities: frontmatter.entities ?? [],
        relPath,
      })
    } catch {
      // Skip unparseable files
    }
  }

  // Sort by created_at descending
  entries.sort((a, b) => b.created_at.localeCompare(a.created_at))

  const recent = entries.filter(e => {
    const t = new Date(e.created_at).getTime()
    return !isNaN(t) && t >= thirtyDaysAgo
  })

  // Build tag map
  const byTag = new Map<string, number>()
  for (const e of entries) {
    for (const tag of e.tags) {
      byTag.set(tag, (byTag.get(tag) ?? 0) + 1)
    }
  }

  // Build entity map
  const byEntity = new Map<string, number>()
  for (const e of entries) {
    for (const ent of e.entities) {
      byEntity.set(ent, (byEntity.get(ent) ?? 0) + 1)
    }
  }

  const lines: string[] = [
    '# Fulcrum Vault Index',
    `_Auto-generated. Last compiled: ${now}._`,
    '',
    `## Recent (last 30 days)`,
  ]

  if (recent.length === 0) {
    lines.push('_No recent memories._')
  } else {
    for (const e of recent.slice(0, 50)) {
      const date = e.created_at.slice(0, 10)
      lines.push(`- [${e.title}](${e.relPath}) — ${e.kind}, ${date}`)
    }
  }

  lines.push('', '## By Entity')
  const sortedEntities = [...byEntity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
  if (sortedEntities.length === 0) {
    lines.push('_No entities indexed._')
  } else {
    for (const [entity, count] of sortedEntities) {
      lines.push(`- \`${entity}\` → ${count} ${count === 1 ? 'memory' : 'memories'}`)
    }
  }

  lines.push('', '## By Tag')
  const sortedTags = [...byTag.entries()].sort((a, b) => b[1] - a[1])
  if (sortedTags.length === 0) {
    lines.push('_No tags indexed._')
  } else {
    for (const [tag, count] of sortedTags) {
      lines.push(`- \`${tag}\` → ${count} ${count === 1 ? 'memory' : 'memories'}`)
    }
  }

  lines.push('')
  writeFileSync(join(vaultPath, 'index.md'), lines.join('\n'), 'utf-8')
}
