// PR 7.5 — verify agent-integration/gemini/policies/ carries at least one
// tier-2 policy file using the schema documented in docs/reference/policy-engine.md
// (re-fetched via find-docs 2026-04-20).

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const REPO_ROOT = join(import.meta.dirname ?? __dirname, '..', '..', '..', '..')
const policiesDir = join(REPO_ROOT, 'agent-integration', 'gemini', 'policies')

describe('PR 7.5 Gemini policies — committed at agent-integration/gemini/policies/', () => {
  it('policies directory is non-empty', () => {
    const files = readdirSync(policiesDir).filter(f => f.endsWith('.toml'))
    expect(files.length).toBeGreaterThan(0)
  })

  it('every .toml file contains at least one [[rule]] block with toolName and decision', () => {
    const files = readdirSync(policiesDir).filter(f => f.endsWith('.toml'))
    for (const file of files) {
      const body = readFileSync(join(policiesDir, file), 'utf8')
      expect(body, `${file} missing [[rule]] block`).toMatch(/^\[\[rule\]\]/m)
      expect(body, `${file} missing toolName key`).toMatch(/^toolName\s*=/m)
      expect(body, `${file} missing decision key`).toMatch(/^decision\s*=\s*["'](allow|deny|ask_user)["']/m)
    }
  })

  it('subagent-boundary policy carries deny rules for chief_of_staff write tools (PR 7 unit 7.2)', () => {
    // Corrected 2026-04-20 per docs/extensions/reference.md §"Policy Engine
    // Rules": `allow` decisions are silently dropped at extension tier. The
    // earlier fulcrum-core.toml with 24 `decision = "allow"` rules was dead
    // code. We now enforce role boundaries with scoped `deny` rules (which
    // IS honored at extension tier) — see
    // docs/core/subagents.md §"Enforce Subagent-Specific Policies".
    const body = readFileSync(join(policiesDir, 'fulcrum-subagent-boundaries.toml'), 'utf8')
    expect(body).toMatch(/subagent\s*=\s*["']chief_of_staff["']/)
    expect(body).toMatch(/decision\s*=\s*["']deny["']/)
    expect(body).toMatch(/write_file|replace/)
  })

  it('extension-tier policies never use `decision = "allow"` (silently dropped per docs)', () => {
    const files = readdirSync(policiesDir).filter(f => f.endsWith('.toml'))
    for (const file of files) {
      const body = readFileSync(join(policiesDir, file), 'utf8')
      expect(body, `${file} uses \`decision = "allow"\` at extension tier (silently dropped)`).not.toMatch(/decision\s*=\s*["']allow["']/)
    }
  })

  it('policies never apply priority outside the documented 0-999 range', () => {
    const files = readdirSync(policiesDir).filter(f => f.endsWith('.toml'))
    for (const file of files) {
      const body = readFileSync(join(policiesDir, file), 'utf8')
      const matches = body.matchAll(/^priority\s*=\s*(\d+)/gm)
      for (const m of matches) {
        const n = parseInt(m[1]!, 10)
        expect(n, `${file} priority ${n} out of range`).toBeGreaterThanOrEqual(0)
        expect(n, `${file} priority ${n} out of range`).toBeLessThanOrEqual(999)
      }
    }
  })
})
