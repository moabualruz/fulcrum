import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { parseCanonicalSource } from '../parse.js'
import { emitClaude } from '../emit/claude.js'

const here = dirname(fileURLToPath(import.meta.url))
const agentIntegrationRoot = join(here, '..', '..', '..', '..', 'agent-integration')

describe('emitClaude', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })
  const result = emitClaude(source)

  it('targets claude', () => {
    expect(result.target).toBe('claude')
  })

  it('emits one artifact per canonical skill', () => {
    expect(result.artifacts.length).toBe(source.skills.length)
    expect(result.artifacts.length).toBe(33)
  })

  it('routes each skill to skills/<name>/SKILL.md', () => {
    const heartbeat = result.artifacts.find((a) => a.sourceSkillName === 'heartbeat')
    expect(heartbeat?.path).toBe('skills/heartbeat/SKILL.md')
  })

  it('reconstructs byte-identical canonical source via skill.raw (no disk re-read)', () => {
    for (const skill of source.skills) {
      const original = readFileSync(skill.path, 'utf8')
      const emitted = result.artifacts.find((a) => a.sourceSkillName === skill.name)
      expect(emitted, `missing emit for ${skill.name}`).toBeDefined()
      expect(emitted?.contents).toBe(original)
    }
  })

  it('preserves per-skill identity — no drop, no concat (AD-6)', () => {
    const names = source.skills.map((s) => s.name).sort()
    const emittedNames = result.artifacts.map((a) => a.sourceSkillName!).sort()
    expect(emittedNames).toEqual(names)
  })

  it('is deterministic', () => {
    expect(emitClaude(source).artifacts).toEqual(result.artifacts)
  })

  it('returns empty artifacts for empty source', () => {
    expect(emitClaude({ skills: [] })).toEqual({ target: 'claude', artifacts: [] })
  })
})
