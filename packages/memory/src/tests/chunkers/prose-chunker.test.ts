import { describe, it, expect } from 'vitest'
import { ProseChunker, detectProseKind } from '../../chunkers/prose-chunker.js'

describe('detectProseKind — v2a PR 3 Task 15', () => {
  it('routes by extension', () => {
    expect(detectProseKind('README.md')).toBe('markdown')
    expect(detectProseKind('CHANGELOG.MARKDOWN')).toBe('markdown')
    expect(detectProseKind('intro.mdx')).toBe('markdown')
    expect(detectProseKind('package.json')).toBe('json')
    expect(detectProseKind('tsconfig.jsonc')).toBe('json')
    expect(detectProseKind('docker-compose.yml')).toBe('yaml')
    expect(detectProseKind('config.YAML')).toBe('yaml')
    expect(detectProseKind('Cargo.toml')).toBe('toml')
    expect(detectProseKind('foo.ts')).toBeNull()
  })
})

describe('ProseChunker (markdown) — v2a PR 3 Task 15', () => {
  const chunker = new ProseChunker('markdown')

  it('returns single chunk for very small markdown', () => {
    const out = chunker.chunk('# Title\n\nShort body.')
    expect(out).toHaveLength(1)
    expect(out[0]!.kind).toBe('prose')
  })

  it('splits at headings when accumulated content reaches min size', () => {
    const big = 'a'.repeat(300)
    const src = `# H1\n\n${big}\n\n## H2\n\nmore content here\n\n## H3\n\neven more here too`
    const chunks = chunker.chunk(src)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.kind).toBe('prose')
  })

  it('emits startLine/endLine on each chunk', () => {
    const out = chunker.chunk('# H\n\nbody\n')
    expect(out[0]!.startLine).toBe(1)
    expect(out[0]!.endLine).toBeGreaterThanOrEqual(1)
  })

  it('handles empty input by returning []', () => {
    expect(chunker.chunk('')).toEqual([])
    expect(chunker.chunk('   ')).toEqual([])
  })
})

describe('ProseChunker (json) — v2a PR 3 Task 15', () => {
  const chunker = new ProseChunker('json')

  it('chunks pretty-printed JSON by top-level keys', () => {
    const src = `{
  "name": "fulcrum",
  "version": "0.1.0",
  "scripts": {
    "build": "tsup",
    "test": "vitest"
  },
  "dependencies": {
    "ulidx": "*"
  }
}`
    const chunks = chunker.chunk(src)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    const text = chunks.map(c => c.text).join('')
    expect(text).toContain('"name"')
    expect(text).toContain('"scripts"')
  })

  it('returns a single chunk for minified JSON', () => {
    const out = chunker.chunk(`{"a":1,"b":2,"c":3}`)
    expect(out).toHaveLength(1)
  })
})

describe('ProseChunker (yaml/toml) — v2a PR 3 Task 15', () => {
  it('yaml: chunks on top-level keys', () => {
    const chunker = new ProseChunker('yaml')
    const src = `services:\n  - name: a\n  - name: b\nnetworks:\n  default:\n    driver: bridge\n`
    const chunks = chunker.chunk(src)
    expect(chunks.length).toBe(2)
  })

  it('toml: chunks on [section] headers', () => {
    const chunker = new ProseChunker('toml')
    const src = `[package]\nname = "x"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1"\n`
    const chunks = chunker.chunk(src)
    expect(chunks.length).toBe(2)
  })
})
