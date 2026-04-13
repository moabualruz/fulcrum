export interface EmbeddingProvider {
  embed(text: string): Promise<Float32Array>
  embedBatch(texts: string[]): Promise<Float32Array[]>
  dimensions: number
  warmUp(): Promise<void>
}

export interface RerankerProvider {
  rerank(query: string, passages: string[]): Promise<number[]>
  warmUp(): Promise<void>
}
