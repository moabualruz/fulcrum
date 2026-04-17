// Socket-path resolver tests. See plan Unit 1.2.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// The module under test calls globalDataDir() from fulcrum-agent-core. Point
// it at a temp dir via env var before importing, so the test doesn't touch the
// real global state.
let tempRoot: string
const originalPlatform = process.platform

beforeEach(async () => {
  tempRoot = mkdtempSync(join(tmpdir(), 'fulcrum-sockpath-'))
  process.env['FULCRUM_DATA_DIR'] = tempRoot
  // Re-import to pick up the fresh env.
  vi.resetModules()
})

afterEach(() => {
  delete process.env['FULCRUM_DATA_DIR']
  try { rmSync(tempRoot, { recursive: true, force: true }) } catch { /* best-effort */ }
  // Restore platform after win32 mocks.
  Object.defineProperty(process, 'platform', { value: originalPlatform })
})

describe('indexerSocketPath() — POSIX', () => {
  it('returns <globalDataDir>/fulcrum-indexer.sock and ensures the directory', async () => {
    const { indexerSocketPath } = await import('../socket-path.js')
    // Force the posix branch for platforms that would otherwise match win32.
    Object.defineProperty(process, 'platform', { value: 'linux' })
    const path = indexerSocketPath()
    expect(path.endsWith('fulcrum-indexer.sock')).toBe(true)
    expect(path.startsWith(tempRoot)).toBe(true)
    // Parent directory must exist after the call.
    expect(existsSync(join(path, '..'))).toBe(true)
  })
})

describe('indexerSocketPath() — Windows', () => {
  it('returns a per-user named pipe path', async () => {
    const { indexerSocketPath } = await import('../socket-path.js')
    Object.defineProperty(process, 'platform', { value: 'win32' })
    vi.doMock('node:os', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:os')>()
      return { ...actual, userInfo: () => ({ username: 'alice' }) }
    })
    vi.resetModules()
    const mod = await import('../socket-path.js')
    const path = mod.indexerSocketPath()
    expect(path.startsWith('\\\\.\\pipe\\fulcrum-indexer-')).toBe(true)
    expect(path).toContain('alice')
  })

  it('sanitises user-name characters that are invalid for a pipe name', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    vi.doMock('node:os', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:os')>()
      return { ...actual, userInfo: () => ({ username: 'weird user\\name!' }) }
    })
    vi.resetModules()
    const mod = await import('../socket-path.js')
    const path = mod.indexerSocketPath()
    // No backslashes, spaces, or bangs inside the user segment of the pipe name.
    const userSegment = path.replace(/^\\\\.\\pipe\\fulcrum-indexer-/, '')
    expect(userSegment).toMatch(/^[a-zA-Z0-9_-]+$/)
  })
})

describe('unlinkStaleSocket()', () => {
  it('is a no-op when the path does not exist', async () => {
    const { unlinkStaleSocket } = await import('../socket-path.js')
    expect(() => unlinkStaleSocket(join(tempRoot, 'missing.sock'))).not.toThrow()
  })

  it('silently removes an existing file at the given path', async () => {
    const { unlinkStaleSocket } = await import('../socket-path.js')
    const p = join(tempRoot, 'stale.sock')
    writeFileSync(p, 'leftover', 'utf8')
    expect(existsSync(p)).toBe(true)
    unlinkStaleSocket(p)
    expect(existsSync(p)).toBe(false)
  })

  it('survives concurrent unlink races (EBUSY / ENOENT)', async () => {
    const { unlinkStaleSocket } = await import('../socket-path.js')
    const p = join(tempRoot, 'race.sock')
    writeFileSync(p, 'x', 'utf8')
    // First call unlinks, second is a no-op — should not throw.
    unlinkStaleSocket(p)
    unlinkStaleSocket(p)
    expect(existsSync(p)).toBe(false)
  })
})

describe('useful: read/write around the socket path still works without surprises', () => {
  it('the directory holding the POSIX socket is writable after resolution', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    const { indexerSocketPath } = await import('../socket-path.js')
    const path = indexerSocketPath()
    const sidecar = join(path, '..', 'sidecar.txt')
    writeFileSync(sidecar, 'hello', 'utf8')
    expect(readFileSync(sidecar, 'utf8')).toBe('hello')
  })
})
