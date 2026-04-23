import type { RerankerProvider } from './types.js'
import type { EmbeddingProviderConfig } from '../types.js'
import { localEmbeddingPipelineOptions } from './local.js'

type LocalRerankerDevice = NonNullable<EmbeddingProviderConfig['device']>

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export class LocalRerankerProvider implements RerankerProvider {
  actualDevice: 'cpu' | 'cuda' | 'webgpu' | null = null
  private model: string
  private device: LocalRerankerDevice
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tokenizer: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rankerModel: any = null
  private _warmingUp: Promise<void> | null = null

  constructor(config: EmbeddingProviderConfig) {
    this.model = config.model
    this.device = config.device ?? 'auto'
  }

  async warmUp(): Promise<void> {
    if (this.tokenizer) return
    if (!this._warmingUp) {
      this._warmingUp = (async () => {
        const { AutoTokenizer, AutoModelForSequenceClassification, env } = await import('@huggingface/transformers')
        const { globalDataDir } = await import('../db/client.js')
        env.cacheDir = globalDataDir() + '/models'
        this.tokenizer = await AutoTokenizer.from_pretrained(this.model)
        this.rankerModel = await this.createModel(AutoModelForSequenceClassification)
      })()
    }
    return this._warmingUp
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async createModel(AutoModelForSequenceClassification: any): Promise<any> {
    for (const options of localEmbeddingPipelineOptions(this.device)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const created = await AutoModelForSequenceClassification.from_pretrained(this.model, options)
        this.actualDevice = options.device ?? 'cpu'
        return created
      } catch (err) {
        if (options.device && this.device === 'auto') {
          process.stderr.write(`[fulcrum] ${options.device} reranker unavailable; trying next local reranker backend (${errorMessage(err)})\n`)
          continue
        }
        throw err
      }
    }
    throw new Error('Failed to initialize local reranker model')
  }

  async rerank(query: string, passages: string[]): Promise<number[]> {
    await this.warmUp()
    const queries = passages.map(() => query)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const inputs = await this.tokenizer(queries, {
      text_pair: passages,
      padding: true,
      truncation: true,
      return_tensors: 'pt',
    })
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const { logits } = await this.rankerModel(inputs) as { logits: { data: Float32Array; dims: number[] } }
    // Handle two common output shapes:
    //   [n_pairs]    — scalar relevance score per pair (most cross-encoders)
    //   [n_pairs, 1] — single-column relevance score per pair
    //   [n_pairs, 2] — [irrelevance, relevance] logit pair; take the relevance column (index 1)
    const dims: number[] = logits.dims ?? []
    if (dims.length === 2 && dims[1] === 2) {
      // Binary classifier: extract relevance logit (column 1) for each pair
      const scores: number[] = []
      for (let i = 0; i < passages.length; i++) {
        scores.push(logits.data[i * 2 + 1] ?? 0)
      }
      return scores
    }
    return Array.from(logits.data)
  }
}
