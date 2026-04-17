import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getGitFiles, isGitRepository } from '../pci/git-files.js'

describe('getGitFiles — v2a Task 8', () => {
  let repo: string

  beforeAll(() => {
    repo = join(tmpdir(), `fulcrum-pci-git-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(repo, { recursive: true })
    execSync('git init -q', { cwd: repo })
    execSync('git config user.email test@example.com && git config user.name test', { cwd: repo, shell: '/bin/sh' })
    writeFileSync(join(repo, 'a.ts'), 'export const a = 1\n')
    mkdirSync(join(repo, 'src'), { recursive: true })
    writeFileSync(join(repo, 'src', 'b.ts'), 'export const b = 2\n')
    writeFileSync(join(repo, '.gitignore'), 'ignored.txt\n')
    writeFileSync(join(repo, 'ignored.txt'), 'should not appear\n')
    writeFileSync(join(repo, 'untracked.ts'), 'export const u = 3\n')
    execSync('git add a.ts src/b.ts .gitignore', { cwd: repo })
    execSync('git commit -q -m init', { cwd: repo })
  })

  afterAll(() => {
    if (repo) rmSync(repo, { recursive: true, force: true })
  })

  it('returns tracked + untracked-but-not-ignored files', () => {
    const files = getGitFiles(repo).sort()
    expect(files).toContain('a.ts')
    expect(files).toContain('src/b.ts')
    expect(files).toContain('.gitignore')
    expect(files).toContain('untracked.ts') // untracked but not ignored
    expect(files).not.toContain('ignored.txt') // gitignored
  })

  it('returns empty array on a non-git directory', () => {
    const nonRepo = join(tmpdir(), `fulcrum-pci-nongit-${Date.now()}`)
    mkdirSync(nonRepo, { recursive: true })
    try {
      writeFileSync(join(nonRepo, 'x.ts'), 'x\n')
      expect(getGitFiles(nonRepo)).toEqual([])
    } finally {
      rmSync(nonRepo, { recursive: true, force: true })
    }
  })

  it('isGitRepository: true on git root, false on non-git', () => {
    expect(isGitRepository(repo)).toBe(true)
    expect(isGitRepository(tmpdir())).toBe(false)
  })
})
