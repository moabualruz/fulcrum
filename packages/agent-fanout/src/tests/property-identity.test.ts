import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import matter from 'gray-matter'
import { parseCanonicalSource } from '../parse.js'
import { emitClaude } from '../emit/claude.js'
import { emitPi } from '../emit/pi.js'
import { emitCodex } from '../emit/codex.js'
import { emitGemini } from '../emit/gemini.js'
import { emitOpencode } from '../emit/opencode.js'
import { emitCopilot } from '../emit/copilot.js'
import { emitCursor } from '../emit/cursor.js'
import { emitWindsurf } from '../emit/windsurf.js'
import type { AgentTarget, CanonicalSource, EmitResult } from '../types.js'
import { ALL_TARGETS } from '../types.js'

const here = dirname(fileURLToPath(import.meta.url))
const agentIntegrationRoot = join(here, '..', '..', '..', '..', 'agent-integration')

type Emitter = (source: CanonicalSource) => EmitResult

const emitters: Array<{
  target: AgentTarget
  emit: Emitter
  expectedSkillCount: (n: number) => number
  expectedRuleCount: (n: number) => number
  preservesSkillBody: boolean
}> = [
  { target: 'claude',   emit: emitClaude,   expectedSkillCount: (n) => n, expectedRuleCount: (n) => n, preservesSkillBody: true },
  { target: 'pi',       emit: emitPi,       expectedSkillCount: () => 0, expectedRuleCount: (n) => n, preservesSkillBody: false },
  { target: 'codex',    emit: emitCodex,    expectedSkillCount: (n) => n, expectedRuleCount: (n) => n, preservesSkillBody: true },
  { target: 'gemini',   emit: emitGemini,   expectedSkillCount: (n) => n, expectedRuleCount: (n) => n, preservesSkillBody: true },
  { target: 'opencode', emit: emitOpencode, expectedSkillCount: (n) => n, expectedRuleCount: (n) => n, preservesSkillBody: true },
  { target: 'copilot',  emit: emitCopilot,  expectedSkillCount: (n) => n, expectedRuleCount: (n) => n, preservesSkillBody: true },
  { target: 'cursor',   emit: emitCursor,   expectedSkillCount: (n) => n, expectedRuleCount: (n) => n, preservesSkillBody: true },
  { target: 'windsurf', emit: emitWindsurf, expectedSkillCount: (n) => n, expectedRuleCount: (n) => n, preservesSkillBody: true },
]

describe('emitters cover every AgentTarget', () => {
  it('every ALL_TARGETS value has a corresponding emitter', () => {
    const covered = emitters.map((e) => e.target).sort()
    expect(covered).toEqual([...ALL_TARGETS].sort())
  })
})

describe('AD-6 per-skill + per-rule identity — unified across all 8 emit targets', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })

  for (const { target, emit, expectedSkillCount, expectedRuleCount, preservesSkillBody } of emitters) {
    describe(target, () => {
      const result = emit(source)
      const skillArtifacts = result.artifacts.filter((a) => a.sourceSkillName)
      const ruleArtifacts = result.artifacts.filter((a) => a.sourceRuleName)
      const expectedSkills = expectedSkillCount(source.skills.length)
      const expectedRules = expectedRuleCount(source.rules.length)

      it(`emits ${expectedSkills} skill + ${expectedRules} rule artifacts`, () => {
        expect(skillArtifacts.length).toBe(expectedSkills)
        expect(ruleArtifacts.length).toBe(expectedRules)
      })

      it('maps skill artifacts 1:1 to canonical skills', () => {
        if (expectedSkills === 0) return
        expect(skillArtifacts.map((a) => a.sourceSkillName!).sort()).toEqual(
          source.skills.map((s) => s.name).sort(),
        )
      })

      it('maps rule artifacts 1:1 to canonical rules', () => {
        if (expectedRules === 0) return
        expect(ruleArtifacts.map((a) => a.sourceRuleName!).sort()).toEqual(
          source.rules.map((r) => r.name).sort(),
        )
      })

      it('every emitted sourceSkillName corresponds to a real canonical skill', () => {
        for (const artifact of skillArtifacts) {
          expect(source.skills.find((s) => s.name === artifact.sourceSkillName!)).toBeDefined()
        }
      })

      it('every emitted sourceRuleName corresponds to a real canonical rule', () => {
        for (const artifact of ruleArtifacts) {
          expect(source.rules.find((r) => r.name === artifact.sourceRuleName!)).toBeDefined()
        }
      })

      it('artifact paths are unique within the target', () => {
        const paths = result.artifacts.map((a) => a.path)
        expect(new Set(paths).size).toBe(paths.length)
      })

      if (preservesSkillBody) {
        it('preserves canonical skill body byte-for-byte', () => {
          for (const skill of source.skills) {
            const artifact = skillArtifacts.find((a) => a.sourceSkillName === skill.name)
            expect(matter(artifact!.contents).content.trim()).toBe(skill.body)
          }
        })
      }
    })
  }
})

describe('determinism — same input yields the same output', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })

  for (const { target, emit } of emitters) {
    it(`${target}: emit(source) is structurally equal across calls`, () => {
      expect(emit(source)).toEqual(emit(source))
    })
    it(`${target}: artifact contents are byte-identical across calls`, () => {
      const a = emit(source).artifacts.map((x) => x.contents).join('\x00')
      const b = emit(source).artifacts.map((x) => x.contents).join('\x00')
      expect(b).toBe(a)
    })
  }
})

describe('emit does not mutate the canonical source', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })
  const snapshot = JSON.stringify({
    skills: source.skills.map((s) => ({ name: s.name, body: s.body, raw: s.raw })),
    rules: source.rules.map((r) => ({ name: r.name, body: r.body, raw: r.raw })),
  })
  for (const { target, emit } of emitters) {
    it(`${target}`, () => {
      emit(source)
      const after = JSON.stringify({
        skills: source.skills.map((s) => ({ name: s.name, body: s.body, raw: s.raw })),
        rules: source.rules.map((r) => ({ name: r.name, body: r.body, raw: r.raw })),
      })
      expect(after).toBe(snapshot)
    })
  }
})
