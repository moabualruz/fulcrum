// packages/memory/src/chunkers/ast-chunker.ts
// AST-aware chunker using web-tree-sitter (WASM — no native compile).
// Splits code at function/class/method declaration boundaries.
// Falls back to SlidingWindowChunker for unsupported languages.

import type { Chunk, Chunker } from './types.js'
import { SlidingWindowChunker } from './sliding-window.js'

// Node types that constitute top-level declaration boundaries
const DECLARATION_TYPES = new Set([
  'function_declaration',
  'function_expression',
  'arrow_function',
  'class_declaration',
  'class_expression',
  'method_definition',
  'generator_function_declaration',
  'lexical_declaration',  // const foo = () => {...}
])

/** Minimal tree-sitter SyntaxNode interface (subset used by ASTChunker). */
export interface SyntaxNode {
  type: string
  startIndex: number
  endIndex: number
  text: string
  children: SyntaxNode[]
  childForFieldName?(name: string): SyntaxNode | null
}

/** Minimal tree-sitter Tree interface. */
export interface ParseTree {
  rootNode: SyntaxNode
}

/** Tree-sitter parser interface — accepts real web-tree-sitter or mock. */
export interface TreeSitterParser {
  parse(source: string): ParseTree
}

export type SupportedLanguage = 'typescript' | 'javascript' | 'tsx' | 'jsx'

const SUPPORTED_LANGUAGES: Set<string> = new Set(['typescript', 'javascript', 'tsx', 'jsx'])

/** Extract the identifier name from a declaration node's first named child. */
function extractName(node: SyntaxNode): string | undefined {
  // Look for an identifier child
  for (const child of node.children) {
    if (child.type === 'identifier') return child.text
    if (child.type === 'property_identifier') return child.text
  }
  return undefined
}

function kindForType(nodeType: string): Chunk['kind'] {
  if (nodeType.includes('class')) return 'class'
  if (nodeType.includes('method')) return 'method'
  return 'function'
}

/**
 * ASTChunker — splits source code at function/class/method boundaries.
 *
 * Usage:
 *   const chunker = new ASTChunker(parser)  // parser is a tree-sitter Parser
 *   const chunks = chunker.chunk(source)
 *
 * For unsupported languages, falls back to SlidingWindowChunker.
 */
export class ASTChunker implements Chunker {
  private parser: TreeSitterParser
  private fallback: SlidingWindowChunker

  constructor(parser: TreeSitterParser) {
    this.parser = parser
    this.fallback = new SlidingWindowChunker()
  }

  /**
   * Chunk source code for a given language.
   * Falls back to SlidingWindowChunker if the language is not supported.
   */
  chunkWithLanguage(source: string, language: string): Chunk[] {
    if (!SUPPORTED_LANGUAGES.has(language)) {
      return this.fallback.chunk(source)
    }
    return this.chunk(source)
  }

  /**
   * Chunk source code by parsing it with tree-sitter.
   * Splits at function/class/method declaration boundaries.
   */
  chunk(source: string): Chunk[] {
    const tree = this.parser.parse(source)
    const chunks: Chunk[] = []
    this.walk(source, tree.rootNode, chunks)

    if (chunks.length === 0) {
      // Sliding-window fallback still gets enriched + an anchor chunk.
      const fallback = this.fallback.chunk(source)
      return [makeAnchorChunk(source), ...fallback.map(c => enrichChunk(c, source))]
    }
    return [makeAnchorChunk(source), ...chunks.map(c => enrichChunk(c, source))]
  }

  private walk(source: string, node: SyntaxNode, chunks: Chunk[]): void {
    if (DECLARATION_TYPES.has(node.type)) {
      chunks.push({
        text: source.slice(node.startIndex, node.endIndex),
        start: node.startIndex,
        end: node.endIndex,
        kind: kindForType(node.type),
        name: extractName(node),
      })
      return
    }
    for (const child of node.children) {
      this.walk(source, child, chunks)
    }
  }
}

// v2a PR 3 Task 14 — semantic enrichment heuristics.
//
// These are shape-conservative: the upstream AST traversal stays unchanged;
// we just decorate each chunk with role/complexity/symbols + emit an anchor
// chunk per file. PR 4's chunker rewrite (when it lands) can replace these
// heuristics with proper tree-sitter queries.

