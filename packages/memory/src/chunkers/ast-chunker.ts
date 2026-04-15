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

    // If no declaration boundaries found, fall back to sliding window
    if (chunks.length === 0) {
      return this.fallback.chunk(source)
    }
    return chunks
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
      // Do NOT recurse into the body — the declaration is the chunk unit
      return
    }
    for (const child of node.children) {
      this.walk(source, child, chunks)
    }
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
