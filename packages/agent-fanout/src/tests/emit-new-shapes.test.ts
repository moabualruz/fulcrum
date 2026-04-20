import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import matter from 'gray-matter'
import { parseCanonicalSource } from '../parse.js'
import { emitOpencode } from '../emit/opencode.js'
import { emitCopilot } from '../emit/copilot.js'
import { emitCursor } from '../emit/cursor.js'
import { emitWindsurf, WindsurfSizeError, WINDSURF_MAX_BYTES } from '../emit/windsurf.js'
import type { CanonicalSkill, CanonicalSource, EmitResult } from '../types.js'

const here = dirname(fileURLToPath(import.meta.url))
const agentIntegrationRoot = join(here, '..', '..', '..', '..', 'agent-integration')

function fakeSkill(overrides: Partial<CanonicalSkill> = {}): CanonicalSkill {
  return {
    name: 'fake', path: '/fake/SKILL.md',
    frontmatter: { name: 'fake', description: 'fake skill' },
    body: 'fake body',
    raw: '---\nname: fake\ndescription: fake skill\n---\n\nfake body\n',
    ...overrides,
  }
}

function skillsAndRules(result: EmitResult) {
  return {
    skillArtifacts: result.artifacts.filter((a) => a.sourceSkillName),
    ruleArtifacts: result.artifacts.filter((a) => a.sourceRuleName),
  }
}

function commonAssertions(name: string, result: EmitResult, source: CanonicalSource) {
  const { skillArtifacts, ruleArtifacts } = skillsAndRules(result)
  it(`${name}: one skill artifact per canonical skill`, () => {
    expect(skillArtifacts.length).toBe(source.skills.length)
    expect(skillArtifacts.length).toBe(33)
  })
  it(`${name}: one rule artifact per canonical rule`, () => {
    expect(ruleArtifacts.length).toBe(source.rules.length)
    expect(ruleArtifacts.length).toBe(3)
  })
  it(`${name}: preserves canonical skill body byte-for-byte (AD-6)`, () => {
    for (const skill of source.skills) {
      const artifact = skillArtifacts.find((a) => a.sourceSkillName === skill.name)
      expect(matter(artifact!.contents).content.trim()).toBe(skill.body)
    }
  })
  it(`${name}: per-skill identity — no drop, no concat`, () => {
    const canonicalNames = source.skills.map((s) => s.name).sort()
    const emittedNames = skillArtifacts.map((a) => a.sourceSkillName!).sort()
    expect(emittedNames).toEqual(canonicalNames)
  })
  it(`${name}: per-rule identity — no drop, no concat`, () => {
    const canonicalNames = source.rules.map((r) => r.name).sort()
    const emittedNames = ruleArtifacts.map((a) => a.sourceRuleName!).sort()
    expect(emittedNames).toEqual(canonicalNames)
  })
}

describe('emitOpencode', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })
  const result = emitOpencode(source)
  const { skillArtifacts, ruleArtifacts } = skillsAndRules(result)
  it('targets opencode', () => expect(result.target).toBe('opencode'))
  it('routes skills to .opencode/agents/fulcrum-skill-<name>.md', () => {
    expect(
      skillArtifacts.find((a) => a.sourceSkillName === 'heartbeat')?.path,
    ).toBe('.opencode/agents/fulcrum-skill-heartbeat.md')
  })
  it('routes rules to .opencode/rules/fulcrum-rule-<name>.md', () => {
    expect(
      ruleArtifacts.find((a) => a.sourceRuleName === 'fulcrum-first')?.path,
    ).toBe('.opencode/rules/fulcrum-rule-fulcrum-first.md')
  })
  it('marks skills mode:subagent + hidden:true', () => {
    for (const artifact of skillArtifacts) {
      const parsed = matter(artifact.contents)
      expect(parsed.data.mode).toBe('subagent')
      expect(parsed.data.hidden).toBe(true)
    }
  })
  it('rules are raw bytes (plugin PR 4 reads into rider)', () => {
    for (const artifact of ruleArtifacts) {
      expect(artifact.contents.startsWith('---\n')).toBe(true)
    }
  })
  it('narrows non-string description to empty string', () => {
    const res = emitOpencode({
      skills: [fakeSkill({ frontmatter: { description: { nested: 'oops' } } })],
      rules: [],
    })
    expect(matter(res.artifacts[0]!.contents).data.description).toBe('')
  })
  it('GAP(oc-agents-M4) marks skills with permission.task: { "*": "deny" }', () => {
    for (const artifact of skillArtifacts) {
      const parsed = matter(artifact.contents)
      const perm = parsed.data.permission as Record<string, unknown> | undefined
      expect(perm, `${artifact.path}: permission block missing`).toBeDefined()
      const task = perm?.['task'] as Record<string, unknown> | undefined
      expect(task, `${artifact.path}: permission.task missing`).toBeDefined()
      expect(task?.['*'], `${artifact.path}: permission.task['*'] should be 'deny'`).toBe('deny')
    }
  })
  commonAssertions('opencode', result, source)
})

