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
  const skillArtifacts = result.artifacts.filter((a) => a.sourceSkillName)
  const ruleArtifacts = result.artifacts.filter((a) => a.sourceRuleName)

  it('targets codex', () => {
    expect(result.target).toBe('codex')
  })

  it('emits one skill artifact per canonical skill at skills/fulcrum-<name>/SKILL.md', () => {
    expect(skillArtifacts.length).toBe(33)
    const heartbeat = skillArtifacts.find((a) => a.sourceSkillName === 'heartbeat')
    expect(heartbeat?.path).toBe('skills/fulcrum-heartbeat/SKILL.md')
  })

  it('emits one rule artifact per canonical rule at rules/fulcrum-rule-<name>.md', () => {
    expect(ruleArtifacts.length).toBe(3)
    const first = ruleArtifacts.find((a) => a.sourceRuleName === 'fulcrum-first')
    expect(first?.path).toBe('rules/fulcrum-rule-fulcrum-first.md')
  })

  it('rewrites frontmatter.name to fulcrum-<canonical-name> (namespacing)', () => {
    for (const artifact of skillArtifacts) {
      const parsed = matter(artifact.contents)
      expect(parsed.data.name).toBe(`fulcrum-${artifact.sourceSkillName}`)
    }
  })

  it('preserves canonical skill body byte-for-byte (per-skill identity, AD-6)', () => {
    for (const skill of source.skills) {
      const artifact = skillArtifacts.find((a) => a.sourceSkillName === skill.name)
      const parsed = matter(artifact!.contents)
      expect(parsed.content.trim()).toBe(skill.body)
    }
  })

  it('preserves canonical rule as raw bytes (installer injects into AGENTS.md)', () => {
    for (const rule of source.rules) {
      const artifact = ruleArtifacts.find((a) => a.sourceRuleName === rule.name)
      expect(artifact?.contents).toBe(rule.raw)
    }
  })

  it('narrows a non-string description to empty string', () => {
    const result = emitCodex({
      skills: [
        {
          name: 'weird', path: '/weird/SKILL.md',
          frontmatter: { description: 42 }, body: '# Weird',
          raw: '---\ndescription: 42\n---\n\n# Weird\n',
        },
      ],
      rules: [],
    })
    const parsed = matter(result.artifacts[0]!.contents)
    expect(parsed.data.description).toBe('')
  })

  it('is deterministic', () => {
    expect(emitCodex(source).artifacts).toEqual(result.artifacts)
  })

  it('returns empty artifacts for empty source', () => {
    expect(emitCodex({ skills: [], rules: [] })).toEqual({ target: 'codex', artifacts: [] })
  })
})
