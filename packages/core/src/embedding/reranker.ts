import type { RerankerProvider } from './types.js'
import type { EmbeddingProviderConfig } from '../types.js'

export class LocalRerankerProvider implements RerankerProvider {
  private model: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tokenizer: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rankerModel: any = null

  constructor(config: EmbeddingProviderConfig) {
    this.model = config.model
  }

  async warmUp(): Promise<void> {
    if (this.tokenizer) return
    const { AutoTokenizer, AutoModelForSequenceClassification, env } = await import('@huggingface/transformers')
    env.cacheDir = './.fulcrum/models'
    this.tokenizer = await AutoTokenizer.from_pretrained(this.model)
    this.rankerModel = await AutoModelForSequenceClassification.from_pretrained(this.model, { dtype: 'q8' })
  }

  async rerank(query: string, passages: string[]): Promise<number[]> {
    await this.warmUp()
    const pairs = passages.map(p => [query, p])
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const inputs = await this.tokenizer(pairs, { padding: true, truncation: true, return_tensors: 'pt' })
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const { logits } = await this.rankerModel(inputs) as { logits: { data: Float32Array } }
    return Array.from(logits.data)
  }
}