describe('emitCopilot', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })
  const result = emitCopilot(source)
  const { skillArtifacts, ruleArtifacts } = skillsAndRules(result)
  it('targets copilot', () => expect(result.target).toBe('copilot'))
  it('routes skills to .github/instructions/fulcrum-skill-<name>.instructions.md', () => {
    expect(
      skillArtifacts.find((a) => a.sourceSkillName === 'heartbeat')?.path,
    ).toBe('.github/instructions/fulcrum-skill-heartbeat.instructions.md')
  })
  it('routes rules to .github/instructions/fulcrum-rule-<name>.instructions.md', () => {
    expect(
      ruleArtifacts.find((a) => a.sourceRuleName === 'lifecycle')?.path,
    ).toBe('.github/instructions/fulcrum-rule-lifecycle.instructions.md')
  })
  it('sets applyTo:"**" on every artifact', () => {
    for (const artifact of result.artifacts) {
      expect(matter(artifact.contents).data.applyTo).toBe('**')
    }
  })
  commonAssertions('copilot', result, source)
})

describe('emitCursor', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })
  const result = emitCursor(source)
  const { skillArtifacts, ruleArtifacts } = skillsAndRules(result)
  it('targets cursor', () => expect(result.target).toBe('cursor'))
  it('routes skills to .cursor/rules/fulcrum-skill-<name>.mdc', () => {
    expect(
      skillArtifacts.find((a) => a.sourceSkillName === 'heartbeat')?.path,
    ).toBe('.cursor/rules/fulcrum-skill-heartbeat.mdc')
  })
  it('routes rules to .cursor/rules/fulcrum-rule-<name>.mdc', () => {
    expect(
      ruleArtifacts.find((a) => a.sourceRuleName === 'fulcrum-first')?.path,
    ).toBe('.cursor/rules/fulcrum-rule-fulcrum-first.mdc')
  })
  it('sets alwaysApply:false on skills, alwaysApply:true on rules', () => {
    for (const artifact of skillArtifacts) {
      expect(matter(artifact.contents).data.alwaysApply).toBe(false)
    }
    for (const artifact of ruleArtifacts) {
      expect(matter(artifact.contents).data.alwaysApply).toBe(true)
    }
  })
  commonAssertions('cursor', result, source)
})

describe('emitWindsurf', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })
  const result = emitWindsurf(source)
  const { skillArtifacts, ruleArtifacts } = skillsAndRules(result)
  it('targets windsurf', () => expect(result.target).toBe('windsurf'))
  it('routes skills to .windsurf/rules/fulcrum-skill-<name>.md', () => {
    expect(
      skillArtifacts.find((a) => a.sourceSkillName === 'heartbeat')?.path,
    ).toBe('.windsurf/rules/fulcrum-skill-heartbeat.md')
  })
  it('routes rules to .windsurf/rules/fulcrum-rule-<name>.md', () => {
    expect(
      ruleArtifacts.find((a) => a.sourceRuleName === 'role-boundaries')?.path,
    ).toBe('.windsurf/rules/fulcrum-rule-role-boundaries.md')
  })
  it('sets trigger:model_decision on skills, trigger:always_on on rules', () => {
    for (const artifact of skillArtifacts) {
      expect(matter(artifact.contents).data.trigger).toBe('model_decision')
    }
    for (const artifact of ruleArtifacts) {
      expect(matter(artifact.contents).data.trigger).toBe('always_on')
    }
  })
  it('every emitted artifact fits within the 12000-byte budget', () => {
    for (const artifact of result.artifacts) {
      expect(Buffer.byteLength(artifact.contents, 'utf8')).toBeLessThanOrEqual(WINDSURF_MAX_BYTES)
    }
  })
  it('WINDSURF_MAX_BYTES is 12000', () => {
    expect(WINDSURF_MAX_BYTES).toBe(12000)
  })

  function emitOne(body: string) {
    return emitWindsurf({
      skills: [
        {
          name: 'boundary', path: '/x/SKILL.md',
          frontmatter: { description: 'x' }, body,
          raw: '---\ndescription: x\n---\n\n' + body + '\n',
        },
      ],
      rules: [],
    })
  }

  it('throws WindsurfSizeError when byteLength > 12000', () => {
    expect(() => emitOne('A'.repeat(13000))).toThrow(WindsurfSizeError)
  })
  it('accepts contents with byteLength <= 12000', () => {
    expect(() => emitOne('small body')).not.toThrow()
  })
  it('computes byteLength via Buffer.byteLength (multi-byte UTF-8 aware)', () => {
    expect(() => emitOne('あ'.repeat(4001))).toThrow(WindsurfSizeError)
  })
  it('WindsurfSizeError carries the offending artifact name and byte length', () => {
    try {
      emitOne('A'.repeat(13000))
    } catch (error) {
      expect(error).toBeInstanceOf(WindsurfSizeError)
      const typed = error as WindsurfSizeError
      expect(typed.artifactName).toBe('boundary')
      expect(typed.byteLength).toBeGreaterThan(WINDSURF_MAX_BYTES)
      return
    }
    throw new Error('expected WindsurfSizeError')
  })

  commonAssertions('windsurf', result, source)
})
