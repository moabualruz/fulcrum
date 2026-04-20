import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseCanonicalSource } from '../parse.js'
import { emitPi } from '../emit/pi.js'

const here = dirname(fileURLToPath(import.meta.url))
const agentIntegrationRoot = join(here, '..', '..', '..', '..', 'agent-integration')

describe('emitPi', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })
  const result = emitPi(source)
  const skillArtifacts = result.artifacts.filter((a) => a.sourceSkillName)
  const ruleArtifacts = result.artifacts.filter((a) => a.sourceRuleName)

  it('targets pi', () => {
    expect(result.target).toBe('pi')
  })

  it('emits zero skill artifacts (PI consumes canonical via symlink; OQ #5)', () => {
    expect(skillArtifacts).toEqual([])
  })

  it('emits one rule artifact per canonical rule', () => {
    expect(ruleArtifacts.length).toBe(3)
    expect(
      ruleArtifacts.find((a) => a.sourceRuleName === 'role-boundaries')?.path,
    ).toBe('rules/fulcrum-rule-role-boundaries.md')
  })

  it('preserves rule as raw bytes', () => {
    for (const rule of source.rules) {
      const artifact = ruleArtifacts.find((a) => a.sourceRuleName === rule.name)
      expect(artifact?.contents).toBe(rule.raw)
    }
  })

  it('returns empty artifacts for empty source', () => {
    expect(emitPi({ skills: [], rules: [] })).toEqual({ target: 'pi', artifacts: [] })
  })
})
