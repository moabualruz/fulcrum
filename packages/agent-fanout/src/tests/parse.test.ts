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

  it('skips index.md and any loose markdown at the skills root', () => {
    const source = parseCanonicalSource({ agentIntegrationRoot })
    expect(source.skills.find((s) => s.name === 'index')).toBeUndefined()
  })

  it('returns empty when agent-integration/skills/ is absent', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'fanout-empty-'))
    try {
      expect(parseCanonicalSource({ agentIntegrationRoot: tmp }).skills).toEqual([])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('sorts skills by name for deterministic downstream emit', () => {
    const source = parseCanonicalSource({ agentIntegrationRoot })
    const names = source.skills.map((s) => s.name)
    const sorted = [...names].sort()
    expect(names).toEqual(sorted)
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
