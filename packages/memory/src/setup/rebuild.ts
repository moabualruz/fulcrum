// packages/memory/src/setup/rebuild.ts
import { listMemoryFiles, readMemoryFile } from '../vault/client.js'
import { insertMemoryDirect } from '../write.js'
import { getKuzuClient } from '../kuzu/client.js'
import { upsertMemoryToKuzu, removeMemoryFromKuzu } from '../kuzu/upsert.js'
import { getDb, Db} from '@fulcrum/core'
import { appendToLog } from '../vault/index-builder.js'
import { readState } from '../vault/state.js'
import { simpleGit } from 'simple-git'
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
          const existing = getDb().prepare(
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

/**
 * Post-merge reconciliation: after `mergeMemoryBranch(taskId)` is called,
 * this function syncs the vault changes into L1 (SQLite) and L2 (Kuzu) and
 * appends a MERGE entry to log.md.
 *
 * It diffs `main` (or default branch) against `memory/<taskId>` to find
 * files that were added/modified or deleted on the branch, then:
 *  - changed/added: re-parse and upsert into L1 + L2
 *  - deleted: remove from L1 + L2 using memory_id from .state.json
 */
export async function reconcileMergedBranch(
  vaultPath: string,
  taskId: string,
  db: Db = getDb(),
): Promise<void> {
  const sg = simpleGit(vaultPath)
  const memoriesPattern = 'memories/curated/'

  // Resolve the merge commit SHA by running `git log` via sg.raw so that
  // simple-git's parser is bypassed entirely (sg.log() prepends its own
  // --pretty= format which conflicts with --format=%H and causes the parser to
  // return empty results). sg.raw() returns the raw stdout string so we can
  // split on newlines and take the first non-empty SHA directly.
  const branch = `memory/${taskId}`
  const rawLog = await sg.raw([
    'log',
    '--format=%H',
    `--grep=merge: memory branch ${branch}`,
    '--',
    '.',
  ]).catch(() => '')
  const mergeSha: string = rawLog.trim().split('\n').find((line: string) => line.trim().length > 0)?.trim() ?? ''

  // Use the resolved merge commit's parents for the diff.
  // If no merge commit was found (unexpected), fall back to HEAD^1..HEAD^2 as a
  // best-effort — callers should ensure mergeMemoryBranch ran before this.
  const fromRef = mergeSha ? `${mergeSha}^1` : 'HEAD^1'
  const toRef = mergeSha ? `${mergeSha}^2` : 'HEAD^2'

  // Files added or modified on the branch
  const changedRaw = await sg.raw([
    'diff', '--name-only', '--diff-filter=AM',
    fromRef, toRef,
    '--', memoriesPattern,
  ])
  const changedFiles = changedRaw.split('\n').filter(Boolean)

  // Files deleted on the branch
  const deletedRaw = await sg.raw([
    'diff', '--name-only', '--diff-filter=D',
    fromRef, toRef,
    '--', memoriesPattern,
  ])
  const deletedFiles = deletedRaw.split('\n').filter(Boolean)

  const kuzuClient = getKuzuClient()

  // --- Process changed / added files ---
  for (const relPath of changedFiles) {
    const absPath = `${vaultPath}/${relPath}`
    try {
      const { frontmatter, body } = await readMemoryFile(absPath)
      const memory = frontmatterToFullMemory(frontmatter, body)
      insertMemoryDirect(memory)
      if (kuzuClient) {
        await upsertMemoryToKuzu(kuzuClient, memory, null)
      }
    } catch {
      // Skip files that can't be parsed (e.g. deleted before we read them)
    }
  }

  // --- Process deleted files ---
  const state = readState(vaultPath)
  // Build a lookup from relative path → memory_id
  const pathToId = new Map<string, string>()
  for (const [memoryId, entry] of Object.entries(state)) {
    pathToId.set(entry.path, memoryId)
  }

  for (const relPath of deletedFiles) {
    const memoryId = pathToId.get(relPath)
    if (!memoryId) {
      // If the memory_id is not in .state.json, we can't look it up.
      // This happens when the file was written on a different machine or .state.json was not propagated.
      // Recovery: run `rebuildFromVault({ target: 'l1' })` to re-index from L0 files.
      continue
    }

    try {
      db.prepare('DELETE FROM memories WHERE memory_id = ?').run(memoryId)
    } catch {
      // Row may not exist — ignore
    }

    if (kuzuClient) {
      try {
        await removeMemoryFromKuzu(kuzuClient, memoryId)
      } catch {
        // Node may not exist — ignore
      }
    }
  }

  // --- Append MERGE log entry ---
  const totalCount = changedFiles.length + deletedFiles.length
  appendToLog(vaultPath, {
    ts: new Date().toISOString(),
    op: 'MERGE',
    id: taskId,
    meta: `from=branch count=${totalCount}`,
  })
}
