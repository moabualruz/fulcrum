import type { EmbeddingProvider } from './types.js'
import type { EmbeddingProviderConfig } from '../types.js'

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number
  private model: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pipeline: any = null

  constructor(config: EmbeddingProviderConfig) {
    this.model = config.model
    this.dimensions = config.dimensions ?? 1024
  }

  async warmUp(): Promise<void> {
    if (this.pipeline) return
    const { pipeline, env } = await import('@huggingface/transformers')
    env.cacheDir = './.fulcrum/models'
    this.pipeline = await pipeline('feature-extraction', this.model, { dtype: 'q8' })
  }

  async embed(text: string): Promise<Float32Array> {
    await this.warmUp()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const output = await this.pipeline(text, { normalize: true, pooling: 'mean' }) as { data: Float32Array }
    return output.data
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map(t => this.embed(t)))
  }
}
