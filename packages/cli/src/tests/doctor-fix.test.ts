// packages/cli/src/tests/doctor-fix.test.ts
// Tests for `fulcrum doctor --fix` and `--dry-run` flag behavior.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, existsSync, rmSync, writeFileSync, mkdirSync, chmodSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { runDoctor } from '../doctor.js'

let tmpDir: string
let tmpDataDir: string

function setup(): void {
  tmpDir = mkdtempSync(join(tmpdir(), 'fulcrum-doctor-fix-test-'))
  // Intentionally do NOT pre-create tmpDataDir so the data-dir check warns
  tmpDataDir = join(tmpdir(), `fulcrum-doctor-fix-data-${Date.now()}`)
  process.env['FULCRUM_DATA_DIR'] = tmpDataDir
}

function teardown(): void {
  delete process.env['FULCRUM_DATA_DIR']
  try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  try {
    // If tmpDataDir is a dir with restricted permissions, fix them first
    if (existsSync(tmpDataDir)) {
      try { chmodSync(tmpDataDir, 0o755) } catch { /* ignore */ }
    }
    rmSync(tmpDataDir, { recursive: true, force: true })
  } catch { /* ignore */ }
}

describe('runDoctor --dry-run', () => {
  beforeEach(setup)
  afterEach(teardown)

  it('lists available fixes without calling any fix.apply()', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { results, fixesApplied } = await runDoctor({ cwd: tmpDir, dryRun: true })

      // No apply() should have been called — data dir should still be missing
      expect(existsSync(tmpDataDir)).toBe(false)

      // fixesApplied should be 0 in dry-run mode
      expect(fixesApplied).toBe(0)

      // console.log should have been called with "Would apply:" messages for fixable results
      const fixableResults = results.filter(r => r.fix && (r.status === 'fail' || r.status === 'warn'))
      const wouldApplyCalls = consoleSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && (call[0] as string).startsWith('Would apply:')
      )
      expect(wouldApplyCalls.length).toBe(fixableResults.length)
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('does not create the data directory in dry-run mode', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await runDoctor({ cwd: tmpDir, dryRun: true })
      expect(existsSync(tmpDataDir)).toBe(false)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('--fix --dry-run together: dry-run takes precedence, no fix functions called', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { fixesApplied } = await runDoctor({ cwd: tmpDir, fix: true, dryRun: true })
      // dry-run takes precedence — no actual fixes applied
      expect(fixesApplied).toBe(0)
      expect(existsSync(tmpDataDir)).toBe(false)
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('runDoctor --fix', () => {
  beforeEach(setup)
  afterEach(teardown)

  it('calls fix.apply() for FAIL/WARN results that have a fix', async () => {
    const { results: before } = await runDoctor({ cwd: tmpDir })
    const dataDirCheck = before.find(r => r.name === 'Data directory')
    expect(dataDirCheck?.status).toBe('warn')
    expect(dataDirCheck?.fix).toBeDefined()

    const { fixesApplied } = await runDoctor({ cwd: tmpDir, fix: true })
    expect(fixesApplied).toBeGreaterThan(0)
  })

  it('creates the data directory when fix is applied', async () => {
    expect(existsSync(tmpDataDir)).toBe(false)
    await runDoctor({ cwd: tmpDir, fix: true })
    expect(existsSync(tmpDataDir)).toBe(true)
  })

  it('after --fix applied, data directory check transitions from warn to pass', async () => {
    const { results } = await runDoctor({ cwd: tmpDir, fix: true })
    const dataDirCheck = results.find(r => r.name === 'Data directory')
    expect(dataDirCheck?.status).toBe('pass')
  })

  it('skips PASS results — does not call fix.apply() on passing checks', async () => {
    // Write CLAUDE.md so agent integration check passes
    writeFileSync(join(tmpDir, 'CLAUDE.md'), '# Fulcrum')
    // Create tmpDataDir so data dir check passes too
    mkdirSync(tmpDataDir, { recursive: true })

    const { results: before } = await runDoctor({ cwd: tmpDir })
    const agentCheck = before.find(r => r.name === 'Agent integration files')
    expect(agentCheck?.status).toBe('pass')

    // When all checks pass, no fixes should be applied
    const { fixesApplied } = await runDoctor({ cwd: tmpDir, fix: true })
    const { results: after } = await runDoctor({ cwd: tmpDir })
    const agentCheckAfter = after.find(r => r.name === 'Agent integration files')
    // Should still be pass — fix was not called on an already-passing check
    expect(agentCheckAfter?.status).toBe('pass')
    // fixesApplied should not include passing checks
    expect(fixesApplied).toBe(0)
  })

  it('check with no fix field is silently skipped in --fix mode', async () => {
    // Node.js version check has no fix — shouldn't throw
    const { results } = await runDoctor({ cwd: tmpDir, fix: true })
    const nodeCheck = results.find(r => r.name === 'Node.js version')
    expect(nodeCheck).toBeDefined()
    // No error thrown — test passes if we get here
  })

  it('fix.apply() throws — error message printed, remaining fixes continue', async () => {
    // Create a parent dir with no write permission so mkdirSync for a subdir fails.
    // We create a read-only parent, then point FULCRUM_DATA_DIR to a subdir of it.
    const readonlyParent = mkdtempSync(join(tmpdir(), 'fulcrum-readonly-'))
    const lockedDataDir = join(readonlyParent, 'locked-subdir')

    // Make parent read-only so mkdirSync(lockedDataDir) will fail
    chmodSync(readonlyParent, 0o555)

    process.env['FULCRUM_DATA_DIR'] = lockedDataDir

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // Run with --fix — the data dir fix should fail (parent is not writable)
      await runDoctor({ cwd: tmpDir, fix: true })

      // Should have printed a warning about the failed fix
      const warnCalls = warnSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && (call[0] as string).includes('Fix failed')
      )
      expect(warnCalls.length).toBeGreaterThan(0)
    } finally {
      chmodSync(readonlyParent, 0o755)
      rmSync(readonlyParent, { recursive: true, force: true })
      warnSpy.mockRestore()
    }
  })

  it('creates stub CLAUDE.md when agent integration check warns and fix is applied', async () => {
    // No CLAUDE.md in tmpDir initially
    expect(existsSync(join(tmpDir, 'CLAUDE.md'))).toBe(false)
    const { results } = await runDoctor({ cwd: tmpDir, fix: true })
    expect(existsSync(join(tmpDir, 'CLAUDE.md'))).toBe(true)
    const agentCheck = results.find(r => r.name === 'Agent integration files')
    expect(agentCheck?.status).toBe('pass')
  })
})
