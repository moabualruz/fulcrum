// packages/memory/src/tests/repo-map.test.ts
// Tests for buildRepoMap() and scanAndBuildRepoMap().

import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildRepoMap, scanAndBuildRepoMap } from '../repo-map.js'
import type { TreeSitterParser, SyntaxNode, ParseTree } from '../chunkers/ast-chunker.js'

// ---------- Mock tree-sitter parser ----------
// We build a minimal fake AST from source text so tests don't need WASM.

function makeIdentifier(text: string, offset: number): SyntaxNode {
  return { type: 'identifier', text, startIndex: offset, endIndex: offset + text.length, children: [] }
}

function makeFunctionNode(name: string, offset: number): SyntaxNode {
  return {
    type: 'function_declaration',
    text: `function ${name}() {}`,
    startIndex: offset,
    endIndex: offset + 20,
    children: [makeIdentifier(name, offset + 9)],
  }
}

function makeClassNode(name: string, offset: number): SyntaxNode {
  return {
    type: 'class_declaration',
    text: `class ${name} {}`,
    startIndex: offset,
    endIndex: offset + 15,
    children: [makeIdentifier(name, offset + 6)],
  }
}

function makeMethodNode(name: string, offset: number): SyntaxNode {
  return {
    type: 'method_definition',
    text: `${name}() {}`,
    startIndex: offset,
    endIndex: offset + 10,
    children: [{ type: 'property_identifier', text: name, startIndex: offset, endIndex: offset + name.length, children: [] }],
  }
}

function makeProgramNode(children: SyntaxNode[]): SyntaxNode {
  return { type: 'program', text: '', startIndex: 0, endIndex: 100, children }
}

function makeMockParser(nodes: SyntaxNode[]): TreeSitterParser {
  return {
    parse(_source: string): ParseTree {
      return { rootNode: makeProgramNode(nodes) }
    },
  }
}

// ---------- Helpers ----------

let tmpDir: string | null = null

function setup(): string {
  tmpDir = mkdtempSync(join(tmpdir(), 'fulcrum-repomap-test-'))
  return tmpDir
}

function teardown(): void {
  if (tmpDir) {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
    tmpDir = null
  }
}

// ---------- Tests ----------

describe('buildRepoMap — no parser', () => {
  it('returns empty files array for empty list', () => {
    const map = buildRepoMap([], '/root')
    expect(map.files).toHaveLength(0)
    expect(map.summary).toBe('')
  })

  it('builds file entries with no symbols when no parser provided', () => {
    const root = setup()
    try {
      writeFileSync(join(root, 'index.ts'), 'export const x = 1')
      const map = buildRepoMap([join(root, 'index.ts')], root)
      expect(map.files).toHaveLength(1)
      expect(map.files[0].path).toBe('index.ts')
      expect(map.files[0].language).toBe('typescript')
      expect(map.files[0].symbols).toHaveLength(0)
    } finally { teardown() }
  })

  it('detects language from extension', () => {
    const root = setup()
    try {
      writeFileSync(join(root, 'app.tsx'), '')
      writeFileSync(join(root, 'utils.js'), '')
      const map = buildRepoMap([join(root, 'app.tsx'), join(root, 'utils.js')], root)
      const langs = map.files.map(f => f.language)
      expect(langs).toContain('tsx')
      expect(langs).toContain('javascript')
    } finally { teardown() }
  })
})

