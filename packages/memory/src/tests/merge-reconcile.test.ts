// packages/memory/src/tests/merge-reconcile.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { initVault, writeMemoryFile } from '../vault/client.js'
import { createVaultGit } from '../vault/git.js'
import { reconcileMergedBranch } from '../setup/rebuild.js'
import { getDb } from '@moabualruz/fulcrum-core'
import type { FullMemory } from '../types.js'

let vaultPath: string

const testMemory: FullMemory = {
  memory_id: '01JBXMERGE000000000000001A',
  scope: 'project',
  kind: 'fact',
  workspace_id: 'ws_1',
  project_id: 'proj_1',
  file_path: null,
  symbol_path: null,
  title: 'Reconcile test memory',
  summary: 'Written on memory branch, reconciled post-merge',
  canonical_text: 'This memory was written on a memory branch and should appear in L1 after reconcile.',
  tags: ['reconcile', 'test'],
  entities: [],
  confidence: 1.0,
  freshness: 1.0,
  importance: 0.5,
  access_count: 0,
  event_time: null,
  content_hash: null,
  task_id: 'tsk_recon01',
  issue_id: null,
  artifact_id: null,
  provenance_refs: [],
  created_at: '2026-04-14T12:00:00Z',
  updated_at: '2026-04-14T12:00:00Z',
  last_accessed_at: '2026-04-14T12:00:00Z',
}

beforeEach(async () => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
  vaultPath = mkdtempSync(join(tmpdir(), 'fulcrum-merge-test-'))
  await initVault(vaultPath)
})

afterEach(() => {
  resetTestDb()
  rmSync(vaultPath, { recursive: true, force: true })
})

describe('reconcileMergedBranch', () => {
  it('appends MERGE entry to log.md', async () => {
    const taskId = 'tsk_recon01'
    const git = createVaultGit(vaultPath)
    await git.init()

    // Initial commit on main
    await git.commitAll('init: vault')

    // Create memory branch, write a memory file, commit, then merge
    await git.createMemoryBranch(taskId)
    await writeMemoryFile(vaultPath, testMemory)
    await git.commitAll(`write: ${testMemory.memory_id}`)
    await git.mergeMemoryBranch(taskId)

    // Reconcile
    await reconcileMergedBranch(vaultPath, taskId)

    // Check log.md contains a MERGE entry
    const logContent = readFileSync(join(vaultPath, 'log.md'), 'utf-8')
    expect(logContent).toContain('MERGE')
    expect(logContent).toContain(taskId)
  })

  it('syncs changed memory file into L1 after merge', async () => {
    const taskId = 'tsk_recon02'
    const memory = { ...testMemory, memory_id: '01JBXMERGE000000000000002B', task_id: taskId }
    const git = createVaultGit(vaultPath)
    await git.init()
    await git.commitAll('init: vault')

    await git.createMemoryBranch(taskId)
    await writeMemoryFile(vaultPath, memory)
    await git.commitAll(`write: ${memory.memory_id}`)
    await git.mergeMemoryBranch(taskId)

    // Before reconcile, L1 should not have the memory
    const db = getDb()
    const before = db.prepare('SELECT memory_id FROM memories WHERE memory_id = ?').get(memory.memory_id)
    expect(before).toBeUndefined()

    await reconcileMergedBranch(vaultPath, taskId)

    // After reconcile, L1 should contain the memory
    const after = db.prepare('SELECT memory_id FROM memories WHERE memory_id = ?').get(memory.memory_id)
    expect(after).toBeDefined()
    expect((after as { memory_id: string }).memory_id).toBe(memory.memory_id)
  })

  it('appends MERGE log with correct count when branch has files', async () => {
    const taskId = 'tsk_recon03'
    const memory = { ...testMemory, memory_id: '01JBXMERGE000000000000003C', task_id: taskId }
    const git = createVaultGit(vaultPath)
    await git.init()
    await git.commitAll('init: vault')

    await git.createMemoryBranch(taskId)
    await writeMemoryFile(vaultPath, memory)
    await git.commitAll(`write: ${memory.memory_id}`)
    await git.mergeMemoryBranch(taskId)

    await reconcileMergedBranch(vaultPath, taskId)

    const logContent = readFileSync(join(vaultPath, 'log.md'), 'utf-8')
    expect(logContent).toMatch(/MERGE\s+tsk_recon03/)
    expect(logContent).toContain('from=branch')
    expect(logContent).toContain('count=1')
  })

  it('handles empty branch gracefully and still logs MERGE', async () => {
    const taskId = 'tsk_recon04'
    const git = createVaultGit(vaultPath)
    await git.init()
    await git.commitAll('init: vault')

    // Create branch with no memory files, just merge it
    await git.createMemoryBranch(taskId)
    await git.commitAll('empty branch commit')
    await git.mergeMemoryBranch(taskId)

    await reconcileMergedBranch(vaultPath, taskId)

    const logContent = readFileSync(join(vaultPath, 'log.md'), 'utf-8')
    expect(logContent).toContain('MERGE')
    expect(logContent).toContain(taskId)
    expect(logContent).toContain('count=0')
  })
})
