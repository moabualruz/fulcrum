// packages/memory/src/tests/ast-chunker.test.ts
// Tests for ASTChunker and SlidingWindowChunker.
// Uses a mock parser so no WASM loading is needed.

import { describe, it, expect } from 'vitest'
import { ASTChunker, SlidingWindowChunker } from '../chunkers/index.js'
import type { SyntaxNode, ParseTree, TreeSitterParser } from '../chunkers/index.js'

// ---------- Mock parser builder ----------

function makeNode(
  type: string,
  startIndex: number,
  text: string,
  children: SyntaxNode[] = [],
  name?: string,
): SyntaxNode {
  const endIndex = startIndex + text.length
  const identifierChild: SyntaxNode[] = name
    ? [makeNode('identifier', startIndex + type.length + 1, name)]
    : []
  return {
    type,
    startIndex,
    endIndex,
    text,
    children: [...identifierChild, ...children],
  }
}

function makeParser(tree: ParseTree): TreeSitterParser {
  return { parse: () => tree }
}

// ---------- SlidingWindowChunker ----------

describe('SlidingWindowChunker', () => {
  it('returns one chunk for short source', () => {
    const chunker = new SlidingWindowChunker({ windowSize: 100 })
    const chunks = chunker.chunk('hello world')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toBe('hello world')
    expect(chunks[0].kind).toBe('window')
  })

  it('splits into overlapping windows', () => {
    const source = 'a'.repeat(200)
    const chunker = new SlidingWindowChunker({ windowSize: 100, overlap: 20 })
    const chunks = chunker.chunk(source)
    expect(chunks.length).toBeGreaterThan(1)
    // Last chunk ends at source.length
    expect(chunks[chunks.length - 1].end).toBe(source.length)
    // First chunk starts at 0
    expect(chunks[0].start).toBe(0)
  })

  it('handles empty source', () => {
    const chunker = new SlidingWindowChunker()
    const chunks = chunker.chunk('')
    expect(chunks).toHaveLength(0)
  })
})

// ---------- ASTChunker — mock parser ----------

const FUNCTION_SOURCE = `function greet(name) {
  return 'Hello, ' + name;
}

class Greeter {
  greet(name) {
    return 'Hi, ' + name;
  }
}`

describe('ASTChunker with mock parser', () => {
  it('extracts function_declaration chunk', () => {
    const fnNode = makeNode('function_declaration', 0, 'function greet(name) {\n  return \'Hello, \' + name;\n}', [], 'greet')
    const root = makeNode('program', 0, FUNCTION_SOURCE, [fnNode])
    const parser = makeParser({ rootNode: root })
    const chunker = new ASTChunker(parser)

    const chunks = chunker.chunk(FUNCTION_SOURCE)
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    const fnChunk = chunks.find(c => c.kind === 'function')
    expect(fnChunk).toBeDefined()
    expect(fnChunk?.name).toBe('greet')
  })

  it('extracts class_declaration chunk', () => {
    const classNode = makeNode('class_declaration', 50, 'class Greeter {}', [], 'Greeter')
    const root = makeNode('program', 0, FUNCTION_SOURCE, [classNode])
    const parser = makeParser({ rootNode: root })
    const chunker = new ASTChunker(parser)

    const chunks = chunker.chunk(FUNCTION_SOURCE)
    const classChunk = chunks.find(c => c.kind === 'class')
    expect(classChunk).toBeDefined()
    expect(classChunk?.name).toBe('Greeter')
  })

  it('extracts method_definition chunk', () => {
    const methodNode = makeNode('method_definition', 70, 'greet(name) { return \'Hi, \' + name; }', [], 'greet')
    const root = makeNode('program', 0, FUNCTION_SOURCE, [methodNode])
    const parser = makeParser({ rootNode: root })
    const chunker = new ASTChunker(parser)

    const chunks = chunker.chunk(FUNCTION_SOURCE)
    const methodChunk = chunks.find(c => c.kind === 'method')
    expect(methodChunk).toBeDefined()
  })

  it('falls back to SlidingWindowChunker when no declarations found', () => {
    const root = makeNode('program', 0, 'just some text', [
      makeNode('expression_statement', 0, 'just some text'),
    ])
    const parser = makeParser({ rootNode: root })
    const chunker = new ASTChunker(parser)

    const chunks = chunker.chunk('just some text')
    // v2a Task 14: anchor chunk emitted first, then sliding-window fallback chunks.
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].kind).toBe('anchor')
    expect(chunks.some(c => c.kind === 'window')).toBe(true)
  })

  it('falls back to SlidingWindowChunker for unsupported language', () => {
    const root = makeNode('program', 0, 'SELECT * FROM foo', [])
    const parser = makeParser({ rootNode: root })
    const chunker = new ASTChunker(parser)

    const chunks = chunker.chunkWithLanguage('SELECT * FROM foo', 'sql')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].kind).toBe('window')
  })

  it('chunk boundaries align with node positions', () => {
    const source = 'function foo() {} function bar() {}'
    const fooNode = makeNode('function_declaration', 0, 'function foo() {}', [], 'foo')
    const barNode = makeNode('function_declaration', 18, 'function bar() {}', [], 'bar')
    const root = makeNode('program', 0, source, [fooNode, barNode])
    const parser = makeParser({ rootNode: root })
    const chunker = new ASTChunker(parser)

    const chunks = chunker.chunk(source)
    // v2a Task 14: anchor chunk + 2 declarations.
    expect(chunks).toHaveLength(3)
    expect(chunks[0].kind).toBe('anchor')
    expect(chunks[1].start).toBe(0)
    expect(chunks[1].end).toBe(17)
    expect(chunks[2].start).toBe(18)
    expect(chunks[2].name).toBe('bar')
  })
})
