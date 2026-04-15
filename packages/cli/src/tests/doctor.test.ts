// packages/cli/src/tests/doctor.test.ts
// Tests for `fulcrum doctor` health check runner.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir, homedir } from 'os'
import { runDoctor } from '../doctor.js'

let tmpDir: string
let tmpDataDir: string

function setup(): void {
  tmpDir = mkdtempSync(join(tmpdir(), 'fulcrum-doctor-test-'))
  tmpDataDir = mkdtempSync(join(tmpdir(), 'fulcrum-doctor-data-'))
  // Point FULCRUM_DATA_DIR at a temp global dir so tests don't touch ~/.local/share/fulcrum
  process.env['FULCRUM_DATA_DIR'] = tmpDataDir
}

function teardown(): void {
  delete process.env['FULCRUM_DATA_DIR']
  try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  try { rmSync(tmpDataDir, { recursive: true, force: true }) } catch { /* ignore */ }
}

describe('runDoctor', () => {
  beforeEach(setup)
  afterEach(teardown)

  it('returns an array of check results', () => {
    const { results } = runDoctor({ cwd: tmpDir })
    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r).toHaveProperty('name')
      expect(r).toHaveProperty('status')
      expect(r).toHaveProperty('message')
      expect(['pass', 'warn', 'fail']).toContain(r.status)
    }
  })

  it('returns exitCode 0 when no checks fail', () => {
    const { exitCode, results } = runDoctor({ cwd: tmpDir })
    const hasFail = results.some(r => r.status === 'fail')
    expect(exitCode).toBe(hasFail ? 1 : 0)
  })

  it('passes global config check when no config.json exists (uses defaults)', () => {
    // No config.json in global data dir — that is fine, IDs are derived from CWD
    const { results } = runDoctor({ cwd: tmpDir })
    const check = results.find(r => r.name === 'Global config')
    expect(check?.status).toBe('pass')
    expect(check?.message).toContain('defaults')
  })

  it('passes global config check when config.json exists with valid JSON', () => {
    writeFileSync(join(tmpDataDir, 'config.json'), JSON.stringify({ port: 4721 }))
    const { results } = runDoctor({ cwd: tmpDir })
    const check = results.find(r => r.name === 'Global config')
    expect(check?.status).toBe('pass')
    expect(check?.message).toContain('port')
  })

  it('fails global config check when config.json contains invalid JSON', () => {
    writeFileSync(join(tmpDataDir, 'config.json'), '{ invalid json ]]]')
    const { exitCode, results } = runDoctor({ cwd: tmpDir })
    const check = results.find(r => r.name === 'Global config')
    expect(check?.status).toBe('fail')
    expect(exitCode).toBe(1)
  })

  it('detects agent integration files', () => {
    writeFileSync(join(tmpDir, 'CLAUDE.md'), '# Fulcrum')
    const { results } = runDoctor({ cwd: tmpDir })
    const check = results.find(r => r.name === 'Agent integration files')
    expect(check?.status).toBe('pass')
    expect(check?.message).toContain('CLAUDE.md')
  })

  it('warns when no agent integration files found', () => {
    const { results } = runDoctor({ cwd: tmpDir })
    const check = results.find(r => r.name === 'Agent integration files')
    expect(check?.status).toBe('warn')
  })

  it('includes Node.js version check', () => {
    const { results } = runDoctor({ cwd: tmpDir })
    const check = results.find(r => r.name === 'Node.js version')
    expect(check).toBeDefined()
    expect(['pass', 'fail']).toContain(check?.status)
  })

  it('includes data directory check', () => {
    const { results } = runDoctor({ cwd: tmpDir })
    const check = results.find(r => r.name === 'Data directory')
    expect(check).toBeDefined()
  })

  it('uses provided cwd for path checks', () => {
    const { results: r1 } = runDoctor({ cwd: tmpDir })
    const { results: r2 } = runDoctor({ cwd: '/nonexistent-dir-xyz' })
    // Both run without throwing
    expect(r1.length).toBeGreaterThan(0)
    expect(r2.length).toBeGreaterThan(0)
  })

  it('does not check for .fulcrum.json in project directory', () => {
    // Write a .fulcrum.json to the cwd — doctor should not look at it
    writeFileSync(join(tmpDir, '.fulcrum.json'), JSON.stringify({ workspace_id: 'ws_old' }))
    const { results } = runDoctor({ cwd: tmpDir })
    const legacyCheck = results.find(r => r.name === '.fulcrum.json')
    expect(legacyCheck).toBeUndefined()
  })
})
