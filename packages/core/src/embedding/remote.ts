import type { EmbeddingProvider } from './types.js'
import type { EmbeddingProviderConfig } from '../types.js'

// ---------------------------------------------------------------------------
// Voyage AI — voyage-code-3 (Matryoshka, 1024-dim default)
// ---------------------------------------------------------------------------

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number
  private readonly apiKey: string
  private readonly model: string

  constructor(config: EmbeddingProviderConfig) {
    const key = config.apiKey ?? process.env.VOYAGE_API_KEY
    if (!key) throw new Error('VOYAGE_API_KEY is not set')
    this.apiKey = key
    this.model = config.model ?? 'voyage-code-3'
    this.dimensions = config.dimensions ?? 1024
  }

  async warmUp(): Promise<void> { /* no-op for remote providers */ }

  private async callAPI(inputs: string[], inputType: 'document' | 'query'): Promise<Float32Array[]> {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: inputs,
        input_type: inputType,
        output_dimension: this.dimensions,
      }),
    })
    if (!res.ok) throw new Error(`Voyage API error: ${res.status} ${await res.text()}`)
    const data = await res.json() as { data: Array<{ embedding: number[] }> }
    return data.data.map(d => new Float32Array(d.embedding))
  }

  async embed(text: string): Promise<Float32Array> {
    const results = await this.callAPI([text], 'document')
    return results[0]
  }

  async embedDocument(text: string): Promise<Float32Array> {
    const results = await this.callAPI([text], 'document')
    return results[0]
  }

  async embedQuery(text: string): Promise<Float32Array> {
    const results = await this.callAPI([text], 'query')
    return results[0]
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return this.callAPI(texts, 'document')
  }
}

// ---------------------------------------------------------------------------
// OpenAI — text-embedding-3-large (3072-dim default)
// ---------------------------------------------------------------------------

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number
  private readonly apiKey: string
  private readonly model: string

  constructor(config: EmbeddingProviderConfig) {
    const key = config.apiKey ?? process.env.OPENAI_API_KEY
    if (!key) throw new Error('OPENAI_API_KEY is not set')
    this.apiKey = key
    this.model = config.model ?? 'text-embedding-3-large'
    this.dimensions = config.dimensions ?? 3072
  }

  async warmUp(): Promise<void> { /* no-op for remote providers */ }

  private async callAPI(inputs: string[]): Promise<Float32Array[]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: inputs,
        dimensions: this.dimensions,
      }),
    })
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`)
    const data = await res.json() as { data: Array<{ embedding: number[] }> }
    return data.data.map(d => new Float32Array(d.embedding))
  }

  async embed(text: string): Promise<Float32Array> {
    const results = await this.callAPI([text])
    return results[0]
  }

  async embedDocument(text: string): Promise<Float32Array> {
    return this.embed(text)
  }

  async embedQuery(text: string): Promise<Float32Array> {
    return this.embed(text)
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return this.callAPI(texts)
  }
}
