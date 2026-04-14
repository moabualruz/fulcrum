// packages/memory/src/chunkers/types.ts
// Shared types for all chunker implementations.

export interface Chunk {
  /** Source text of this chunk */
  text: string
  /** Zero-based start byte offset in the original source */
  start: number
  /** Zero-based end byte offset in the original source (exclusive) */
  end: number
  /** Kind of code construct this chunk represents (optional) */
  kind?: 'function' | 'class' | 'method' | 'window'
  /** Name of the declaration, if extractable */
  name?: string
}

export interface Chunker {
  chunk(source: string): Chunk[]
}
