// packages/cli/src/tests/agent-mds.test.ts
// CI gate: assert all 24 agent MD files exist with valid YAML frontmatter.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const AGENTS_DIR = resolve(__dirname, '..', '..', '..', '..', 'agent-integration', 'claude', 'agents')

const REQUIRED_ROLES = [
  'chief_of_staff', 'context_gatherer', 'prd_planner', 'implementation_planner',
  'issue_decomposer', 'software_engineer', 'research_worker', 'refactor_worker',
  'browser_worker', 'data_engineer', 'ml_engineer', 'devops_engineer',
  'architecture_reviewer', 'code_reviewer', 'qa_engineer', 'security_reviewer',
  'integration_worker', 'documentation_writer', 'memory_curator', 'tech_lead',
  'product_manager', 'analyst', 'orchestrator', 'custom',
]

function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = /^---\n([\s\S]*?)\n---/.exec(content)
  if (!match) return null
  // Simple YAML key: value parser (handles top-level scalar strings only)
  const result: Record<string, unknown> = {}
  for (const line of match[1].split('\n')) {
    const kv = /^(\w[\w-]*):\s*(.*)$/.exec(line.trim())
    if (kv) result[kv[1]] = kv[2].trim()
  }
  return result
}

describe('Claude Code agent MD files', () => {
  it('agent-integration/claude/agents/ directory exists', () => {
    expect(existsSync(AGENTS_DIR)).toBe(true)
  })

  it('contains exactly 24 .md files', () => {
    const files = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'))
    expect(files).toHaveLength(24)
  })

  for (const role of REQUIRED_ROLES) {
    const filePath = join(AGENTS_DIR, `${role}.md`)

    it(`${role}.md exists`, () => {
      expect(existsSync(filePath)).toBe(true)
    })

    it(`${role}.md has valid YAML frontmatter with required fields`, () => {
      // PR 7 unit 7.18 (2026-04-20): Claude Code's agent frontmatter `tools`
      // field is a flat array per plugin-dev/skills/agent-development/SKILL.md
      // — NOT a {allowed, denied} object. The prior schema silently ignored
      // the restriction (chief_of_staff could still Write/Edit/Bash).
      const content = readFileSync(filePath, 'utf8')
      const fm = parseFrontmatter(content)
      expect(fm).not.toBeNull()
      expect(typeof fm!['name']).toBe('string')
      expect((fm!['name'] as string).length).toBeGreaterThan(0)
      expect(typeof fm!['model']).toBe('string')
      expect((fm!['model'] as string).length).toBeGreaterThan(0)
      // description may span multiple lines (>-) — just verify the key exists
      expect(content).toMatch(/^description:/m)
      // tools must be a flat inline array (spec schema).
      expect(content).toMatch(/^tools:\s*\[/m)
      // The old {allowed, denied} object form was wrong — must not reappear.
      expect(content).not.toMatch(/^\s+allowed:/m)
      expect(content).not.toMatch(/^\s+denied:/m)
    })
  }
})
