// packages/memory/src/tests/scoring.test.ts
import { describe, it, expect } from 'vitest'
import { computeImportance, computeFreshness, rrfScore } from '../scoring.js'

describe('computeImportance', () => {
  it('returns 0 for all-zero inputs', () => {
    expect(computeImportance({ access_count: 0, confidence: 0, entity_link_count: 0 })).toBe(0)
  })

  it('returns 1 for fully saturated inputs', () => {
    const score = computeImportance({ access_count: 100, confidence: 1, entity_link_count: 10 })
    expect(score).toBeCloseTo(1.0, 5)
  })

  it('caps access_count at 100 (access_count=200 same as 100)', () => {
    const a = computeImportance({ access_count: 100, confidence: 0.5, entity_link_count: 5 })
    const b = computeImportance({ access_count: 200, confidence: 0.5, entity_link_count: 5 })
    expect(a).toBeCloseTo(b, 10)
  })

  it('caps entity_link_count at 10', () => {
    const a = computeImportance({ access_count: 50, confidence: 0.5, entity_link_count: 10 })
    const b = computeImportance({ access_count: 50, confidence: 0.5, entity_link_count: 20 })
    expect(a).toBeCloseTo(b, 10)
  })

  it('weights: access=0.3, entity=0.4, confidence=0.3', () => {
    // access=50 → 0.5*0.3=0.15; entity=5 → 0.5*0.4=0.20; confidence=0.5 → 0.5*0.3=0.15
    const score = computeImportance({ access_count: 50, confidence: 0.5, entity_link_count: 5 })
    expect(score).toBeCloseTo(0.5, 5)
  })
})

describe('computeFreshness', () => {
  it('returns 1 for a just-updated record (now)', () => {
    const now = new Date().toISOString()
    expect(computeFreshness(now)).toBeCloseTo(1.0, 1)
  })

  it('returns 0 for a record updated 90+ days ago', () => {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString()
    expect(computeFreshness(ninetyDaysAgo)).toBeCloseTo(0, 1)
  })

  it('returns ~0.5 for a record updated 45 days ago', () => {
    const fortyFiveDaysAgo = new Date(Date.now() - 45 * 86_400_000).toISOString()
    expect(computeFreshness(fortyFiveDaysAgo)).toBeCloseTo(0.5, 1)
  })

  it('never returns a negative value', () => {
    const veryOld = new Date(Date.now() - 365 * 86_400_000).toISOString()
    expect(computeFreshness(veryOld)).toBeGreaterThanOrEqual(0)
  })
})

describe('rrfScore', () => {
  it('k=60: both ranks 1 gives 2/(60+1) ≈ 0.03279', () => {
    expect(rrfScore(1, 1)).toBeCloseTo(2 / 61, 5)
  })

  it('null fts rank uses penalty rank 1000', () => {
    const withFts = rrfScore(1, null)
    const penalty = 1 / (60 + 1000)
    expect(withFts).toBeCloseTo(1 / 61 + penalty, 10)
  })

  it('null vector rank uses penalty rank 1000', () => {
    const withVec = rrfScore(null, 1)
    const penalty = 1 / (60 + 1000)
    expect(withVec).toBeCloseTo(penalty + 1 / 61, 10)
  })

  it('both null returns 2/(60+1000)', () => {
    expect(rrfScore(null, null)).toBeCloseTo(2 / 1060, 10)
  })

  it('lower rank (better match) produces higher score', () => {
    expect(rrfScore(1, 1)).toBeGreaterThan(rrfScore(10, 10))
  })
})
