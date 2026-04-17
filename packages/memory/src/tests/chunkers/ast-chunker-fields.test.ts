import { describe, it, expect } from 'vitest'
import { ASTChunker, type TreeSitterParser } from '../../chunkers/ast-chunker.js'

// Lightweight fake parser — emits a single root node so the walker takes
// the no-decl-found fallback path. Exercises the enrichment + anchor chunk
// logic without dragging in tree-sitter WASM.
function fakeParser(source: string): TreeSitterParser {
  return {
    parse: () => ({
      rootNode: {
        type: 'program',
        startIndex: 0,
        endIndex: source.length,
        children: [],
      },
    }),
  } as unknown as TreeSitterParser
}

describe('AST chunker enrichment — v2a PR 3 Task 14', () => {
  const sample = `// header comment\nimport { x } from './x'\n\nexport function foo(a: number) {\n  if (a > 0) return a + 1\n  return -1\n}\n\nclass Bar {\n  greet() { return 'hi' }\n}\n`

  it('emits an anchor chunk first with kind=anchor and anchorPenalty=0.99', () => {
    const chunker = new ASTChunker(fakeParser(sample))
    const chunks = chunker.chunk(sample)
    expect(chunks.length).toBeGreaterThan(0)
    const anchor = chunks[0]!
    expect(anchor.kind).toBe('anchor')
    expect(anchor.anchorPenalty).toBe(0.99)
    expect(anchor.text).toContain('import')
  })

  it('non-anchor chunks gain role / complexity / definedSymbols / referencedSymbols', () => {
    const chunker = new ASTChunker(fakeParser(sample))
    const chunks = chunker.chunk(sample)
    const non = chunks.filter(c => c.kind !== 'anchor')
    expect(non.length).toBeGreaterThan(0)
    for (const c of non) {
      expect(c.role).toBeDefined()
      expect(typeof c.complexity).toBe('number')
      expect(Array.isArray(c.definedSymbols)).toBe(true)
      expect(Array.isArray(c.referencedSymbols)).toBe(true)
    }
  })

  it('definition keywords (function/class/const) populate definedSymbols', () => {
    const chunker = new ASTChunker(fakeParser(sample))
    const chunks = chunker.chunk(sample)
    const allDefined = chunks.flatMap(c => c.definedSymbols ?? [])
    expect(allDefined).toContain('foo')
    expect(allDefined).toContain('Bar')
  })

  it('complexity counts control-flow keywords', () => {
    const branchy = 'function f(x) { if (x) { while (x > 0) { x-- } } else if (x === 0) return; for (let i of []) i; }'
    const chunker = new ASTChunker(fakeParser(branchy))
    const chunks = chunker.chunk(branchy).filter(c => c.kind !== 'anchor')
    expect(chunks.length).toBeGreaterThan(0)
    const max = Math.max(...chunks.map(c => c.complexity ?? 0))
    expect(max).toBeGreaterThanOrEqual(4) // 1 base + if + while + else if + for
  })

  it('parentSymbol defaults to null when not derivable', () => {
    const chunker = new ASTChunker(fakeParser(sample))
    const chunks = chunker.chunk(sample).filter(c => c.kind !== 'anchor')
    for (const c of chunks) expect(c.parentSymbol).toBeNull()
  })
})
