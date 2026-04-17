import { describe, it, expect } from 'vitest'
import {
  toDecayLambda,
  calculateTemporalDecayMultiplier,
  applyTemporalDecayToScore,
  applyTemporalDecayToHybridResults,
  DEFAULT_TEMPORAL_DECAY_CONFIG,
} from '../scoring/temporal-decay.js'

describe('temporal-decay primitives — v2a Task 7 (lift)', () => {
  it('toDecayLambda: returns 0 for non-positive or non-finite inputs', () => {
    expect(toDecayLambda(0)).toBe(0)
    expect(toDecayLambda(-5)).toBe(0)
    expect(toDecayLambda(Number.NaN)).toBe(0)
    expect(toDecayLambda(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('toDecayLambda: returns ln(2)/halfLifeDays for valid input', () => {
    expect(toDecayLambda(7)).toBeCloseTo(Math.LN2 / 7, 10)
  })

  it('calculateTemporalDecayMultiplier: returns 1 at age 0', () => {
    expect(calculateTemporalDecayMultiplier({ ageInDays: 0, halfLifeDays: 30 })).toBeCloseTo(1, 10)
  })

  it('calculateTemporalDecayMultiplier: returns 0.5 at age == halfLife', () => {
    expect(calculateTemporalDecayMultiplier({ ageInDays: 30, halfLifeDays: 30 })).toBeCloseTo(0.5, 5)
    expect(calculateTemporalDecayMultiplier({ ageInDays: 14, halfLifeDays: 14 })).toBeCloseTo(0.5, 5)
  })

  it('applyTemporalDecayToScore: scales the score by the decay multiplier', () => {
    expect(applyTemporalDecayToScore({ score: 0.8, ageInDays: 30, halfLifeDays: 30 })).toBeCloseTo(0.4, 5)
  })

  it('default config has decay disabled — applyTemporalDecayToHybridResults is a no-op', async () => {
    const results = [{ path: 'a.md', score: 0.9, source: 'memory' }]
    const out = await applyTemporalDecayToHybridResults({ results })
    expect(out).toEqual(results)
    expect(DEFAULT_TEMPORAL_DECAY_CONFIG.enabled).toBe(false)
  })

  it('parses dated memory paths via filename regex (e.g. memory/2026-01-15.md)', async () => {
    const results = [
      { path: 'memory/2026-01-15.md', score: 1.0, source: 'memory' },
    ]
    const nowMs = Date.UTC(2026, 1, 14) // 30 days after 2026-01-15
    const out = await applyTemporalDecayToHybridResults({
      results,
      temporalDecay: { enabled: true, halfLifeDays: 30 },
      nowMs,
    })
    expect(out[0]!.score).toBeCloseTo(0.5, 1)
  })

  it('treats MEMORY.md / memory.md as evergreen — does not decay', async () => {
    const results = [
      { path: 'MEMORY.md', score: 1.0, source: 'memory' },
      { path: 'memory/topics/core.md', score: 1.0, source: 'memory' },
    ]
    const out = await applyTemporalDecayToHybridResults({
      results,
      temporalDecay: { enabled: true, halfLifeDays: 1 },
      nowMs: Date.UTC(2030, 0, 1),
    })
    expect(out[0]!.score).toBe(1.0)
    expect(out[1]!.score).toBe(1.0)
  })
})
