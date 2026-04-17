// v2b PR 10 Task 1.8 — v2b kind validator extension tests.

import { describe, it, expect } from 'vitest'
import { isAllowedKind, validateKind, V2B_KINDS } from '../validate-kind.js'

const V2B_KIND_LIST = [
  'entity',
  'edge',
  'agent_card',
  'policy_event',
  'external_ref',
  'git_commit',
  'git_branch',
  'git_pr',
  'git_tag',
  'agent_adapter',
  'artifact_contract',
  'notification_event',
]

describe('validateKind — v2b PR 10 Task 1.8', () => {
  it('exports V2B_KINDS constant with all 12 v2b kinds', () => {
    expect(V2B_KINDS).toBeDefined()
    for (const k of V2B_KIND_LIST) {
      expect(V2B_KINDS).toContain(k)
    }
  })

  it('accepts every v2b kind', () => {
    for (const k of V2B_KIND_LIST) {
      expect(() => validateKind(k)).not.toThrow()
      expect(isAllowedKind(k)).toBe(true)
    }
  })

  it('still rejects unknown kinds after v2b extension', () => {
    expect(() => validateKind('not_a_kind')).toThrow(/unknown memory kind/)
    expect(isAllowedKind('not_a_kind')).toBe(false)
  })
})
