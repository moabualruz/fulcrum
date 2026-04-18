// packages/memory/src/tests/l1-curator-backend-pi.test.ts
//
// Memory v3 PR 3 unit 3.3 — pi backend stub.
//
// The pi CLI's non-interactive + structured-output mode is not yet stable
// enough for curator traffic (plan §L0→L1 curation pipeline Phase 3b). The
// backend slot still exists so the dispatcher fallback order (codex → pi →
// openai → anthropic) is discoverable, but `isAvailable()` is always false
// until a future PR wires the real subprocess shape.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { piBackend } from '../l1/curator-backend/pi.js'

let prevEnv: string | undefined

beforeEach(() => {
  prevEnv = process.env['FULCRUM_CURATOR_PI_ENABLED']
  delete process.env['FULCRUM_CURATOR_PI_ENABLED']
})

afterEach(() => {
  if (prevEnv === undefined) delete process.env['FULCRUM_CURATOR_PI_ENABLED']
  else process.env['FULCRUM_CURATOR_PI_ENABLED'] = prevEnv
})

describe('piBackend', () => {
  it('identifies as "pi"', () => {
    expect(piBackend.name).toBe('pi')
  })

  it('reports unavailable by default (non-interactive mode not yet stable)', async () => {
    expect(await piBackend.isAvailable()).toBe(false)
  })

  it('throws NotImplementedError with actionable guidance when curate() is called', async () => {
    await expect(
      piBackend.curate({
        task: 'extraction',
        model: 'gpt-5-mini',
        reasoning: 'minimal',
        prompt: '<task>x</task>',
        schema: { type: 'object' },
      }),
    ).rejects.toThrow(/pi.*stub|not.*implemented|FULCRUM_CURATOR_BACKEND/i)
  })
})