const IDENTIFIER_RE = /\b([a-z_$][\w$]*)\b/gi
const DEFINITION_KEYWORDS = /\b(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g
const COMPLEXITY_RE = /\b(?:if|else|for|while|case|catch|switch|\?\?|\?\.|&&|\|\|)\b/g

function detectRole(text: string, kind?: string): NonNullable<Chunk['role']> {
  if (kind === 'anchor') return 'DEFINITION'
  if (/^\s*\/\*\*|^\s*\/\/|^\s*#/m.test(text) && text.length < 200) return 'DOCS'
  if (/(?:throw|await|fetch|spawn|emitEvent|publish)/.test(text)) return 'IMPLEMENTATION'
  if (/^(?:export\s+)?(?:function|class|const|interface|type)\s/m.test(text)) return 'DEFINITION'
  return 'ORCHESTRATION'
}

function extractDefinedSymbols(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(DEFINITION_KEYWORDS)) {
    if (m[1]) out.add(m[1])
  }
  return [...out]
}

function extractReferencedSymbols(text: string, defined: Set<string>): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(IDENTIFIER_RE)) {
    const id = m[1]!
    if (id.length < 3) continue
    if (defined.has(id)) continue
    if (/^(?:if|else|for|while|return|const|let|var|new|true|false|null|void|this|self|class|function|interface|type|enum|export|import|from|as|in|of|do|case|switch|break|continue|throw|try|catch|finally|async|await|yield|extends|implements|static|public|private|protected)$/.test(id)) continue
    out.add(id)
  }
  return [...out].slice(0, 32)
}

function complexity(text: string): number {
  let count = 1
  for (const _ of text.matchAll(COMPLEXITY_RE)) count++
  return count
}

function enrichChunk(c: Chunk, _source: string): Chunk {
  const defined = extractDefinedSymbols(c.text)
  return {
    ...c,
    role: detectRole(c.text, c.kind),
    complexity: complexity(c.text),
    definedSymbols: defined,
    referencedSymbols: extractReferencedSymbols(c.text, new Set(defined)),
    parentSymbol: c.parentSymbol ?? null,
  }
}

function makeAnchorChunk(source: string): Chunk {
  // Top-of-file imports, exports, and leading comments form the anchor.
  const lines = source.split(/\r?\n/)
  const anchorLines: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (/^\s*(?:\/\/|\/\*|\*|\*\/|import\s|export\s+\*|export\s+\{|from\s)/.test(line)) {
      anchorLines.push(line)
    } else if (anchorLines.length > 0 && !line.trim()) {
      anchorLines.push(line)
    } else if (anchorLines.length > 0) {
      break
    }
  }
  const text = anchorLines.join('\n')
  return {
    text: text || '/* (anchor) */',
    start: 0,
    end: text.length,
    kind: 'anchor',
    role: 'DEFINITION',
    anchorPenalty: 0.99,
    definedSymbols: [],
    referencedSymbols: [],
    parentSymbol: null,
  }
}

// ---------- Loader (lazy — only called when parsing real code) ----------

let _parserInstance: TreeSitterParser | null = null

/**
 * Create an ASTChunker backed by a real web-tree-sitter parser loaded with
 * the TypeScript grammar. Returns null if WASM loading fails.
 *
 * This is async because WASM must be initialized before use.
 */
export async function createASTChunker(): Promise<ASTChunker | null> {
  if (_parserInstance) return new ASTChunker(_parserInstance)
  try {
    // Dynamic import — web-tree-sitter is optional; if not present, fall back
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Parser = (await import('web-tree-sitter')).default as any
    await Parser.init()
    const parser = new Parser()
    // Attempt to load TypeScript grammar from the package
    // Grammar WASM must be copied to a known path or resolved from node_modules
    const grammarPath = new URL(
      '../../node_modules/tree-sitter-typescript/typescript/parser.js',
      import.meta.url,
    ).pathname
    const Language = await Parser.Language.load(grammarPath).catch(() => null)
    if (!Language) return null
    parser.setLanguage(Language)
    _parserInstance = parser as TreeSitterParser
    return new ASTChunker(_parserInstance)
  } catch {
    return null
  }
}
