// packages/memory/src/setup/rebuild.ts
import { listMemoryFiles, readMemoryFile } from '../vault/client.js'
import { insertMemoryDirect } from '../write.js'
import { getKuzuClient } from '../kuzu/client.js'
import { upsertMemoryToKuzu } from '../kuzu/upsert.js'
import { getDb } from '@fulcrum/core'
import type { FullMemory, MemoryKind, MemoryScope } from '../types.js'
import type { MemoryFileFrontmatter } from '../types.js'

export interface RebuildOptions {
  vaultPath: string
  target: 'l1' | 'l2' | 'both'
  verify?: boolean
}

export interface RebuildResult {
  l1Count: number
  l2Count: number
  errors: string[]
}

function frontmatterToFullMemory(fm: MemoryFileFrontmatter, body: string): FullMemory {
  return {
    memory_id: fm.id,
    scope: fm.scope as MemoryScope,
    kind: fm.kind as MemoryKind,
    workspace_id: fm.workspace_id,
    project_id: fm.project_id ?? null,
    file_path: fm.file_path ?? null,
    symbol_path: fm.symbol_path ?? null,
    title: fm.title,
    summary: fm.summary ?? '',
    canonical_text: body,
    tags: fm.tags ?? [],
    entities: fm.entities ?? [],
    confidence: fm.confidence ?? 1.0,
    freshness: fm.freshness ?? 1.0,
    importance: fm.importance ?? 0.5,
    access_count: 0,
    event_time: fm.event_time ?? null,
    content_hash: fm.content_hash ?? null,
    task_id: fm.task_id ?? null,
    issue_id: fm.issue_id ?? null,
    artifact_id: fm.artifact_id ?? null,
    provenance_refs: fm.provenance_refs ?? [],
    created_at: fm.created_at ?? new Date().toISOString(),
    updated_at: fm.updated_at ?? new Date().toISOString(),
    last_accessed_at: new Date().toISOString(),
  }
}

export async function rebuildFromVault(options: RebuildOptions): Promise<RebuildResult> {
  const { vaultPath, target, verify = false } = options
  const result: RebuildResult = { l1Count: 0, l2Count: 0, errors: [] }

  const allFiles = await listMemoryFiles(vaultPath, 'all')

  for (const filePath of allFiles) {
    let frontmatter: MemoryFileFrontmatter
    let body: string

    try {
      const parsed = await readMemoryFile(filePath)
      frontmatter = parsed.frontmatter
      body = parsed.body
    } catch (err) {
      result.errors.push(`parse error: ${filePath} — ${(err as Error).message}`)
      continue
    }

    const memory = frontmatterToFullMemory(frontmatter, body)

    if (verify) {
      // Dry-run: report drift between L0 and L1, don't modify anything
      if (target === 'l1' || target === 'both') {
        try {
          const db = getDb()
          const existing = db.prepare(
            'SELECT memory_id, content_hash FROM memories WHERE memory_id = ?'
          ).get(memory.memory_id) as { memory_id: string; content_hash: string | null } | undefined

          if (!existing) {
            result.errors.push(`drift: ${memory.memory_id} present in L0 but missing from L1`)
          } else if (memory.content_hash && existing.content_hash !== memory.content_hash) {
            result.errors.push(
              `drift: ${memory.memory_id} content_hash mismatch — L0=${memory.content_hash} L1=${existing.content_hash ?? 'null'}`
            )
          }
        } catch (err) {
          result.errors.push(`verify error: ${memory.memory_id} — ${(err as Error).message}`)
        }
      }
      continue  // verify mode never writes
    }

    // L1 rebuild — use insertMemoryDirect to preserve original memory_id
    if (target === 'l1' || target === 'both') {
      try {
        insertMemoryDirect(memory)
        result.l1Count++
      } catch (err) {
        result.errors.push(`l1 error: ${memory.memory_id} — ${(err as Error).message}`)
      }
    }

    // L2 rebuild
    if (target === 'l2' || target === 'both') {
      const kuzuClient = getKuzuClient()
      if (kuzuClient) {
        try {
          await upsertMemoryToKuzu(kuzuClient, memory, null)
          result.l2Count++
        } catch (err) {
          result.errors.push(`l2 error: ${memory.memory_id} — ${(err as Error).message}`)
        }
      }
    }
  }

  return result
}
