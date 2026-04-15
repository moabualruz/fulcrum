// packages/memory/src/tests/scoring.test.ts
import { describe, it, expect } from 'vitest'
import { computeImportance, computeFreshness, rrfScore, recallScore } from '../scoring.js'

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

  it('returns ~0.55 for a record updated 90 days ago (exponential, not linear)', () => {
    // Formula: 0.1 + 0.9 * exp(-90/130) ≈ 0.1 + 0.9 * 0.4994 ≈ 0.549
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString()
    const value = computeFreshness(ninetyDaysAgo)
    expect(value).toBeGreaterThan(0.4)
    expect(value).toBeLessThan(0.7)
  })

  it('returns ~0.74 for a record updated 45 days ago', () => {
    // Formula: 0.1 + 0.9 * exp(-45/130) ≈ 0.1 + 0.9 * 0.707 ≈ 0.736
    const fortyFiveDaysAgo = new Date(Date.now() - 45 * 86_400_000).toISOString()
    const value = computeFreshness(fortyFiveDaysAgo)
    expect(value).toBeGreaterThan(0.65)
    expect(value).toBeLessThan(0.85)
  })

  it('never returns below 0.1 even for very old records (asymptote)', () => {
    const veryOld = new Date(Date.now() - 365 * 86_400_000).toISOString()
    expect(computeFreshness(veryOld)).toBeGreaterThanOrEqual(0.1)
  })

  it('strictly decreases as the record gets older', () => {
    const fresh = computeFreshness(new Date(Date.now() - 1 * 86_400_000).toISOString())
    const medium = computeFreshness(new Date(Date.now() - 60 * 86_400_000).toISOString())
    const old = computeFreshness(new Date(Date.now() - 200 * 86_400_000).toISOString())
    expect(fresh).toBeGreaterThan(medium)
    expect(medium).toBeGreaterThan(old)
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

describe('recallScore', () => {
  it('freshness=1.0 leaves score unchanged relative to rrfScore', () => {
    const base = rrfScore(1, 1)
    expect(recallScore(1, 1, 1.0)).toBeCloseTo(base, 10)
  })

  it('freshness=0.5 halves the score', () => {
    const base = rrfScore(1, 1)
    expect(recallScore(1, 1, 0.5)).toBeCloseTo(base * 0.5, 10)
  })

  it('memory with freshness=0.5 scores lower than one with freshness=1.0 at equal semantic ranks', () => {
    const fresh = recallScore(3, 3, 1.0)
    const stale = recallScore(3, 3, 0.5)
    expect(fresh).toBeGreaterThan(stale)
  })

  it('freshness=0 zeroes out the score', () => {
    expect(recallScore(1, 1, 0)).toBe(0)
  })
})
