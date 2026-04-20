import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { parseCanonicalSource } from '../parse.js'
import { SecretDetectedError } from '../secret-scan.js'

const here = dirname(fileURLToPath(import.meta.url))
const agentIntegrationRoot = join(here, '..', '..', '..', '..', 'agent-integration')

describe('parseCanonicalSource', () => {
  it('reads every skill directory under agent-integration/skills/', () => {
    const source = parseCanonicalSource({ agentIntegrationRoot })
    expect(source.skills.length).toBe(33)
  })

  it('reads every rule file under agent-integration/rules/', () => {
    const source = parseCanonicalSource({ agentIntegrationRoot })
    expect(source.rules.map((r) => r.name).sort()).toEqual(
      ['fulcrum-first', 'lifecycle', 'role-boundaries'],
    )
  })

  it('populates name, path, frontmatter, body, raw for each skill', () => {
    const source = parseCanonicalSource({ agentIntegrationRoot })
    const heartbeat = source.skills.find((s) => s.name === 'heartbeat')
    expect(heartbeat).toBeDefined()
    expect(heartbeat?.path.endsWith('heartbeat/SKILL.md')).toBe(true)
    expect(heartbeat?.frontmatter.name).toBe('heartbeat')
    expect(heartbeat?.frontmatter.description).toMatch(/heartbeat/i)
    expect(heartbeat?.body).toMatch(/# Heartbeat/)
    expect(heartbeat?.body).not.toMatch(/^---/)
    expect(heartbeat?.raw.startsWith('---\n')).toBe(true)
    expect(heartbeat?.raw).toContain(heartbeat!.body)
  })

  it('populates name, path, frontmatter, body, raw for each rule', () => {
    const source = parseCanonicalSource({ agentIntegrationRoot })
    const first = source.rules.find((r) => r.name === 'fulcrum-first')
    expect(first).toBeDefined()
    expect(first?.path.endsWith('fulcrum-first.md')).toBe(true)
    expect(first?.frontmatter.name).toBe('fulcrum-first')
    expect(first?.body).toMatch(/# Fulcrum-first/)
    expect(first?.raw.startsWith('---\n')).toBe(true)
  })

  it('skips index.md and any loose markdown at the skills root', () => {
    const source = parseCanonicalSource({ agentIntegrationRoot })
    expect(source.skills.find((s) => s.name === 'index')).toBeUndefined()
  })

  it('returns empty skills + rules when agent-integration/ is absent', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'fanout-empty-'))
    try {
      const source = parseCanonicalSource({ agentIntegrationRoot: tmp })
      expect(source.skills).toEqual([])
      expect(source.rules).toEqual([])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('sorts skills and rules by name for deterministic downstream emit', () => {
    const source = parseCanonicalSource({ agentIntegrationRoot })
    const skillNames = source.skills.map((s) => s.name)
    expect(skillNames).toEqual([...skillNames].sort())
    const ruleNames = source.rules.map((r) => r.name)
    expect(ruleNames).toEqual([...ruleNames].sort())
  })

  it('fails the pipeline when a SKILL.md contains a secret (AD-9e integration)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'fanout-secret-'))
    try {
      mkdirSync(join(tmp, 'skills', 'bad-skill'), { recursive: true })
      writeFileSync(
        join(tmp, 'skills', 'bad-skill', 'SKILL.md'),
        '---\nname: bad-skill\ndescription: leaks a slack token\n---\n\ntoken=xoxb-1234567890-abcdefghij\n',
        'utf8',
      )
      expect(() => parseCanonicalSource({ agentIntegrationRoot: tmp })).toThrow(SecretDetectedError)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('fails the pipeline when a rule .md contains a secret', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'fanout-rule-secret-'))
    try {
      mkdirSync(join(tmp, 'rules'), { recursive: true })
      writeFileSync(
        join(tmp, 'rules', 'bad.md'),
        '---\nname: bad\n---\n\nBearer eyJ0eXAiOiJKV1QiLCJhbGciOiJI000\n',
        'utf8',
      )
      expect(() => parseCanonicalSource({ agentIntegrationRoot: tmp })).toThrow(SecretDetectedError)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('tolerates a skill with no frontmatter (gray-matter returns empty data)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'fanout-nofm-'))
    try {
      mkdirSync(join(tmp, 'skills', 'bare'), { recursive: true })
      writeFileSync(join(tmp, 'skills', 'bare', 'SKILL.md'), '# Bare\n\nNo frontmatter.\n', 'utf8')
      const source = parseCanonicalSource({ agentIntegrationRoot: tmp })
      expect(source.skills.length).toBe(1)
      expect(source.skills[0]?.name).toBe('bare')
      expect(source.skills[0]?.frontmatter).toEqual({})
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
