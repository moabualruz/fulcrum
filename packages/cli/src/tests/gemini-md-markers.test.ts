// PR 7.6 — verify agent-integration/gemini/GEMINI.md carries a
// BEGIN/END FULCRUM managed-block v1 region containing the 3 canonical
// rules (fulcrum-first, lifecycle, role-boundaries). Emitted by the
// fanout script via replaceMarkerBlock.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const REPO_ROOT = join(import.meta.dirname ?? __dirname, '..', '..', '..', '..')
const geminiMd = join(REPO_ROOT, 'agent-integration', 'gemini', 'GEMINI.md')

describe('PR 7.6 GEMINI.md managed-block carries canonical rules', () => {
  it('has exactly one BEGIN FULCRUM managed-block v1 marker', () => {
    const body = readFileSync(geminiMd, 'utf8')
    const beginCount = (body.match(/BEGIN FULCRUM managed-block v1/g) ?? []).length
    const endCount = (body.match(/END FULCRUM managed-block v1/g) ?? []).length
    expect(beginCount).toBe(1)
    expect(endCount).toBe(1)
  })

  it('managed block contains text from all 3 canonical rules', () => {
    const body = readFileSync(geminiMd, 'utf8')
    const match = body.match(/BEGIN FULCRUM managed-block v1 -->([\s\S]*?)<!-- END FULCRUM managed-block v1/)
    expect(match).toBeTruthy()
    const managed = match![1] ?? ''
    expect(managed.toLowerCase()).toContain('fulcrum-first')
    expect(managed.toLowerCase()).toContain('lifecycle')
    expect(managed.toLowerCase()).toContain('role boundaries')
  })

  it('preserves user-owned content before/after the managed block', () => {
    const body = readFileSync(geminiMd, 'utf8')
    // The pre-existing GEMINI.md discusses MCP tools and URLs. Those lines
    // are outside the managed block and must survive regeneration.
    expect(body).toMatch(/# Fulcrum Agent OS — Gemini CLI Integration/)
    expect(body).toMatch(/http:\/\/localhost:4721/)
  })
})
