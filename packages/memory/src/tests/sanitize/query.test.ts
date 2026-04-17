import { describe, it, expect } from 'vitest'
import { sanitizeQuery } from '../../sanitize/query.js'

describe('sanitizeQuery — v2a PR 5 Task 27', () => {
  it('passthrough for short clean queries', () => {
    expect(sanitizeQuery('what is fulcrum')).toBe('what is fulcrum')
  })

  it('extracts trailing question when assistant-output markers detected', () => {
    const q = `assistant: here is the prior context\nuser: what is the auth flow?`
    expect(sanitizeQuery(q)).toBe('what is the auth flow?')
  })

  it('falls back to the tail sentence when no question is present', () => {
    const q = 'a'.repeat(300) + '. The actual content of interest is here.'
    expect(sanitizeQuery(q)).toContain('The actual content')
  })

  it('hard-cap truncates from the tail when nothing else helps', () => {
    const q = 'x'.repeat(2000)
    const out = sanitizeQuery(q)
    expect(out.length).toBeLessThanOrEqual(800)
  })

  it('returns empty string for empty input', () => {
    expect(sanitizeQuery('')).toBe('')
  })

  it('handles assistant-output markers like <|assistant|>', () => {
    const q = `<|assistant|> some preamble\nWhat is the recall envelope shape?`
    expect(sanitizeQuery(q)).toBe('What is the recall envelope shape?')
  })
})
