// PR 7.4 — verify 24 sub-agent MDs are materialized at
// agent-integration/gemini/agents/<slug>.md. Schema per docs/core/subagents.md
// (re-fetched via find-docs 2026-04-20): name, description, kind: local.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const REPO_ROOT = join(import.meta.dirname ?? __dirname, '..', '..', '..', '..')
const agentsDir = join(REPO_ROOT, 'agent-integration', 'gemini', 'agents')
const claudeAgentsDir = join(REPO_ROOT, 'agent-integration', 'claude', 'agents')

describe('PR 7.4 Gemini sub-agent MDs — committed at agent-integration/gemini/agents/', () => {
  it('has ≥ 24 role MDs — every canonical role present', () => {
    const canonical = readdirSync(claudeAgentsDir).filter(f => f.endsWith('.md'))
    expect(canonical.length).toBe(24)
    const gemini = readdirSync(agentsDir).filter(f => f.endsWith('.md'))
    expect(gemini.length).toBeGreaterThanOrEqual(24)
    for (const name of canonical) {
      expect(gemini, `missing ${name}`).toContain(name)
    }
  })

  it('every canonical role MD carries Gemini sub-agent frontmatter (name + description + kind)', () => {
    const canonical = readdirSync(claudeAgentsDir).filter(f => f.endsWith('.md'))
    for (const file of canonical) {
      const body = readFileSync(join(agentsDir, file), 'utf8')
      expect(body, `${file} missing frontmatter`).toMatch(/^---\n/)
      expect(body, `${file} missing name`).toMatch(/^name:\s*[a-z_]+/m)
      expect(body, `${file} missing description`).toMatch(/^description:\s*["'].+/m)
      expect(body, `${file} missing kind`).toMatch(/^kind:\s*local/m)
    }
  })

  it('canonical role name matches filename slug (lowercase_underscore)', () => {
    const canonical = readdirSync(claudeAgentsDir).filter(f => f.endsWith('.md'))
    for (const file of canonical) {
      const slug = file.replace(/\.md$/, '')
      const body = readFileSync(join(agentsDir, file), 'utf8')
      expect(body, `${file} name field mismatches slug ${slug}`).toMatch(new RegExp(`^name:\\s*${slug}\\b`, 'm'))
    }
  })

  it('chief_of_staff.md and software_engineer.md are present (smoke check)', () => {
    const files = readdirSync(agentsDir)
    expect(files).toContain('chief_of_staff.md')
    expect(files).toContain('software_engineer.md')
  })
})
