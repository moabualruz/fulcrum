// packages/memory/src/chunkers/sliding-window.ts
// Fallback chunker: splits text into overlapping windows by character count.

import type { Chunk, Chunker } from './types.js'

export interface SlidingWindowOptions {
  /** Target window size in characters (default: 1500) */
  windowSize?: number
  /** Overlap between consecutive windows in characters (default: 200) */
  overlap?: number
}

export class SlidingWindowChunker implements Chunker {
  private windowSize: number
  private overlap: number

  constructor(options: SlidingWindowOptions = {}) {
    this.windowSize = options.windowSize ?? 1500
    this.overlap = options.overlap ?? 200
  }

  chunk(source: string): Chunk[] {
    const chunks: Chunk[] = []
    const step = Math.max(1, this.windowSize - this.overlap)
    let start = 0
    while (start < source.length) {
      const end = Math.min(start + this.windowSize, source.length)
      chunks.push({ text: source.slice(start, end), start, end, kind: 'window' })
      if (end === source.length) break
      start += step
    }
    return chunks
  }
}
