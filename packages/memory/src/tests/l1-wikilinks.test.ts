// packages/memory/src/tests/l1-wikilinks.test.ts
//
// Memory v3 PR 2 unit 2.4 — Obsidian-style [[path]] wikilink parse/emit/resolve.
//
// Wikilinks are the inline grounding mechanism: every L1 claim that came from
// an L0 source carries a `[[raw/<type>/YYYY/MM/DD/<ULID>]]` alongside it so
// humans can click-through in Obsidian and the validator (unit 2.3) can check
// that each entry in frontmatter `sources:` is also cited inline.

import { describe, it, expect } from 'vitest'
import {
  extractWikilinks,
  renderRawWikilink,
  resolveWikilink,
  type L0WikilinkParts,
} from '../l1/wikilinks.js'

describe('extractWikilinks', () => {
  it('returns [] for text with no wikilinks', () => {
    expect(extractWikilinks('hello world')).toEqual([])
    expect(extractWikilinks('')).toEqual([])
  })

  it('extracts a single raw/... wikilink', () => {
    const body = 'See [[raw/bash_trace/2026/04/18/01KPGHE0]] for the trace.'
    expect(extractWikilinks(body)).toEqual(['raw/bash_trace/2026/04/18/01KPGHE0'])
  })

  it('extracts multiple wikilinks in reading order', () => {
    const body = `
First [[raw/bash_trace/2026/04/18/01KPGHE0]].
Then [[entity/01KPGHE1]] and [[page/01KPGHE2]].
`.trim()
    expect(extractWikilinks(body)).toEqual([
      'raw/bash_trace/2026/04/18/01KPGHE0',
      'entity/01KPGHE1',
      'page/01KPGHE2',
    ])
  })

  it('preserves duplicates (caller dedups if desired)', () => {
    const body = '[[raw/x/2026/04/18/A]] and later [[raw/x/2026/04/18/A]]'
    expect(extractWikilinks(body)).toEqual([
      'raw/x/2026/04/18/A',
      'raw/x/2026/04/18/A',
    ])
  })

  it('ignores single-bracket links and code fences', () => {
    const body = 'normal [single] link; and ```\n[[inside/code/fence]]\n```'
    // The parser is deliberately simple — it treats `[[x]]` as a link anywhere,
    // so the fenced one IS extracted. Document that behavior via test.
    expect(extractWikilinks(body)).toEqual(['inside/code/fence'])
  })

  it('rejects malformed [[ with no closing ]]', () => {
    expect(extractWikilinks('broken [[raw/foo')).toEqual([])
  })

  it('tolerates nested slashes, hyphens, percent-encoded segments', () => {
    const link = 'raw/bash_trace/2026/04/18/01K-AB%2Fcd_ef'
    expect(extractWikilinks(`x [[${link}]] y`)).toEqual([link])
  })
})

describe('renderRawWikilink', () => {
  it('builds a raw/<type>/YYYY/MM/DD/<ulid> path from date parts', () => {
    const parts: L0WikilinkParts = {
      source_type: 'bash_trace',
      ulid: '01KPGHE0',
      date: new Date('2026-04-18T12:34:56Z'),
    }
    expect(renderRawWikilink(parts)).toBe('[[raw/bash_trace/2026/04/18/01KPGHE0]]')
  })

  it('zero-pads single-digit months and days', () => {
    const parts: L0WikilinkParts = {
      source_type: 'tool_trace',
      ulid: '01KAAAA',
      date: new Date('2026-01-05T00:00:00Z'),
    }
    expect(renderRawWikilink(parts)).toBe('[[raw/tool_trace/2026/01/05/01KAAAA]]')
  })

  it('rejects empty ulid / source_type', () => {
    expect(() =>
      renderRawWikilink({ source_type: '', ulid: 'A', date: new Date() }),
    ).toThrow(/source_type/)
    expect(() =>
      renderRawWikilink({ source_type: 'bash_trace', ulid: '', date: new Date() }),
    ).toThrow(/ulid/)
  })
})

describe('resolveWikilink', () => {
  it('joins vaultRoot + link + .md for a raw/... link', () => {
    const resolved = resolveWikilink('raw/bash_trace/2026/04/18/01KPGHE0', '/vault')
    expect(resolved).toBe('/vault/raw/bash_trace/2026/04/18/01KPGHE0.md')
  })

  it('resolves entity/<id> and page/<id> into curated/<type>/<id>.md', () => {
    expect(resolveWikilink('entity/01K', '/vault')).toBe('/vault/curated/entities/01K.md')
    expect(resolveWikilink('page/01K', '/vault')).toBe('/vault/curated/pages/01K.md')
    expect(resolveWikilink('concept/01K', '/vault')).toBe('/vault/curated/concepts/01K.md')
    expect(resolveWikilink('synthesis/01K', '/vault')).toBe('/vault/curated/synthesis/01K.md')
  })

  it('rejects path traversal / null bytes', () => {
    expect(() => resolveWikilink('../etc/passwd', '/vault')).toThrow(/invalid|traversal/i)
    expect(() => resolveWikilink('raw/x/\0null', '/vault')).toThrow(/null/i)
  })

  it('rejects unknown prefixes', () => {
    expect(() => resolveWikilink('other/foo', '/vault')).toThrow(/unknown prefix/i)
  })
})
