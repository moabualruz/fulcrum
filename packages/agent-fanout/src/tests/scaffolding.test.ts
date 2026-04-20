import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { VERSION, ALL_TARGETS } from '../index.js'
import type {
  AgentTarget,
  CanonicalSkill,
  CanonicalSource,
  EmitArtifact,
  EmitResult,
} from '../index.js'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(
  readFileSync(join(here, '..', '..', 'package.json'), 'utf8'),
) as { version: string }

describe('fulcrum-agent-fanout scaffolding', () => {
  it('VERSION matches package.json version', () => {
    expect(VERSION).toBe(pkg.version)
  })

  it('exposes the canonical type surface', () => {
    const skill: CanonicalSkill = {
      name: 'x', path: '/x', frontmatter: {}, body: '', raw: '',
    }
    const source: CanonicalSource = { skills: [skill] }
    const artifact: EmitArtifact = { path: '/out', contents: '' }
    const target: AgentTarget = 'claude'
    const result: EmitResult = { target, artifacts: [artifact] }
    expect(source.skills).toHaveLength(1)
    expect(result.artifacts[0]?.path).toBe('/out')
  })

  it('ALL_TARGETS enumerates 8 canonical agent targets', () => {
    expect(ALL_TARGETS).toEqual([
      'claude', 'codex', 'gemini', 'opencode', 'pi', 'copilot', 'cursor', 'windsurf',
    ])
    expect(ALL_TARGETS).toHaveLength(8)
  })
})
