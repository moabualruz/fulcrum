// v2b PR 11 Task 2.0 — fulcrum dream CLI tests.
// dream is operator-only: NOT in TOOL_REGISTRY; accessible as `fulcrum dream`.

import { describe, it, expect } from 'vitest'
import { TOOL_REGISTRY } from '../tool-registry.js'
import { runDream } from '../dream.js'

describe('fulcrum dream CLI — v2b PR 11 Task 2.0', () => {
  it('dream is NOT in the agent action surface (operator-only)', () => {
    expect(TOOL_REGISTRY.has('dream')).toBe(false)
    expect(TOOL_REGISTRY.has('fulcrum_dream')).toBe(false)
  })

  it('runDream is exported from dream.ts', () => {
    expect(typeof runDream).toBe('function')
  })

  it('runDream --phase=light runs without throwing (stub DB)', async () => {
    // Passes an in-memory stub — real DB wiring is integration-tested separately
    await expect(runDream(['--phase=light', '--dry-run'])).resolves.not.toThrow()
  })

  it('runDream with unknown phase rejects with usage error', async () => {
    await expect(runDream(['--phase=unknown'])).rejects.toThrow(/unknown phase/)
  })
})
