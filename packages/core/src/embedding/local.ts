import type { EmbeddingProvider } from './types.js'
import type { EmbeddingProviderConfig } from '../types.js'

// Instruction prefixes for asymmetric embedding (query vs. document).
// These follow the E5-Instruct / GTE-Qwen3 convention.
export const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: '
export const DOC_PREFIX   = 'Represent the passage for retrieval: '

/** Truncate (or zero-pad) a Float32Array to a given number of dimensions. */
export function truncateDimensions(vec: Float32Array, dims: number): Float32Array {
  if (vec.length === dims) return vec
  if (vec.length < dims) {
    const padded = new Float32Array(dims)
    padded.set(vec)
    return padded
  }
  return vec.slice(0, dims)
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number
  private model: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pipeline: any = null
  private _warmingUp: Promise<void> | null = null

  constructor(config: EmbeddingProviderConfig) {
    this.model = config.model
    this.dimensions = config.dimensions ?? 1024
  }

  async warmUp(): Promise<void> {
    if (this.pipeline) return
    if (!this._warmingUp) {
      this._warmingUp = (async () => {
        const { pipeline, env } = await import('@huggingface/transformers')
        const { globalDataDir } = await import('../db/client.js')
        env.cacheDir = globalDataDir() + '/models'
        this.pipeline = await pipeline('feature-extraction', this.model, { dtype: 'q8' })
      })()
    }
    return this._warmingUp
  }

  private async embedRaw(text: string): Promise<Float32Array> {
    await this.warmUp()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const output = await this.pipeline(text, { normalize: true, pooling: 'mean' }) as { data: Float32Array }
    return truncateDimensions(output.data, this.dimensions)
  }

  /** Embed a query string — applies QUERY_PREFIX for asymmetric retrieval. */
  async embedQuery(text: string): Promise<Float32Array> {
    return this.embedRaw(QUERY_PREFIX + text)
  }

  /** Embed a document/passage — applies DOC_PREFIX for asymmetric retrieval. */
  async embedDocument(text: string): Promise<Float32Array> {
    return this.embedRaw(DOC_PREFIX + text)
  }

  /** Default embed() uses DOC_PREFIX (for backward compatibility with existing callers). */
  async embed(text: string): Promise<Float32Array> {
    return this.embedDocument(text)
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map(t => this.embedDocument(t)))
  }
}
