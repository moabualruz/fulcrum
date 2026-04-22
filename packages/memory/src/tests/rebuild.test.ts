// packages/memory/src/tests/rebuild.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { initVault, writeMemoryFile } from '../vault/client.js'
import { rebuildFromVault } from '../setup/rebuild.js'
import type { FullMemory } from '../types.js'

let vaultPath: string

const factMemory: FullMemory = {
  memory_id: '01JBXREBUILD000000000000001',
  scope: 'project',
  kind: 'fact',
  workspace_id: 'ws_1',
  project_id: 'proj_1',
  file_path: null,
  symbol_path: null,
  title: 'Rebuild test fact',
  summary: 'Tests rebuild from vault',
    content: typeof 'This memory was written to L0 and should be rebuilt into L1.' === 'string' ? 'This memory was written to L0 and should be rebuilt into L1.' : '',
  tags: ['rebuild', 'test'],
  entities: [],
  confidence: 1.0,
  freshness: 1.0,
  importance: 0.5,
  access_count: 0,
  event_time: null,
  content_hash: null,
  task_id: null,
  issue_id: null,
  artifact_id: null,
  provenance_refs: [],
  created_at: '2026-04-14T10:00:00Z',
  updated_at: '2026-04-14T10:00:00Z',
  last_accessed_at: '2026-04-14T10:00:00Z',
}

beforeEach(async () => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
  vaultPath = mkdtempSync(join(tmpdir(), 'fulcrum-rebuild-test-'))
  await initVault(vaultPath)
})

afterEach(() => {
  resetTestDb()
  rmSync(vaultPath, { recursive: true, force: true })
})

describe('rebuildFromVault', () => {
  it('rebuilds L1 from a vault file', async () => {
    // Write memory file directly to vault (bypassing L1)
    await writeMemoryFile(vaultPath, factMemory)

    const result = await rebuildFromVault({ vaultPath, target: 'l1' })
    expect(result.l1Count).toBe(1)
    expect(result.errors).toHaveLength(0)
  })

  it('creates missing workspace/project references from vault frontmatter', async () => {
    const orphanMemory: FullMemory = {
      ...factMemory,
      memory_id: '01JBXREBUILD000000000000009',
      workspace_id: 'ws_orphan_vault',
      project_id: 'proj_orphan_vault',
      title: 'orphan scoped memory',
      summary: 'orphan scoped memory',
    }
    await writeMemoryFile(vaultPath, orphanMemory)

    const result = await rebuildFromVault({ vaultPath, target: 'l1' })
    expect(result.l1Count).toBe(1)
    expect(result.errors).toHaveLength(0)
  })

  it('skips L2 rebuild when KuzuClient not active', async () => {
    await writeMemoryFile(vaultPath, factMemory)

    const result = await rebuildFromVault({ vaultPath, target: 'l2' })
    // KuzuClient is null (not activated), so l2Count stays 0 with no errors
    expect(result.l2Count).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('records errors for unparseable files without crashing', async () => {
    // Write a bad file directly
    const { writeFileSync, mkdirSync } = await import('fs')
    const badDir = join(vaultPath, 'memories', 'curated', 'workspaces', 'ws_1', 'global', '2026', '04')
    mkdirSync(badDir, { recursive: true })
    writeFileSync(join(badDir, 'bad.md'), 'this is not valid frontmatter\n---\n')

    const result = await rebuildFromVault({ vaultPath, target: 'l1' })
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('returns zero counts in verify mode', async () => {
    await writeMemoryFile(vaultPath, factMemory)

    const result = await rebuildFromVault({ vaultPath, target: 'both', verify: true })
    expect(result.l1Count).toBe(0)
    expect(result.l2Count).toBe(0)
  })
})
