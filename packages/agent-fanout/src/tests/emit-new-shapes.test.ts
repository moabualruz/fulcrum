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
    name: 'fake',
    path: '/fake/SKILL.md',
    frontmatter: { name: 'fake', description: 'fake skill' },
    body: 'fake body',
    raw: '---\nname: fake\ndescription: fake skill\n---\n\nfake body\n',
    ...overrides,
  }
}

function commonIdentityAssertions(name: string, result: EmitResult, source: CanonicalSource) {
  it(`${name}: one artifact per canonical skill`, () => {
    expect(result.artifacts.length).toBe(source.skills.length)
    expect(result.artifacts.length).toBe(33)
  })
  it(`${name}: preserves canonical body byte-for-byte (AD-6)`, () => {
    for (const skill of source.skills) {
      const artifact = result.artifacts.find((a) => a.sourceSkillName === skill.name)
      expect(artifact).toBeDefined()
      expect(matter(artifact!.contents).content.trim()).toBe(skill.body)
    }
  })
  it(`${name}: does not drop or concat any skill`, () => {
    const canonicalNames = source.skills.map((s) => s.name).sort()
    const emittedNames = result.artifacts.map((a) => a.sourceSkillName!).sort()
    expect(emittedNames).toEqual(canonicalNames)
  })
}

describe('emitOpencode', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })
  const result = emitOpencode(source)
  it('targets opencode', () => expect(result.target).toBe('opencode'))
  it('routes to .opencode/agents/fulcrum-skill-<name>.md', () => {
    expect(
      result.artifacts.find((a) => a.sourceSkillName === 'heartbeat')?.path,
    ).toBe('.opencode/agents/fulcrum-skill-heartbeat.md')
  })
  it('marks mode:subagent + hidden:true', () => {
    for (const artifact of result.artifacts) {
      const parsed = matter(artifact.contents)
      expect(parsed.data.mode).toBe('subagent')
      expect(parsed.data.hidden).toBe(true)
      expect(parsed.data.name).toBe(`fulcrum-skill-${artifact.sourceSkillName}`)
    }
  })
  it('narrows non-string description to empty string', () => {
    const res = emitOpencode({ skills: [fakeSkill({ frontmatter: { description: { nested: 'oops' } } })] })
    expect(matter(res.artifacts[0]!.contents).data.description).toBe('')
  })
  commonIdentityAssertions('opencode', result, source)
})

describe('emitCopilot', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })
  const result = emitCopilot(source)
  it('targets copilot', () => expect(result.target).toBe('copilot'))
  it('routes to .github/instructions/fulcrum-skill-<name>.instructions.md', () => {
    expect(
      result.artifacts.find((a) => a.sourceSkillName === 'heartbeat')?.path,
    ).toBe('.github/instructions/fulcrum-skill-heartbeat.instructions.md')
  })
  it('sets applyTo:"**"', () => {
    for (const artifact of result.artifacts) {
      expect(matter(artifact.contents).data.applyTo).toBe('**')
    }
  })
  commonIdentityAssertions('copilot', result, source)
})

describe('emitCursor', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })
  const result = emitCursor(source)
  it('targets cursor', () => expect(result.target).toBe('cursor'))
  it('routes to .cursor/rules/fulcrum-skill-<name>.mdc', () => {
    expect(
      result.artifacts.find((a) => a.sourceSkillName === 'heartbeat')?.path,
    ).toBe('.cursor/rules/fulcrum-skill-heartbeat.mdc')
  })
  it('sets alwaysApply:false', () => {
    for (const artifact of result.artifacts) {
      expect(matter(artifact.contents).data.alwaysApply).toBe(false)
    }
  })
  commonIdentityAssertions('cursor', result, source)
})

describe('emitWindsurf', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })
  const result = emitWindsurf(source)
  it('targets windsurf', () => expect(result.target).toBe('windsurf'))
  it('routes to .windsurf/rules/fulcrum-skill-<name>.md', () => {
    expect(
      result.artifacts.find((a) => a.sourceSkillName === 'heartbeat')?.path,
    ).toBe('.windsurf/rules/fulcrum-skill-heartbeat.md')
  })
  it('sets trigger:model_decision', () => {
    for (const artifact of result.artifacts) {
      expect(matter(artifact.contents).data.trigger).toBe('model_decision')
    }
  })
  it('every canonical skill fits within the 12000-byte budget', () => {
    for (const artifact of result.artifacts) {
      expect(Buffer.byteLength(artifact.contents, 'utf8')).toBeLessThanOrEqual(WINDSURF_MAX_BYTES)
    }
  })
  it('WINDSURF_MAX_BYTES is 12000', () => {
    expect(WINDSURF_MAX_BYTES).toBe(12000)
  })

  function bodyForBytes(targetBytes: number, headroom = 0): string {
    // Pick a body length such that emitted contents (frontmatter + body + trailing \n)
    // equals targetBytes + headroom. Frontmatter overhead for this fixture is
    // measured empirically: 'frontmatter + body + \n' where body = 'A'.repeat(n).
    return 'A'.repeat(Math.max(targetBytes + headroom, 0))
  }
  function emitOne(body: string) {
    return emitWindsurf({
      skills: [
        {
          name: 'boundary',
          path: '/x/SKILL.md',
          frontmatter: { description: 'x' },
          body,
          raw: '---\ndescription: x\n---\n\n' + body + '\n',
        },
      ],
    })
  }

  it('throws WindsurfSizeError when byteLength > 12000 (boundary)', () => {
    // Build a body guaranteed to push contents over 12000 bytes.
    expect(() => emitOne(bodyForBytes(13000))).toThrow(WindsurfSizeError)
  })
  it('accepts contents with byteLength <= 12000 (boundary)', () => {
    // A short body keeps contents well below 12000 bytes.
    expect(() => emitOne('small body')).not.toThrow()
  })
  it('computes byteLength via Buffer.byteLength (multi-byte UTF-8 aware)', () => {
    // 'あ' = 3 UTF-8 bytes. 4001 copies = 12003 body bytes, which alone would
    // exceed the 12000 limit once frontmatter adds overhead.
    expect(() => emitOne('あ'.repeat(4001))).toThrow(WindsurfSizeError)
  })
  it('WindsurfSizeError carries the offending skill name and byte length', () => {
    try {
      emitOne(bodyForBytes(13000))
    } catch (error) {
      expect(error).toBeInstanceOf(WindsurfSizeError)
      const typed = error as WindsurfSizeError
      expect(typed.skillName).toBe('boundary')
      expect(typed.byteLength).toBeGreaterThan(WINDSURF_MAX_BYTES)
      return
    }
    throw new Error('expected WindsurfSizeError')
  })

  commonIdentityAssertions('windsurf', result, source)
})
