import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { parseCanonicalSource } from '../parse.js'
import { emitClaude } from '../emit/claude.js'
import { emitCodex } from '../emit/codex.js'
import { emitGemini } from '../emit/gemini.js'
import { emitOpencode } from '../emit/opencode.js'
import { emitCopilot } from '../emit/copilot.js'
import { emitCursor } from '../emit/cursor.js'
import { emitWindsurf } from '../emit/windsurf.js'
import type { AgentTarget, CanonicalSource, EmitResult } from '../types.js'

const here = dirname(fileURLToPath(import.meta.url))
const agentIntegrationRoot = join(here, '..', '..', '..', '..', 'agent-integration')
const fixturesRoot = join(here, '__fixtures__', 'golden')

// PI emits nothing (no golden). The 7 non-empty emitters store representative
// artifacts as golden fixtures. Multiple canary skills catch shape drift the
// single-skill canary misses (long body, frontmatter-heavy, UTF-8 in body/fm).
// Regenerate with UPDATE_GOLDEN=1.
const canaries: Array<{ target: AgentTarget; emit: (s: CanonicalSource) => EmitResult }> = [
  { target: 'claude', emit: emitClaude },
  { target: 'codex', emit: emitCodex },
  { target: 'gemini', emit: emitGemini },
  { target: 'opencode', emit: emitOpencode },
  { target: 'copilot', emit: emitCopilot },
  { target: 'cursor', emit: emitCursor },
  { target: 'windsurf', emit: emitWindsurf },
]

const CANARY_SKILLS = ['heartbeat', 'recall-before-writing', 'write-decision']

describe('drift canary — 3 canary skills × 7 emitters', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })

  for (const { target, emit } of canaries) {
    const result = emit(source)
    for (const canarySkill of CANARY_SKILLS) {
      it(`${target}/${canarySkill}: bitwise-matches the committed golden`, () => {
        const artifact = result.artifacts.find((a) => a.sourceSkillName === canarySkill)
        expect(artifact, `${target} dropped canary ${canarySkill}`).toBeDefined()

        const fixturePath = join(fixturesRoot, `${target}-${canarySkill}.golden.md`)

        if (process.env.UPDATE_GOLDEN === '1') {
          mkdirSync(dirname(fixturePath), { recursive: true })
          writeFileSync(fixturePath, artifact!.contents, 'utf8')
          return
        }

        expect(existsSync(fixturePath), `missing fixture ${fixturePath} — run UPDATE_GOLDEN=1`).toBe(true)
        const golden = readFileSync(fixturePath, 'utf8')
        expect(artifact!.contents).toBe(golden)
      })
    }
  }
})
