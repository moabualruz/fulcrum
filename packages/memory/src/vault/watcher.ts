import { createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { watch } from 'chokidar'
import { join } from 'path'
import matter from 'gray-matter'
import { getContentChangeBus } from 'fulcrum-agent-core'
import { parseFromFile } from './formatter.js'
import { readState, upsertStateEntry, removeStateEntry } from './state.js'
import { appendToLog } from './index-builder.js'

export interface VaultWatcherOptions {
  vaultPath: string
  onHumanEdit: (memoryId: string, filePath: string) => Promise<void>
  onHumanDelete: (memoryId: string, filePath: string) => Promise<void>
}

function sha256Body(body: string): string {
  return createHash('sha256').update(body).digest('hex')
}

export function startVaultWatcher(options: VaultWatcherOptions): () => void {
  const { vaultPath, onHumanEdit, onHumanDelete } = options
  const memoriesGlob = join(vaultPath, 'memories', '**', '*.md')

  const watcher = watch(memoriesGlob, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  })

  watcher.on('add', async (filePath: string) => {
    await handleChange(filePath)
  })

  watcher.on('change', async (filePath: string) => {
    await handleChange(filePath)
  })

  watcher.on('unlink', async (filePath: string) => {
    await handleDelete(filePath)
  })

  async function handleChange(filePath: string): Promise<void> {
    try {
      if (!existsSync(filePath)) return
      const content = readFileSync(filePath, 'utf-8')

      // Parse frontmatter with gray-matter directly so we can validate BEFORE
      // calling parseFromFile (which throws on missing required fields)
      const rawParsed = matter(content)
      const rawFm = rawParsed.data as Record<string, unknown>

      // Validate required fields — log ERROR and bail out if invalid
      const requiredFields = ['id', 'schema', 'kind', 'scope', 'workspace_id', 'title'] as const
      const missingFields = requiredFields.filter(f => !rawFm[f])
      if (missingFields.length > 0) {
        const nowErr = new Date().toISOString()
        appendToLog(vaultPath, {
          ts: nowErr,
          op: 'ERROR',
          id: typeof rawFm['id'] === 'string' ? rawFm['id'] : 'unknown',
          meta: `schema validation failed: missing fields [${missingFields.join(', ')}]`,
        })
        return // Do not call onHumanEdit or rewrite the file
      }

      // All required fields present — use parseFromFile for the typed result
      const { frontmatter, body } = parseFromFile(content)
      const memoryId = frontmatter.id

      // Compare sha256(body) to .state.json entry
      const state = readState(vaultPath)
      const entry = state[memoryId]
      const currentHash = sha256Body(body)

      if (entry && entry.sha256 === currentHash) {
        // Self-write echo from writeMemoryFile — ignore
        return
      }

      // Genuine human edit
      const now = new Date().toISOString()

      // Update state FIRST so the file rewrite below is suppressed as a self-write echo
      upsertStateEntry(vaultPath, {
        id: memoryId,
        path: filePath.replace(vaultPath + '/', ''),
        mtime: Date.now(),
        sha256: currentHash,
      })

      // Update content_hash and updated_at in the file frontmatter
      // Parse raw file with gray-matter so we preserve exact YAML formatting
      const parsed = matter(content)
      parsed.data['content_hash'] = currentHash
      parsed.data['updated_at'] = now
      const updatedContent = matter.stringify(parsed.content, parsed.data)
      writeFileSync(filePath, updatedContent, 'utf-8')
      // Note: the chokidar event for this rewrite will be suppressed by the state entry above
      // because sha256(body) hasn't changed — only the frontmatter changed

      // Append EDIT to log
      appendToLog(vaultPath, {
        ts: now,
        op: 'EDIT',
        id: memoryId,
        meta: 'by=human',
      })

      // v2a PR 4 Task 22: emit unified ContentChangeEvent so v2b consumers
      // (git reducer, REM extraction) can subscribe without per-watcher
      // branching. Uses kind='memory' — disjoint from PCI's kind='code'.
      try {
        getContentChangeBus().emit({ kind: 'memory', path: filePath, sha256: currentHash, change_type: 'change' })
      } catch { /* bus emit is best-effort */ }

      // Notify caller (triggers L1 upsert + L2 re-embed)
      await onHumanEdit(memoryId, filePath)
    } catch (err) {
      // Log error but do not crash watcher
      const now = new Date().toISOString()
      appendToLog(vaultPath, {
        ts: now,
        op: 'ERROR',
        id: 'unknown',
        meta: `watcher error: ${(err as Error).message}`,
      })
    }
  }

  async function handleDelete(filePath: string): Promise<void> {
    try {
      // Try to find memory id from state by path
      const state = readState(vaultPath)
      const relPath = filePath.replace(vaultPath + '/', '')
      const entry = Object.values(state).find(e => e.path === relPath)
      if (!entry) return

      const now = new Date().toISOString()

      // Remove stale state entry so future re-creates are not suppressed
      removeStateEntry(vaultPath, entry.id)

      appendToLog(vaultPath, {
        ts: now,
        op: 'DELETE',
        id: entry.id,
        meta: 'by=human',
      })

      // v2a PR 4 Task 22: unified content-change bus (memory kind).
      try {
        getContentChangeBus().emit({ kind: 'memory', path: filePath, sha256: '', change_type: 'unlink' })
      } catch { /* best-effort */ }

      await onHumanDelete(entry.id, filePath)
    } catch {
      // Ignore errors on delete handling
    }
  }

  // Return cleanup function
  return () => {
    watcher.close().catch(() => {})
  }
}
