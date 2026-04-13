import type { EmbeddingProvider, RerankerProvider } from './types.js'
import { LocalEmbeddingProvider } from './local.js'
import { LocalRerankerProvider } from './reranker.js'
import type { FulcrumConfig } from '../types.js'

let textProvider: EmbeddingProvider | null = null
let codeProvider: EmbeddingProvider | null = null
let rerankerProvider: RerankerProvider | null = null

export async function initEmbedding(config: FulcrumConfig): Promise<void> {
  if (config.embedding.text.provider === 'local') {
    textProvider = new LocalEmbeddingProvider(config.embedding.text)
  }
  if (config.embedding.code && config.embedding.code.provider === 'local') {
    codeProvider = new LocalEmbeddingProvider(config.embedding.code)
  }
  if (config.reranker.provider === 'local') {
    rerankerProvider = new LocalRerankerProvider(config.reranker)
  }
  // Warm up in parallel (downloads models if not cached)
  await Promise.all([
    textProvider?.warmUp(),
    codeProvider?.warmUp(),
    rerankerProvider?.warmUp(),
  ])
}

export function getTextEmbedder(): EmbeddingProvider | null { return textProvider }
export function getCodeEmbedder(): EmbeddingProvider | null { return codeProvider ?? textProvider }
export function getReranker(): RerankerProvider | null { return rerankerProvider }

/** For tests — reset providers */
export function resetProviders(): void {
  textProvider = null; codeProvider = null; rerankerProvider = null
}
