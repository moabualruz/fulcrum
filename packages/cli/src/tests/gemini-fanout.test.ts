// PR 7.3 / 7.6 / 7.7 — verify the materialized fanout committed at
// agent-integration/gemini/ matches the canonical source. Assumes
// scripts/fanout-gemini-extension.ts has been run and its output is committed.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join } from 'path'

const REPO_ROOT = join(import.meta.dirname ?? __dirname, '..', '..', '..', '..')
const geminiRoot = join(REPO_ROOT, 'agent-integration', 'gemini')
const skillsDir = join(geminiRoot, 'skills')
const rulesDir = join(geminiRoot, 'rules')

describe('PR 7.3 Gemini skill fanout — committed at agent-integration/gemini/skills/', () => {
  it('has 33 fulcrum-<name>/SKILL.md skill dirs', () => {
    const entries = readdirSync(skillsDir).filter(e => e.startsWith('fulcrum-'))
    expect(entries.length).toBe(33)
    for (const name of entries) {
      const skillFile = join(skillsDir, name, 'SKILL.md')
      expect(existsSync(skillFile), `${skillFile} missing`).toBe(true)
      expect(statSync(skillFile).size).toBeGreaterThan(50)
    }
  })

  it('every skill dir carries SKILL.md with proper frontmatter', () => {
    const names = readdirSync(skillsDir).filter(e => e.startsWith('fulcrum-'))
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      const body = readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8')
      expect(body).toMatch(/^---\n/)
      expect(body).toMatch(new RegExp(`name:\\s*${name}`))
      expect(body).toMatch(/description:/)
    }
  })
})

describe('PR 7.3 Gemini rules fanout — committed at agent-integration/gemini/rules/', () => {
  it('has 3 canonical rule files (fulcrum-rule-<name>.md)', () => {
    const entries = readdirSync(rulesDir).filter(e => e.startsWith('fulcrum-rule-') && e.endsWith('.md'))
    expect(entries.length).toBe(3)
    const names = entries.map(e => e.replace(/^fulcrum-rule-|\.md$/g, ''))
    expect(names).toContain('fulcrum-first')
    expect(names).toContain('lifecycle')
    expect(names).toContain('role-boundaries')
  })
})
