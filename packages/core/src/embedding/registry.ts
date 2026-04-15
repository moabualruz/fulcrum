import type { EmbeddingProvider, RerankerProvider } from './types.js'
import { LocalEmbeddingProvider } from './local.js'
import { VoyageEmbeddingProvider, OpenAIEmbeddingProvider } from './remote.js'
import { LocalRerankerProvider } from './reranker.js'
import type { FulcrumConfig, EmbeddingProviderConfig } from '../types.js'

let textProvider: EmbeddingProvider | null = null
let codeProvider: EmbeddingProvider | null = null
let rerankerProvider: RerankerProvider | null = null

/**
 * Create an EmbeddingProvider from config. Throws on unknown provider names,
 * making misconfiguration immediately visible rather than silently degrading
 * to FTS5-only search.
 */
export function createProvider(config: EmbeddingProviderConfig): EmbeddingProvider {
  switch (config.provider) {
    case 'local':
      return new LocalEmbeddingProvider(config)
    case 'voyage':
      return new VoyageEmbeddingProvider(config)
    case 'openai':
      return new OpenAIEmbeddingProvider(config)
    default:
      throw new Error(
        `Unknown embedding provider: "${(config as { provider: string }).provider}". ` +
        `Supported providers: local, voyage, openai`
      )
  }
}

/**
 * Like createProvider but returns null instead of throwing.
 * Use when embedding is optional and degradation to FTS5 is acceptable.
 */
export function tryGetProvider(config: EmbeddingProviderConfig): EmbeddingProvider | null {
  try {
    return createProvider(config)
  } catch {
    return null
  }
}

export async function initEmbedding(config: FulcrumConfig): Promise<void> {
  textProvider = createProvider(config.embedding.text)
  codeProvider = config.embedding.code ? createProvider(config.embedding.code) : null
  rerankerProvider = config.reranker.provider === 'local'
    ? new LocalRerankerProvider(config.reranker)
    : null
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
