import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import matter from 'gray-matter'
import { parseCanonicalSource } from '../parse.js'
import { emitGemini } from '../emit/gemini.js'

const here = dirname(fileURLToPath(import.meta.url))
const agentIntegrationRoot = join(here, '..', '..', '..', '..', 'agent-integration')

describe('emitGemini', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })
  const result = emitGemini(source)

  it('targets gemini', () => {
    expect(result.target).toBe('gemini')
  })

  it('emits one artifact per canonical skill at skills/fulcrum-<name>/SKILL.md', () => {
    expect(result.artifacts.length).toBe(33)
    const heartbeat = result.artifacts.find((a) => a.sourceSkillName === 'heartbeat')
    expect(heartbeat?.path).toBe('skills/fulcrum-heartbeat/SKILL.md')
  })

  it('namespaces frontmatter.name to fulcrum-<canonical-name>', () => {
    for (const artifact of result.artifacts) {
      const parsed = matter(artifact.contents)
      expect(parsed.data.name).toBe(`fulcrum-${artifact.sourceSkillName}`)
    }
  })

  it('preserves canonical body byte-for-byte (AD-6)', () => {
    for (const skill of source.skills) {
      const artifact = result.artifacts.find((a) => a.sourceSkillName === skill.name)
      const parsed = matter(artifact!.contents)
      expect(parsed.content.trim()).toBe(skill.body)
    }
  })

  it('does not drop or concat any skill', () => {
    const canonicalNames = source.skills.map((s) => s.name).sort()
    const emittedNames = result.artifacts.map((a) => a.sourceSkillName!).sort()
    expect(emittedNames).toEqual(canonicalNames)
  })

  it('is deterministic', () => {
    expect(emitGemini(source).artifacts).toEqual(result.artifacts)
  })

  it('returns empty artifacts for empty source', () => {
    expect(emitGemini({ skills: [] })).toEqual({ target: 'gemini', artifacts: [] })
  })
})
