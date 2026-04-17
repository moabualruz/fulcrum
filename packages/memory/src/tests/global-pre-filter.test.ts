// v2b PR 12 Task 3.4 — global pointer pre-filter tests.

import { describe, it, expect, vi } from 'vitest'
import { checkGlobalPointer, type GlobalPointerLine } from '../recall-global-pointer.js'

function makeLines(topics: string[]): GlobalPointerLine[] {
  return topics.map((topic, i) => ({
    topic,
    entities: `entity_${i}`,
    kind: 'decision',
    slug: `slug_${i}`,
    workspaceProject: `ws1/proj1`,
    score: 0.9,
  }))
}

describe('global pointer pre-filter — v2b PR 12 Task 3.4', () => {
  it('returns matched lines when query matches pointer topics', () => {
    const lines = makeLines(['machine learning pipeline', 'database schema design', 'auth strategy'])
    const result = checkGlobalPointer(lines, 'machine learning')
    expect(result.matched).toBe(true)
    expect(result.hits.length).toBeGreaterThan(0)
  })

  it('returns no_pointer_match when query does not match any topic', () => {
    const lines = makeLines(['machine learning pipeline'])
    const result = checkGlobalPointer(lines, 'unrelated quantum computing')
    expect(result.matched).toBe(false)
    expect(result.reason).toBe('no_pointer_match')
  })

  it('returns no_pointer_match when pointer is empty', () => {
    const result = checkGlobalPointer([], 'anything')
    expect(result.matched).toBe(false)
    expect(result.reason).toBe('no_pointer_match')
  })

  it('match is case-insensitive', () => {
    const lines = makeLines(['Database Schema Design'])
    const result = checkGlobalPointer(lines, 'database schema')
    expect(result.matched).toBe(true)
  })
})
