// packages/memory/src/setup/rebuild.ts
import { listMemoryFiles, readMemoryFile } from '../vault/client.js'
import { writeMemory } from '../write.js'
import { getKuzuClient } from '../kuzu/client.js'
import { upsertMemoryToKuzu } from '../kuzu/upsert.js'
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

    // L1 rebuild
    if ((target === 'l1' || target === 'both') && !verify) {
      try {
        await writeMemory({
          workspace_id: memory.workspace_id,
          project_id: memory.project_id,
          scope: memory.scope,
          kind: memory.kind,
          title: memory.title,
          summary: memory.summary,
          content: body,
          canonical_text: body,
          tags: memory.tags,
          entities: memory.entities,
          confidence: memory.confidence,
          freshness: memory.freshness,
          importance: memory.importance,
          file_path: memory.file_path,
          symbol_path: memory.symbol_path,
          event_time: memory.event_time,
          task_id: memory.task_id,
          issue_id: memory.issue_id,
          artifact_id: memory.artifact_id,
          provenance_refs: memory.provenance_refs,
          skipVaultWrite: true,  // L0 files already exist — do not rewrite
        })
        result.l1Count++
      } catch (err) {
        result.errors.push(`l1 error: ${memory.memory_id} — ${(err as Error).message}`)
      }
    }

    // L2 rebuild
    if ((target === 'l2' || target === 'both') && !verify) {
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
