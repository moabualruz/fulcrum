import { describe, it, expect } from 'vitest'
import { isAllowedKind, validateKind, applyKindCap, V2A_KINDS, LEGACY_KINDS, KIND_CAPS } from '../validate-kind.js'

describe('validateKind — v2a Task 9', () => {
  it('accepts every v2a kind from §3.4', () => {
    for (const k of V2A_KINDS) {
      expect(() => validateKind(k)).not.toThrow()
      expect(isAllowedKind(k)).toBe(true)
    }
  })

  it('accepts every legacy kind from the v1 schema CHECK enum', () => {
    for (const k of LEGACY_KINDS) {
      expect(() => validateKind(k)).not.toThrow()
      expect(isAllowedKind(k)).toBe(true)
    }
  })

  it('rejects unknown kinds', () => {
    expect(() => validateKind('made_up')).toThrow(/unknown memory kind/)
    expect(() => validateKind('')).toThrow()
    expect(isAllowedKind('made_up')).toBe(false)
  })
})

describe('applyKindCap — v2a Task 9', () => {
  it('returns content unchanged when under or equal to the cap', () => {
    const cap = KIND_CAPS['file_patch']!
    const at = 'a'.repeat(cap)
    expect(applyKindCap('file_patch', at)).toBe(at)
    const under = 'a'.repeat(cap - 100)
    expect(applyKindCap('file_patch', under)).toBe(under)
  })

  it('truncates with marker when content exceeds the cap', () => {
    const cap = KIND_CAPS['bash_trace']! // 400
    const over = 'a'.repeat(cap + 250)
    const truncated = applyKindCap('bash_trace', over)
    expect(truncated).toMatch(/\[…truncated 250 chars\]$/)
    expect(truncated.startsWith('a'.repeat(cap))).toBe(true)
  })

  it('passes through kinds without a cap unchanged (e.g. legacy fact)', () => {
    const longFact = 'x'.repeat(50_000)
    expect(applyKindCap('fact', longFact)).toBe(longFact)
  })

  it('reports the correct dropped-chars count for a 1-char overflow', () => {
    const cap = KIND_CAPS['decision']!
    const over = 'a'.repeat(cap + 1)
    expect(applyKindCap('decision', over)).toMatch(/\[…truncated 1 chars\]$/)
  })

  it('every v2a kind has a cap defined', () => {
    for (const k of V2A_KINDS) {
      expect(KIND_CAPS[k], `cap missing for ${k}`).toBeDefined()
    }
  })
})
