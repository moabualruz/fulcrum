// packages/memory/src/tests/v3-flag.test.ts
//
// Memory v3 PR 5 unit 5.5 — `FULCRUM_MEMORY_V3` default flips to on.
//
// Behaviour pins:
//   * isMemoryV3Enabled() returns true when the env is unset (new default).
//   * Returns true for '1', 'true', 'on', 'yes' (case-insensitive).
//   * Returns false ONLY for '0', 'false', 'off', 'no' (case-insensitive).
//   * Anything else is treated as on — so `=1`, misspelled values, and
//     operator typos never silently downgrade recall.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isMemoryV3Enabled } from '../flags.js'

let prev: string | undefined

beforeEach(() => {
  prev = process.env['FULCRUM_MEMORY_V3']
  delete process.env['FULCRUM_MEMORY_V3']
})

afterEach(() => {
  if (prev === undefined) delete process.env['FULCRUM_MEMORY_V3']
  else process.env['FULCRUM_MEMORY_V3'] = prev
})

describe('isMemoryV3Enabled (PR 5.5)', () => {
  it('returns true when FULCRUM_MEMORY_V3 is unset (default on)', () => {
    expect(isMemoryV3Enabled()).toBe(true)
  })

  it.each(['1', 'true', 'TRUE', 'on', 'yes'])('returns true for "%s"', (val) => {
    process.env['FULCRUM_MEMORY_V3'] = val
    expect(isMemoryV3Enabled()).toBe(true)
  })

  it.each(['0', 'false', 'FALSE', 'off', 'no'])('returns false for "%s"', (val) => {
    process.env['FULCRUM_MEMORY_V3'] = val
    expect(isMemoryV3Enabled()).toBe(false)
  })

  it('returns true for ambiguous / misspelled values (fail-open on)', () => {
    process.env['FULCRUM_MEMORY_V3'] = 'maybe'
    expect(isMemoryV3Enabled()).toBe(true)
    process.env['FULCRUM_MEMORY_V3'] = 'enabled'
    expect(isMemoryV3Enabled()).toBe(true)
  })

  it('returns false for empty string (operator clearing the flag)', () => {
    process.env['FULCRUM_MEMORY_V3'] = ''
    expect(isMemoryV3Enabled()).toBe(true)
    // Empty env is equivalent to unset — default on.
  })
})
