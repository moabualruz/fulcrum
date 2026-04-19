import { describe, it, expect } from 'vitest'
import { isAllowedKind, validateKind, V2A_KINDS, LEGACY_KINDS } from '../validate-kind.js'

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

describe('PR 9.1 — applyKindCap / KIND_CAPS retired', () => {
  it('no longer exports applyKindCap or KIND_CAPS', async () => {
    const mod = (await import('../validate-kind.js')) as Record<string, unknown>
    expect(mod['applyKindCap']).toBeUndefined()
    expect(mod['KIND_CAPS']).toBeUndefined()
  })
})
