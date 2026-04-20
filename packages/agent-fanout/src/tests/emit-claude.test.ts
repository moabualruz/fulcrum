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
  const skillArtifacts = result.artifacts.filter((a) => a.sourceSkillName)
  const ruleArtifacts = result.artifacts.filter((a) => a.sourceRuleName)

  it('targets claude', () => {
    expect(result.target).toBe('claude')
  })

  it('emits one skill artifact per canonical skill', () => {
    expect(skillArtifacts.length).toBe(source.skills.length)
    expect(skillArtifacts.length).toBe(33)
  })

  it('emits one rule artifact per canonical rule', () => {
    expect(ruleArtifacts.length).toBe(source.rules.length)
    expect(ruleArtifacts.length).toBe(3)
  })

  it('routes each skill to skills/<name>/SKILL.md', () => {
    const heartbeat = skillArtifacts.find((a) => a.sourceSkillName === 'heartbeat')
    expect(heartbeat?.path).toBe('skills/heartbeat/SKILL.md')
  })

  it('routes each rule to rules/fulcrum-rule-<name>.md', () => {
    const first = ruleArtifacts.find((a) => a.sourceRuleName === 'fulcrum-first')
    expect(first?.path).toBe('rules/fulcrum-rule-fulcrum-first.md')
  })

  it('reconstructs byte-identical skill source via skill.raw (no disk re-read)', () => {
    for (const skill of source.skills) {
      const original = readFileSync(skill.path, 'utf8')
      const emitted = skillArtifacts.find((a) => a.sourceSkillName === skill.name)
      expect(emitted?.contents).toBe(original)
    }
  })

  it('reconstructs byte-identical rule source via rule.raw', () => {
    for (const rule of source.rules) {
      const original = readFileSync(rule.path, 'utf8')
      const emitted = ruleArtifacts.find((a) => a.sourceRuleName === rule.name)
      expect(emitted?.contents).toBe(original)
    }
  })

  it('preserves per-skill identity — no drop, no concat (AD-6)', () => {
    const canonicalNames = source.skills.map((s) => s.name).sort()
    const emittedNames = skillArtifacts.map((a) => a.sourceSkillName!).sort()
    expect(emittedNames).toEqual(canonicalNames)
  })

  it('preserves per-rule identity', () => {
    const canonicalNames = source.rules.map((r) => r.name).sort()
    const emittedNames = ruleArtifacts.map((a) => a.sourceRuleName!).sort()
    expect(emittedNames).toEqual(canonicalNames)
  })

  it('is deterministic', () => {
    expect(emitClaude(source).artifacts).toEqual(result.artifacts)
  })

  it('returns empty artifacts for empty source', () => {
    expect(emitClaude({ skills: [], rules: [] })).toEqual({ target: 'claude', artifacts: [] })
  })
})
