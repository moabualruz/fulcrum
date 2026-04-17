import { describe, it, expect } from 'vitest'
import { runLongMemEval, splitCorpus } from '../harness.js'
import type { LmeEntry, LmeEvalResult } from '../harness.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── Split helper ──────────────────────────────────────────────────────────────

describe('splitCorpus', () => {
  it('returns 50/450 split from 500-entry corpus', () => {
    const entries: LmeEntry[] = Array.from({ length: 500 }, (_, i) => ({
      id: `q${i}`,
      question: `question ${i}`,
      expected_answer: `answer ${i}`,
      sessions: [],
    }))
    const { dev, test } = splitCorpus(entries, 50)
    expect(dev).toHaveLength(50)
    expect(test).toHaveLength(450)
  })

  it('dev and test are disjoint', () => {
    const entries: LmeEntry[] = Array.from({ length: 100 }, (_, i) => ({
      id: `q${i}`,
      question: `question ${i}`,
      expected_answer: `answer ${i}`,
      sessions: [],
    }))
    const { dev, test } = splitCorpus(entries, 20)
    const devIds = new Set(dev.map(e => e.id))
    for (const e of test) expect(devIds.has(e.id)).toBe(false)
  })
})

// ── Harness integration ───────────────────────────────────────────────────────

describe('runLongMemEval', () => {
  const mockEntries: LmeEntry[] = [
    { id: 'q1', question: 'auth decision', expected_answer: 'rewrite', sessions: [] },
    { id: 'q2', question: 'schema migration', expected_answer: 'safe', sessions: [] },
    { id: 'q3', question: 'task synthesis', expected_answer: 'outcome', sessions: [] },
  ]

  const perfectAnswerer = async (_q: string) => 'correct_answer'
  const emptyAnswerer = async (_q: string) => ''

  it('returns shape-stable LmeEvalResult labeled as conversational-memory benchmark', async () => {
    const result: LmeEvalResult = await runLongMemEval(mockEntries, perfectAnswerer)
    expect(result).toHaveProperty('benchmark_label')
    expect(result.benchmark_label).toBe('conversational-memory benchmark')
    expect(result).toHaveProperty('r_at_5')
    expect(result).toHaveProperty('mrr')
    expect(result).toHaveProperty('total_queries')
    expect(result).toHaveProperty('signal_type')
    expect(result.signal_type).toBe('secondary')
  })

  it('total_queries equals entries length', async () => {
    const result = await runLongMemEval(mockEntries, perfectAnswerer)
    expect(result.total_queries).toBe(3)
  })

  it('answerer receiving empty string produces 0 accuracy', async () => {
    const result = await runLongMemEval(mockEntries, emptyAnswerer)
    expect(result.exact_match).toBe(0)
  })

  it('lme_split_50_450.json exists and has ≥1 entries', () => {
    const splitPath = join(
      new URL('.', import.meta.url).pathname,
      '../lme_split_50_450.json'
    )
    const raw = readFileSync(splitPath, 'utf8')
    const data = JSON.parse(raw)
    expect(data).toHaveProperty('dev')
    expect(data).toHaveProperty('test')
    expect(Array.isArray(data.dev)).toBe(true)
    expect(Array.isArray(data.test)).toBe(true)
    expect(data.dev.length + data.test.length).toBeGreaterThanOrEqual(1)
  })
})
