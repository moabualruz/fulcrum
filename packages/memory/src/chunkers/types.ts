// packages/memory/src/chunkers/types.ts
// Shared types for all chunker implementations.

/**
 * v2a PR 3 Task 14 — Chunk gains semantic semantic fields. All v2a
 * additions are optional so existing callers (sliding-window, base AST
 * chunker emit) keep producing valid Chunk objects without changes.
 */
export type ChunkKind = 'function' | 'class' | 'method' | 'window' | 'arrow' | 'const' | 'anchor' | 'prose' | 'other'
export type ChunkRole = 'ORCHESTRATION' | 'DEFINITION' | 'IMPLEMENTATION' | 'DOCS'

export interface Chunk {
  /** Source text of this chunk */
  text: string
  /** Zero-based start byte offset in the original source */
  start: number
  /** Zero-based end byte offset in the original source (exclusive) */
  end: number
  /** Kind of code construct this chunk represents (optional) */
  kind?: ChunkKind
  /** Name of the declaration, if extractable */
  name?: string
  /** v2a Task 14 — semantic role from classifier */
  role?: ChunkRole
  /** v2a Task 14 — coarse complexity proxy (e.g. cyclomatic-ish count) */
  complexity?: number
  /** v2a Task 14 — symbols this chunk defines */
  definedSymbols?: string[]
  /** v2a Task 14 — symbols this chunk references */
  referencedSymbols?: string[]
  /** v2a Task 14 — enclosing class/namespace path, if any */
  parentSymbol?: string | null
  /** v2a Task 14 — anchor-chunk penalty (per-file imports/exports/top-comments) */
  anchorPenalty?: number
  /** v2a Task 15 — fully-qualified line range for prose / config chunks */
  startLine?: number
  endLine?: number
}

export interface Chunker {
  chunk(source: string): Chunk[]
}
