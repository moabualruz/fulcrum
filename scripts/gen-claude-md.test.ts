import { describe, it, expect } from 'vitest'
import {
  spliceSection,
  spliceToolCount,
  START_MARKER,
  END_MARKER,
  COUNT_START,
  COUNT_END,
} from './gen-claude-md.js'

// ── spliceSection ─────────────────────────────────────────────────────────────

describe('spliceSection', () => {
  const GENERATED = 'new content here'

  it('happy path: replaces content between markers when both present in order', () => {
    const original = `header\n\n${START_MARKER}\n\nold content\n\n${END_MARKER}\n\nfooter`
    const result = spliceSection(original, GENERATED)
    expect(result).toContain(GENERATED)
    expect(result).not.toContain('old content')
    expect(result).toContain('header')
    expect(result).toContain('footer')
  })

  it('first run (both markers absent): appends generated section at end', () => {
    const original = 'existing docs without markers'
    const result = spliceSection(original, GENERATED)
    expect(result).toContain(START_MARKER)
    expect(result).toContain(END_MARKER)
    expect(result).toContain(GENERATED)
    expect(result.indexOf(START_MARKER)).toBeLessThan(result.indexOf(END_MARKER))
    expect(result.startsWith('existing docs without markers')).toBe(true)
  })

  it('only START marker present (no END): returns original unchanged', () => {
    const original = `header\n${START_MARKER}\nno end marker`
    const result = spliceSection(original, GENERATED)
    expect(result).toBe(original)
    expect(result).not.toContain(GENERATED)
  })

  it('only END marker present (no START): returns original unchanged', () => {
    const original = `header\n${END_MARKER}\nno start marker`
    const result = spliceSection(original, GENERATED)
    expect(result).toBe(original)
    expect(result).not.toContain(GENERATED)
  })

  it('END precedes START (inverted): returns original unchanged without corrupting', () => {
    const original = `header\n\n${END_MARKER}\n\nmiddle\n\n${START_MARKER}\n\nfooter`
    const result = spliceSection(original, GENERATED)
    expect(result).toBe(original)
    expect(result).not.toContain(GENERATED)
    // critical: must NOT append duplicate markers
    expect(result.split(START_MARKER).length - 1).toBe(1)
    expect(result.split(END_MARKER).length - 1).toBe(1)
  })

  it('consecutive calls are idempotent (second call replaces, not appends)', () => {
    const original = 'no markers yet'
    const first = spliceSection(original, 'first content')
    const second = spliceSection(first, 'second content')
    expect(second).toContain('second content')
    expect(second).not.toContain('first content')
    // only one pair of markers
    expect(second.split(START_MARKER).length - 1).toBe(1)
    expect(second.split(END_MARKER).length - 1).toBe(1)
  })
})

// ── spliceToolCount ───────────────────────────────────────────────────────────

describe('spliceToolCount', () => {
  const makeCountBlock = (inner: string) =>
    `before\n${COUNT_START}${inner}${COUNT_END}\nafter`

  it('happy path: replaces count line when both markers present in order', () => {
    const original = makeCountBlock('\nold count line\n')
    const result = spliceToolCount(original, 23)
    expect(result).toContain('23 tools')
    expect(result).not.toContain('old count line')
    expect(result).toContain('before')
    expect(result).toContain('after')
  })

  it('missing markers: returns original unchanged', () => {
    const original = 'no count markers here'
    expect(spliceToolCount(original, 23)).toBe(original)
  })

  it('only COUNT_START present: returns original unchanged', () => {
    const original = `header\n${COUNT_START}\nno end`
    expect(spliceToolCount(original, 23)).toBe(original)
  })

  it('only COUNT_END present: returns original unchanged', () => {
    const original = `header\n${COUNT_END}\nno start`
    expect(spliceToolCount(original, 23)).toBe(original)
  })

  it('inverted markers: returns original unchanged', () => {
    const original = `before\n${COUNT_END}\nmiddle\n${COUNT_START}\nafter`
    expect(spliceToolCount(original, 23)).toBe(original)
  })
})
