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

const emitters: Array<{ target: AgentTarget; emit: Emitter; preservesBody: boolean; expectArtifacts: (n: number) => number }> = [
  { target: 'claude', emit: emitClaude, preservesBody: true, expectArtifacts: (n) => n },
  { target: 'pi', emit: emitPi, preservesBody: false, expectArtifacts: () => 0 },
  { target: 'codex', emit: emitCodex, preservesBody: true, expectArtifacts: (n) => n },
  { target: 'gemini', emit: emitGemini, preservesBody: true, expectArtifacts: (n) => n },
  { target: 'opencode', emit: emitOpencode, preservesBody: true, expectArtifacts: (n) => n },
  { target: 'copilot', emit: emitCopilot, preservesBody: true, expectArtifacts: (n) => n },
  { target: 'cursor', emit: emitCursor, preservesBody: true, expectArtifacts: (n) => n },
  { target: 'windsurf', emit: emitWindsurf, preservesBody: true, expectArtifacts: (n) => n },
]

describe('emitters cover every AgentTarget', () => {
  it('every ALL_TARGETS value has a corresponding emitter', () => {
    const covered = emitters.map((e) => e.target).sort()
    expect(covered).toEqual([...ALL_TARGETS].sort())
  })
})

describe('AD-6 per-skill identity property — unified across all 8 emit targets', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })

  for (const { target, emit, preservesBody, expectArtifacts } of emitters) {
    describe(target, () => {
      const result = emit(source)
      const expectedCount = expectArtifacts(source.skills.length)

      it(`emits exactly ${expectedCount} skill artifacts (no drop, no concat)`, () => {
        expect(result.artifacts.length).toBe(expectedCount)
      })

      it('maps artifacts 1:1 to canonical skills (if any emitted)', () => {
        if (expectedCount === 0) return
        const canonicalNames = source.skills.map((s) => s.name).sort()
        const emittedNames = result.artifacts.map((a) => a.sourceSkillName!).sort()
        expect(emittedNames).toEqual(canonicalNames)
      })

      it('every emitted sourceSkillName corresponds to a real canonical skill', () => {
        for (const artifact of result.artifacts) {
          if (!artifact.sourceSkillName) continue
          const canonical = source.skills.find((s) => s.name === artifact.sourceSkillName)
          expect(canonical, `ghost emit: ${target}:${artifact.sourceSkillName}`).toBeDefined()
        }
      })

      it('artifact paths are unique within the target (no clobber)', () => {
        const paths = result.artifacts.map((a) => a.path)
        expect(new Set(paths).size).toBe(paths.length)
      })

      if (preservesBody) {
        it('preserves canonical body byte-for-byte', () => {
          for (const skill of source.skills) {
            const artifact = result.artifacts.find((a) => a.sourceSkillName === skill.name)
            expect(artifact, `missing emit for ${target}:${skill.name}`).toBeDefined()
            const body = matter(artifact!.contents).content.trim()
            expect(body).toBe(skill.body)
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
      const first = emit(source)
      const second = emit(source)
      expect(second).toEqual(first)
    })
    it(`${target}: artifact contents are byte-identical across calls`, () => {
      const first = emit(source).artifacts.map((a) => a.contents).join('\x00')
      const second = emit(source).artifacts.map((a) => a.contents).join('\x00')
      expect(second).toBe(first)
    })
  }
})

describe('emit(parse) is pure — emitter does not mutate the canonical source', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })
  const snapshot = JSON.stringify(source.skills.map((s) => ({ name: s.name, body: s.body, raw: s.raw })))
  for (const { target, emit } of emitters) {
    it(`${target}`, () => {
      emit(source)
      const after = JSON.stringify(source.skills.map((s) => ({ name: s.name, body: s.body, raw: s.raw })))
      expect(after, `${target} mutated source`).toBe(snapshot)
    })
  }
})
