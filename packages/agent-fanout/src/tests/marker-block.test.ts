import { describe, expect, it } from 'vitest'
import { replaceMarkerBlock } from '../marker-block.js'

describe('replaceMarkerBlock', () => {
  it('inserts a fresh block when existing has no markers (end placement default)', () => {
    const r = replaceMarkerBlock({ existing: '# User Header\n\nuser body', managed: 'fulcrum content' })
    expect(r.replacedExisting).toBe(false)
    expect(r.contents).toMatch(/# User Header\n\nuser body/)
    expect(r.contents).toMatch(/<!-- BEGIN FULCRUM managed-block v1 -->\nfulcrum content\n<!-- END FULCRUM managed-block v1 -->/)
    const beginIdx = r.contents.indexOf('BEGIN FULCRUM')
    const userIdx = r.contents.indexOf('user body')
    expect(userIdx).toBeLessThan(beginIdx)
  })

  it('inserts at start when placement=start', () => {
    const r = replaceMarkerBlock({ existing: 'trailing user content', managed: 'M', placement: 'start' })
    expect(r.contents.indexOf('BEGIN FULCRUM')).toBeLessThan(r.contents.indexOf('trailing user content'))
  })

  it('replaces an existing managed block while preserving content outside', () => {
    const existing = [
      '# User owns this header',
      '',
      'user content above',
      '',
      '<!-- BEGIN FULCRUM managed-block v1 -->',
      'OLD fulcrum managed content',
      'second line',
      '<!-- END FULCRUM managed-block v1 -->',
      '',
      'user content below',
    ].join('\n')
    const r = replaceMarkerBlock({ existing, managed: 'NEW content' })
    expect(r.replacedExisting).toBe(true)
    expect(r.contents).toContain('# User owns this header')
    expect(r.contents).toContain('user content above')
    expect(r.contents).toContain('user content below')
    expect(r.contents).not.toContain('OLD fulcrum')
    expect(r.contents).toContain('NEW content')
  })

  it('is idempotent — replace twice with the same input yields the same output', () => {
    const existing = '# user\n\n<!-- BEGIN FULCRUM managed-block v1 -->\nold\n<!-- END FULCRUM managed-block v1 -->\n'
    const a = replaceMarkerBlock({ existing, managed: 'fresh' })
    const b = replaceMarkerBlock({ existing: a.contents, managed: 'fresh' })
    expect(b.contents).toBe(a.contents)
    expect(b.replacedExisting).toBe(true)
  })

  it('handles an empty input by emitting only the block', () => {
    const r = replaceMarkerBlock({ existing: '', managed: 'x' })
    expect(r.contents).toBe('<!-- BEGIN FULCRUM managed-block v1 -->\nx\n<!-- END FULCRUM managed-block v1 -->\n')
    expect(r.replacedExisting).toBe(false)
  })

  it('accepts a custom prefix', () => {
    const r = replaceMarkerBlock({ existing: 'pre', managed: 'inside', prefix: 'CUSTOM' })
    expect(r.contents).toContain('BEGIN CUSTOM managed-block v1')
    expect(r.contents).toContain('END CUSTOM managed-block v1')
  })

  it('normalizes trailing whitespace so repeated runs do not grow the file', () => {
    const first = replaceMarkerBlock({ existing: 'user\n\n\n\n', managed: 'x' })
    const second = replaceMarkerBlock({ existing: first.contents, managed: 'x' })
    expect(second.contents.match(/\n{4,}/)).toBeNull()
  })
})
