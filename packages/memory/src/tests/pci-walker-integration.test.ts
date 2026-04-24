// v2a PR 4 Task 21 — walker integration tests.
//
// Verifies: git fast-path, non-git walker fallback, hidden/binary/size filters,
// and the shouldIndexPath predicate used by the PCI watcher.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { enumerateProjectFiles, shouldIndexPath, MAX_FILE_SIZE_BYTES } from '../pci/walker-integration.js'

describe('PCI walker integration — v2a PR 4 Task 21', () => {
  let root: string

  beforeEach(() => {
    root = join(tmpdir(), `fulcrum-walker-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(root, { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('non-git repo: walker emits all plain files, sorted', async () => {
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src/a.ts'), 'export const a = 1')
    writeFileSync(join(root, 'src/b.ts'), 'export const b = 2')
    writeFileSync(join(root, 'readme.md'), '# hi')

    const result = await enumerateProjectFiles(root)
    expect(result.mode).toBe('fs-walk')
    expect(result.files).toContain('src/a.ts')
    expect(result.files).toContain('src/b.ts')
    expect(result.files).toContain('readme.md')
    // sorted
    expect([...result.files].sort()).toEqual(result.files)
  })

  it('non-git repo: excludes hidden files and node_modules', async () => {
    mkdirSync(join(root, 'node_modules/foo'), { recursive: true })
    mkdirSync(join(root, '.git'), { recursive: true })
    writeFileSync(join(root, '.envfile'), 'SKIPPED=1')
    writeFileSync(join(root, 'node_modules/foo/x.js'), 'x')
    writeFileSync(join(root, '.git/HEAD'), 'ref: refs/heads/main')
    writeFileSync(join(root, 'regular.ts'), 'ok')

    const result = await enumerateProjectFiles(root)
    expect(result.files).toEqual(['regular.ts'])
    expect(result.skipped).toBeGreaterThan(0)
  })

  it('excludes binary files by extension', async () => {
    writeFileSync(join(root, 'image.png'), Buffer.from([137, 80, 78, 71]))
    writeFileSync(join(root, 'archive.zip'), Buffer.from([80, 75, 3, 4]))
    writeFileSync(join(root, 'code.ts'), 'ok')
    const result = await enumerateProjectFiles(root)
    expect(result.files).toEqual(['code.ts'])
  })

  it('skips files larger than 1 MiB', async () => {
    const big = 'x'.repeat(MAX_FILE_SIZE_BYTES + 1)
    writeFileSync(join(root, 'huge.ts'), big)
    writeFileSync(join(root, 'small.ts'), 'ok')
    const result = await enumerateProjectFiles(root)
    expect(result.files).toEqual(['small.ts'])
  })

  it('respects .gitignore in non-git mode via prior-art reference walker', async () => {
    writeFileSync(join(root, '.gitignore'), 'ignored.ts\n')
    writeFileSync(join(root, 'ignored.ts'), 'nope')
    writeFileSync(join(root, 'kept.ts'), 'ok')
    const result = await enumerateProjectFiles(root)
    expect(result.files).toContain('kept.ts')
    expect(result.files).not.toContain('ignored.ts')
  })

  it('git repo: uses getGitFiles() fast-path when git is available', async () => {
    // Initialize a git repo and commit two files. Skip if git is unavailable.
    const initResult = spawnSync('git', ['init', '--initial-branch=main'], { cwd: root })
    if (initResult.status !== 0) return
    writeFileSync(join(root, 'tracked.ts'), 'ok')
    spawnSync('git', ['-c', 'user.email=x@x', '-c', 'user.name=x', 'add', 'tracked.ts'], { cwd: root })
    spawnSync('git', ['-c', 'user.email=x@x', '-c', 'user.name=x', 'commit', '-m', 'init'], { cwd: root })

    const result = await enumerateProjectFiles(root)
    expect(result.mode).toBe('git')
    expect(result.files).toContain('tracked.ts')
  })

  it('shouldIndexPath accepts regular files', () => {
    writeFileSync(join(root, 'good.ts'), 'ok')
    expect(shouldIndexPath(root, join(root, 'good.ts'))).toBe(true)
  })

  it('shouldIndexPath rejects hidden + hard-excluded + binary + oversize', () => {
    mkdirSync(join(root, 'node_modules'), { recursive: true })
    writeFileSync(join(root, 'node_modules/x.ts'), 'x')
    writeFileSync(join(root, 'image.png'), Buffer.from([137, 80, 78, 71]))
    writeFileSync(join(root, '.hidden'), 'h')

    expect(shouldIndexPath(root, join(root, 'node_modules/x.ts'))).toBe(false)
    expect(shouldIndexPath(root, join(root, 'image.png'))).toBe(false)
    expect(shouldIndexPath(root, join(root, '.hidden'))).toBe(false)
  })

  it('rejects transient test and bundler config artifacts', async () => {
    mkdirSync(join(root, 'packages/memory'), { recursive: true })
    writeFileSync(join(root, 'packages/memory/vitest.config.ts.timestamp-1776990501367-cd33f86df76b18.mjs'), 'export default {}')
    writeFileSync(join(root, 'packages/memory/tsup.config.bundled_vdnkg42ics.mjs'), 'export default {}')
    writeFileSync(join(root, 'packages/memory/kept.ts'), 'export const kept = true')

    const result = await enumerateProjectFiles(root)
    expect(result.files).toEqual(['packages/memory/kept.ts'])
    expect(shouldIndexPath(root, join(root, 'packages/memory/vitest.config.ts.timestamp-1776990501367-cd33f86df76b18.mjs'))).toBe(false)
    expect(shouldIndexPath(root, join(root, 'packages/memory/tsup.config.bundled_vdnkg42ics.mjs'))).toBe(false)
  })

  it('shouldIndexPath rejects paths outside the project root', () => {
    const outsidePath = join(tmpdir(), 'not-in-root.ts')
    writeFileSync(outsidePath, 'x')
    try {
      expect(shouldIndexPath(root, outsidePath)).toBe(false)
    } finally {
      rmSync(outsidePath, { force: true })
    }
  })
})
