import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import matter from 'gray-matter'
import { parseCanonicalSource } from '../parse.js'
import { emitCodex } from '../emit/codex.js'

const here = dirname(fileURLToPath(import.meta.url))
const agentIntegrationRoot = join(here, '..', '..', '..', '..', 'agent-integration')

describe('emitCodex', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })
  const result = emitCodex(source)

  it('targets codex', () => {
    expect(result.target).toBe('codex')
  })

  it('emits one artifact per canonical skill at skills/fulcrum-<name>/SKILL.md', () => {
    expect(result.artifacts.length).toBe(33)
    const heartbeat = result.artifacts.find((a) => a.sourceSkillName === 'heartbeat')
    expect(heartbeat?.path).toBe('skills/fulcrum-heartbeat/SKILL.md')
  })

  it('rewrites frontmatter.name to fulcrum-<canonical-name> (namespacing)', () => {
    for (const artifact of result.artifacts) {
      const parsed = matter(artifact.contents)
      expect(parsed.data.name).toBe(`fulcrum-${artifact.sourceSkillName}`)
    }
  })

  it('preserves canonical body byte-for-byte (per-skill identity, AD-6)', () => {
    for (const skill of source.skills) {
      const artifact = result.artifacts.find((a) => a.sourceSkillName === skill.name)
      expect(artifact).toBeDefined()
      const parsed = matter(artifact!.contents)
      expect(parsed.content.trim()).toBe(skill.body)
    }
  })

  it('preserves canonical description as a string', () => {
    for (const skill of source.skills) {
      const artifact = result.artifacts.find((a) => a.sourceSkillName === skill.name)
      const parsed = matter(artifact!.contents)
      expect(typeof parsed.data.description).toBe('string')
      expect(parsed.data.description).toBe(skill.frontmatter.description)
    }
  })

  it('narrows a non-string description to empty string', () => {
    const result = emitCodex({
      skills: [
        {
          name: 'weird',
          path: '/weird/SKILL.md',
          frontmatter: { description: 42 },
          body: '# Weird',
          raw: '---\ndescription: 42\n---\n\n# Weird\n',
        },
      ],
    })
    const parsed = matter(result.artifacts[0]!.contents)
    expect(parsed.data.description).toBe('')
  })

  it('does not drop or concat any skill', () => {
    const canonicalNames = source.skills.map((s) => s.name).sort()
    const emittedNames = result.artifacts.map((a) => a.sourceSkillName!).sort()
    expect(emittedNames).toEqual(canonicalNames)
  })

  it('is deterministic', () => {
    expect(emitCodex(source).artifacts).toEqual(result.artifacts)
  })

  it('returns empty artifacts for empty source', () => {
    expect(emitCodex({ skills: [] })).toEqual({ target: 'codex', artifacts: [] })
  })
})
