import type { EmbeddingProvider } from './types.js'
import type { EmbeddingProviderConfig } from '../types.js'

// Instruction prefixes for asymmetric embedding (query vs. document).
// These follow the E5-Instruct / GTE-Qwen3 convention.
export const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: '
export const DOC_PREFIX   = 'Represent the passage for retrieval: '

type LocalEmbeddingDevice = NonNullable<EmbeddingProviderConfig['device']>
type PipelineOptions = { dtype: 'q8', device?: 'cuda' | 'webgpu' }

/** Ordered pipeline initialization attempts for local embedding. */
export function localEmbeddingPipelineOptions(device: LocalEmbeddingDevice = 'auto'): PipelineOptions[] {
  if (device === 'cpu') return [{ dtype: 'q8' }]
  if (device === 'cuda') return [{ dtype: 'q8', device: 'cuda' }]
  if (device === 'webgpu') return [{ dtype: 'q8', device: 'webgpu' }]
  return [{ dtype: 'q8', device: 'cuda' }, { dtype: 'q8', device: 'webgpu' }, { dtype: 'q8' }]
}

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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number
  private model: string
  private device: LocalEmbeddingDevice
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pipeline: any = null
  private _warmingUp: Promise<void> | null = null

  constructor(config: EmbeddingProviderConfig) {
    this.model = config.model
    this.dimensions = config.dimensions ?? 1024
    this.device = config.device ?? 'auto'
  }

  async warmUp(): Promise<void> {
    if (this.pipeline) return
    if (!this._warmingUp) {
      this._warmingUp = (async () => {
        const { pipeline, env } = await import('@huggingface/transformers')
        const { globalDataDir } = await import('../db/client.js')
        env.cacheDir = globalDataDir() + '/models'
        this.pipeline = await this.createPipeline(pipeline)
      })()
    }
    return this._warmingUp
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async createPipeline(pipeline: any): Promise<any> {
    for (const options of localEmbeddingPipelineOptions(this.device)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        return await pipeline('feature-extraction', this.model, options)
      } catch (err) {
        if (options.device && this.device === 'auto') {
          process.stderr.write(`[fulcrum] ${options.device} embedding unavailable; trying next local embedding backend (${errorMessage(err)})\n`)
          continue
        }
        throw err
      }
    }
    throw new Error('Failed to initialize local embedding pipeline')
  }

  private async embedRaw(text: string): Promise<Float32Array> {
    await this.warmUp()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const output = await this.pipeline(text, { normalize: true, pooling: 'mean' }) as { data: Float32Array }
    return truncateDimensions(output.data, this.dimensions)
  }

  private async embedRawBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return []
    await this.warmUp()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const output = await this.pipeline(texts, { normalize: true, pooling: 'mean' }) as
      | { data: Float32Array; dims?: number[] }
      | Array<{ data: Float32Array }>

    if (Array.isArray(output)) {
      return output.map(item => truncateDimensions(item.data, this.dimensions))
    }

    const rowSize = output.dims?.[1] ?? Math.floor(output.data.length / texts.length)
    const vectors: Float32Array[] = []
    for (let i = 0; i < texts.length; i++) {
      const start = i * rowSize
      vectors.push(truncateDimensions(output.data.slice(start, start + rowSize), this.dimensions))
    }
    return vectors
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
    return this.embedRawBatch(texts.map(t => DOC_PREFIX + t))
  }
}