describe('buildRepoMap — with parser', () => {
  it('extracts function declarations', () => {
    const root = setup()
    try {
      const source = 'function greet() {}\nfunction farewell() {}'
      writeFileSync(join(root, 'greet.ts'), source)
      const parser = makeMockParser([
        makeFunctionNode('greet', 0),
        makeFunctionNode('farewell', 21),
      ])
      const map = buildRepoMap([join(root, 'greet.ts')], root, parser)
      expect(map.files[0].symbols).toHaveLength(2)
      expect(map.files[0].symbols[0].name).toBe('greet')
      expect(map.files[0].symbols[0].kind).toBe('function')
      expect(map.files[0].symbols[1].name).toBe('farewell')
    } finally { teardown() }
  })

  it('extracts class declarations', () => {
    const root = setup()
    try {
      writeFileSync(join(root, 'dog.ts'), 'class Dog {}')
      const parser = makeMockParser([makeClassNode('Dog', 0)])
      const map = buildRepoMap([join(root, 'dog.ts')], root, parser)
      expect(map.files[0].symbols[0].kind).toBe('class')
      expect(map.files[0].symbols[0].name).toBe('Dog')
    } finally { teardown() }
  })

  it('extracts method definitions', () => {
    const root = setup()
    try {
      writeFileSync(join(root, 'cat.ts'), 'class Cat { meow() {} }')
      const classBody: SyntaxNode = {
        type: 'class_body',
        text: '{ meow() {} }',
        startIndex: 10,
        endIndex: 23,
        children: [makeMethodNode('meow', 12)],
      }
      const classNode: SyntaxNode = {
        ...makeClassNode('Cat', 0),
        children: [makeIdentifier('Cat', 6), classBody],
      }
      const parser = makeMockParser([classNode])
      const map = buildRepoMap([join(root, 'cat.ts')], root, parser)
      const kinds = map.files[0].symbols.map(s => s.kind)
      expect(kinds).toContain('class')
      expect(kinds).toContain('method')
    } finally { teardown() }
  })

  it('skips files with no identifiable names (anonymous funcs)', () => {
    const root = setup()
    try {
      writeFileSync(join(root, 'anon.ts'), '() => {}')
      // Arrow function with no identifier child
      const anon: SyntaxNode = {
        type: 'arrow_function',
        text: '() => {}',
        startIndex: 0,
        endIndex: 8,
        children: [],
      }
      const parser = makeMockParser([anon])
      const map = buildRepoMap([join(root, 'anon.ts')], root, parser)
      expect(map.files[0].symbols).toHaveLength(0)
    } finally { teardown() }
  })

  it('does not parse non-parseable languages', () => {
    const root = setup()
    try {
      writeFileSync(join(root, 'main.py'), 'def foo(): pass')
      const parser = makeMockParser([makeFunctionNode('foo', 0)])
      const map = buildRepoMap([join(root, 'main.py')], root, parser)
      // Python is not in PARSEABLE_LANGUAGES — symbols should be empty
      expect(map.files[0].symbols).toHaveLength(0)
    } finally { teardown() }
  })
})

describe('buildRepoMap — summary', () => {
  it('generates summary with file paths', () => {
    const root = setup()
    try {
      writeFileSync(join(root, 'a.ts'), '')
      writeFileSync(join(root, 'b.ts'), '')
      const map = buildRepoMap([join(root, 'a.ts'), join(root, 'b.ts')], root)
      expect(map.summary).toContain('a.ts')
      expect(map.summary).toContain('b.ts')
    } finally { teardown() }
  })

  it('includes symbol names and line numbers in summary when parser used', () => {
    const root = setup()
    try {
      writeFileSync(join(root, 'utils.ts'), 'function helper() {}')
      const parser = makeMockParser([makeFunctionNode('helper', 0)])
      const map = buildRepoMap([join(root, 'utils.ts')], root, parser)
      expect(map.summary).toContain('helper')
      expect(map.summary).toContain('utils.ts')
    } finally { teardown() }
  })
})

describe('scanAndBuildRepoMap', () => {
  it('finds source files in a directory', async () => {
    const root = setup()
    try {
      writeFileSync(join(root, 'index.ts'), 'export const x = 1')
      writeFileSync(join(root, 'utils.js'), 'function helper() {}')
      mkdirSync(join(root, 'src'), { recursive: true })
      writeFileSync(join(root, 'src', 'core.ts'), 'export class Core {}')
      const map = await scanAndBuildRepoMap(root)
      const paths = map.files.map(f => f.path)
      expect(paths.some(p => p.endsWith('index.ts'))).toBe(true)
      expect(paths.some(p => p.endsWith('utils.js'))).toBe(true)
      expect(paths.some(p => p.endsWith('core.ts'))).toBe(true)
    } finally { teardown() }
  })

  it('skips node_modules directory', async () => {
    const root = setup()
    try {
      writeFileSync(join(root, 'app.ts'), '')
      mkdirSync(join(root, 'node_modules', 'some-pkg'), { recursive: true })
      writeFileSync(join(root, 'node_modules', 'some-pkg', 'index.ts'), '')
      const map = await scanAndBuildRepoMap(root)
      const paths = map.files.map(f => f.path)
      expect(paths.every(p => !p.includes('node_modules'))).toBe(true)
    } finally { teardown() }
  })

  it('returns root in result', async () => {
    const root = setup()
    try {
      const map = await scanAndBuildRepoMap(root)
      expect(map.root).toBe(root)
    } finally { teardown() }
  })
})
