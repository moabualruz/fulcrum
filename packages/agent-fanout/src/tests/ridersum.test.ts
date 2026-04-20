import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeRiderSha, writeRidersum } from '../ridersum.js'

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'fulcrum-ridersum-'))
})

afterEach(() => {
  try { rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
})

function rulesDir(): string {
  return join(tmp, 'rules')
}

function writeRule(name: string, body: string): void {
  mkdirSync(rulesDir(), { recursive: true })
  writeFileSync(join(rulesDir(), name), body, 'utf8')
}

function expectedSha(bodies: string[]): string {
  return createHash('sha256').update(bodies.join('\n\n---\n\n')).digest('hex')
}

describe('computeRiderSha', () => {
  it('returns empty result when rules directory does not exist', () => {
    const r = computeRiderSha(rulesDir())
    expect(r.sha256).toBe('')
    expect(r.ruleCount).toBe(0)
    expect(r.rider).toBe('')
  })

  it('returns empty result when rules directory has no .md files', () => {
    mkdirSync(rulesDir(), { recursive: true })
    writeFileSync(join(rulesDir(), 'not-a-rule.txt'), 'ignored', 'utf8')
    const r = computeRiderSha(rulesDir())
    expect(r.sha256).toBe('')
    expect(r.ruleCount).toBe(0)
  })

  it('computes SHA-256 over sorted .md bodies joined with \\n\\n---\\n\\n', () => {
    writeRule('c.md', 'C BODY')
    writeRule('a.md', 'A BODY')
    writeRule('b.md', 'B BODY')
    const r = computeRiderSha(rulesDir())
    expect(r.ruleCount).toBe(3)
    expect(r.rider).toBe('A BODY\n\n---\n\nB BODY\n\n---\n\nC BODY')
    expect(r.sha256).toBe(expectedSha(['A BODY', 'B BODY', 'C BODY']))
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('skips non-file entries (subdirectories with .md suffix)', () => {
    mkdirSync(rulesDir(), { recursive: true })
    mkdirSync(join(rulesDir(), 'oops.md'), { recursive: true })
    writeRule('real.md', 'REAL BODY')
    const r = computeRiderSha(rulesDir())
    expect(r.ruleCount).toBe(1)
    expect(r.rider).toBe('REAL BODY')
  })
})

describe('writeRidersum', () => {
  it('writes .ridersum as a sibling of the rules directory', () => {
    writeRule('fulcrum-first.md', 'RULE BODY')
    const r = writeRidersum(rulesDir())
    const expectedPath = join(tmp, '.ridersum')
    expect(r.path).toBe(expectedPath)
    expect(existsSync(expectedPath)).toBe(true)
    expect(readFileSync(expectedPath, 'utf8').trim()).toBe(r.sha256)
    expect(r.sha256).toBe(expectedSha(['RULE BODY']))
    expect(r.ruleCount).toBe(1)
  })

  it('overwrites an existing .ridersum', () => {
    writeRule('a.md', 'OLD')
    writeRidersum(rulesDir())

    // Mutate the rules + re-run writer
    writeFileSync(join(rulesDir(), 'a.md'), 'NEW', 'utf8')
    const r2 = writeRidersum(rulesDir())
    expect(readFileSync(r2.path, 'utf8').trim()).toBe(r2.sha256)
    expect(r2.sha256).toBe(expectedSha(['NEW']))
  })

  it('returns empty result + writes nothing when rules dir is empty or absent', () => {
    const r = writeRidersum(rulesDir())
    expect(r.sha256).toBe('')
    expect(r.ruleCount).toBe(0)
    expect(existsSync(join(tmp, '.ridersum'))).toBe(false)
  })

  it('produces a SHA that matches what loadRider computes from the same inputs', () => {
    // Matches agent-integration/opencode/plugins/rider.ts loadRider contract:
    // sorted .md bodies joined with \n\n---\n\n, SHA-256 hex.
    writeRule('fulcrum-first.md', 'FIRST')
    writeRule('lifecycle.md', 'LIFECYCLE')
    writeRule('role-boundaries.md', 'ROLES')
    const r = writeRidersum(rulesDir())
    const manual = createHash('sha256')
      .update(['FIRST', 'LIFECYCLE', 'ROLES'].join('\n\n---\n\n'))
      .digest('hex')
    expect(r.sha256).toBe(manual)
  })
})
