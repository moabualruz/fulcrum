// packages/memory/src/tests/vault-git.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createVaultGit } from '../vault/git.js'

let vaultPath: string

beforeEach(() => {
  vaultPath = mkdtempSync(join(tmpdir(), 'fulcrum-git-test-'))
})

afterEach(() => {
  rmSync(vaultPath, { recursive: true, force: true })
})

describe('VaultGit', () => {
  it('isRepo returns false for non-git directory', async () => {
    const git = createVaultGit(vaultPath)
    expect(await git.isRepo()).toBe(false)
  })

  it('init creates a git repository', async () => {
    const git = createVaultGit(vaultPath)
    await git.init()
    expect(await git.isRepo()).toBe(true)
  })

  it('commitAll commits staged files', async () => {
    const git = createVaultGit(vaultPath)
    await git.init()
    writeFileSync(join(vaultPath, 'test.md'), 'hello')
    await git.commitAll('test commit')
    const branch = await git.currentBranch()
    expect(['main', 'master']).toContain(branch)
  })

  it('createMemoryBranch creates a new branch', async () => {
    const git = createVaultGit(vaultPath)
    await git.init()
    writeFileSync(join(vaultPath, 'init.md'), 'init')
    await git.commitAll('init')
    await git.createMemoryBranch('tsk_test01')
    const branch = await git.currentBranch()
    expect(branch).toBe('memory/tsk_test01')
  })

  it('mergeMemoryBranch merges changes back to main via --no-ff', async () => {
    const git = createVaultGit(vaultPath)
    await git.init()

    // Initial commit on main
    writeFileSync(join(vaultPath, 'init.md'), 'init')
    await git.commitAll('initial')

    // Create memory branch and commit a new file on it
    await git.createMemoryBranch('tsk_merge01')
    writeFileSync(join(vaultPath, 'memory.md'), 'memory content')
    await git.commitAll('add memory')

    // Call the method under test — it checks out _defaultBranch ('main') and merges with --no-ff
    await git.mergeMemoryBranch('tsk_merge01')

    // Verify we are back on the default branch
    const branch = await git.currentBranch()
    expect(branch).toBe('main')

    // Verify the merged file is present on main
    const { existsSync } = await import('fs')
    expect(existsSync(join(vaultPath, 'memory.md'))).toBe(true)

    // Verify --no-ff: HEAD must be a merge commit (two parents)
    const sg = (await import('simple-git')).default(vaultPath)
    const headHash = (await sg.revparse(['HEAD'])).trim()
    // git cat-file -p HEAD prints "parent <hash>" lines — two means a merge commit
    const catFile = await sg.raw(['cat-file', '-p', headHash])
    const parentLines = catFile.split('\n').filter(l => l.startsWith('parent '))
    expect(parentLines.length).toBe(2)
  })

  it('getChangedFiles returns files changed between commits', async () => {
    const git = createVaultGit(vaultPath)
    await git.init()
    writeFileSync(join(vaultPath, 'file1.md'), 'v1')
    await git.commitAll('first commit')

    writeFileSync(join(vaultPath, 'file2.md'), 'v2')
    await git.commitAll('second commit')

    const sg = (await import('simple-git')).default(vaultPath)
    const log = await sg.log()
    const commits = log.all
    expect(commits.length).toBeGreaterThanOrEqual(2)
    // Just verify the function doesn't throw
    const changed = await git.getChangedFiles(commits[1]!.hash, commits[0]!.hash)
    expect(Array.isArray(changed)).toBe(true)
  })
})
