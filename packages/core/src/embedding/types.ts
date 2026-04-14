export interface EmbeddingProvider {
  /** Embed with DOC_PREFIX (backward-compatible default). */
  embed(text: string): Promise<Float32Array>
  embedBatch(texts: string[]): Promise<Float32Array[]>
  dimensions: number
  warmUp(): Promise<void>
  /** Embed a query with QUERY_PREFIX for asymmetric retrieval. */
  embedQuery?(text: string): Promise<Float32Array>
  /** Embed a document/passage with DOC_PREFIX for asymmetric retrieval. */
  embedDocument?(text: string): Promise<Float32Array>
}

export interface RerankerProvider {
  rerank(query: string, passages: string[]): Promise<number[]>
  warmUp(): Promise<void>
}
