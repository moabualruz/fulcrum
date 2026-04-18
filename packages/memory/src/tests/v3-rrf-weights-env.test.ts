// packages/memory/src/tests/v3-rrf-weights-env.test.ts
//
// Memory v3 PR 5 unit 5.2 — RRF weights read from env.
//
// Three knobs:
//   FULCRUM_RRF_WS_FTS    (default 1.0)
//   FULCRUM_RRF_WS_VEC    (default 1.0)
//   FULCRUM_RRF_WS_GRAPH  (default 0.5)
//
// Behaviour pins:
//   * v3DefaultWeights() returns the env-overridden values at call time
//     (not at module load) so test setups can mutate process.env mid-run.
//   * Non-numeric / negative / NaN values fall back to the hardcoded
//     defaults (surface-safe — the operator gets the correct behaviour
//     rather than a stack trace).
//   * Explicit per-call `weights` override still wins.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { v3DefaultWeights } from '../retrieval/v3-search.js'

const ENV_KEYS = ['FULCRUM_RRF_WS_FTS', 'FULCRUM_RRF_WS_VEC', 'FULCRUM_RRF_WS_GRAPH'] as const

let prev: Record<string, string | undefined>

beforeEach(() => {
  prev = {}
  for (const k of ENV_KEYS) {
    prev[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (prev[k] === undefined) delete process.env[k]
    else process.env[k] = prev[k]
  }
})

describe('v3DefaultWeights (PR 5.2)', () => {
  it('returns hardcoded defaults when no env is set', () => {
    expect(v3DefaultWeights()).toEqual({ fts: 1.0, vec: 1.0, graph: 0.5 })
  })

  it('reads FULCRUM_RRF_WS_FTS / _VEC / _GRAPH from env', () => {
    process.env['FULCRUM_RRF_WS_FTS'] = '2.0'
    process.env['FULCRUM_RRF_WS_VEC'] = '0.75'
    process.env['FULCRUM_RRF_WS_GRAPH'] = '1.25'
    expect(v3DefaultWeights()).toEqual({ fts: 2.0, vec: 0.75, graph: 1.25 })
  })

  it('falls back on unparseable / negative / NaN env values', () => {
    process.env['FULCRUM_RRF_WS_FTS'] = 'abc'
    process.env['FULCRUM_RRF_WS_VEC'] = '-1'
    process.env['FULCRUM_RRF_WS_GRAPH'] = 'NaN'
    expect(v3DefaultWeights()).toEqual({ fts: 1.0, vec: 1.0, graph: 0.5 })
  })

  it('accepts zero as a valid weight (caller may want to silence a stage)', () => {
    process.env['FULCRUM_RRF_WS_GRAPH'] = '0'
    expect(v3DefaultWeights().graph).toBe(0)
  })

  it('re-reads env on each call (not cached at module load)', () => {
    expect(v3DefaultWeights().fts).toBe(1.0)
    process.env['FULCRUM_RRF_WS_FTS'] = '3.3'
    expect(v3DefaultWeights().fts).toBe(3.3)
    delete process.env['FULCRUM_RRF_WS_FTS']
    expect(v3DefaultWeights().fts).toBe(1.0)
  })
})
