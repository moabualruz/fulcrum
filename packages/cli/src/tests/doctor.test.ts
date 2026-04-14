// packages/cli/src/tests/doctor.test.ts
// Tests for `fulcrum doctor` health check runner.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { runDoctor } from '../doctor.js'

let tmpDir: string

function setup(): void {
  tmpDir = mkdtempSync(join(tmpdir(), 'fulcrum-doctor-test-'))
}

function teardown(): void {
  try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
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
    // tmpDir has no .fulcrum.json — that will be a warn, not fail
    // Node.js version check and env check should pass/warn
    const { exitCode, results } = runDoctor({ cwd: tmpDir })
    const hasFail = results.some(r => r.status === 'fail')
    expect(exitCode).toBe(hasFail ? 1 : 0)
  })

  it('returns exitCode 1 when a check fails (invalid .fulcrum.json)', () => {
    writeFileSync(join(tmpDir, '.fulcrum.json'), '{ invalid json ]]]')
    const { exitCode, results } = runDoctor({ cwd: tmpDir })
    const fulcrumCheck = results.find(r => r.name === '.fulcrum.json')
    expect(fulcrumCheck?.status).toBe('fail')
    expect(exitCode).toBe(1)
  })

  it('warns when .fulcrum.json is missing', () => {
    const { results } = runDoctor({ cwd: tmpDir })
    const fulcrumCheck = results.find(r => r.name === '.fulcrum.json')
    expect(fulcrumCheck?.status).toBe('warn')
  })

  it('passes .fulcrum.json check with valid config', () => {
    writeFileSync(join(tmpDir, '.fulcrum.json'), JSON.stringify({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
    }))
    const { results } = runDoctor({ cwd: tmpDir })
    const check = results.find(r => r.name === '.fulcrum.json')
    expect(check?.status).toBe('pass')
    expect(check?.message).toContain('ws_test')
  })

  it('fails .fulcrum.json check when required fields missing', () => {
    writeFileSync(join(tmpDir, '.fulcrum.json'), JSON.stringify({ workspace_id: 'ws_test' }))
    const { results } = runDoctor({ cwd: tmpDir })
    const check = results.find(r => r.name === '.fulcrum.json')
    expect(check?.status).toBe('fail')
    expect(check?.message).toContain('project_id')
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
})
