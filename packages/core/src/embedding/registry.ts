import type { EmbeddingProvider, RerankerProvider } from './types.js'
import { LocalEmbeddingProvider } from './local.js'
import { VoyageEmbeddingProvider, OpenAIEmbeddingProvider, OllamaEmbeddingProvider } from './remote.js'
import { LocalRerankerProvider } from './reranker.js'
import type { FulcrumConfig, EmbeddingProviderConfig } from '../types.js'

let textProvider: EmbeddingProvider | null = null
let codeProvider: EmbeddingProvider | null = null
let rerankerProvider: RerankerProvider | null = null

// ── Provider registry ─────────────────────────────────────────────────────────

type ProviderFactory = (config: EmbeddingProviderConfig) => EmbeddingProvider

const _providerRegistry = new Map<string, ProviderFactory>()

/**
 * Register a custom embedding provider factory.
 * Built-in providers (local, voyage, openai) are registered at module load.
 * Call this before initEmbedding() to make a custom provider available by name.
 */
export function registerEmbeddingProvider(name: string, factory: ProviderFactory): void {
  _providerRegistry.set(name, factory)
}

// Register built-ins so they are resolvable through the same path as custom ones.
registerEmbeddingProvider('local',  (cfg) => new LocalEmbeddingProvider(cfg))
registerEmbeddingProvider('voyage', (cfg) => new VoyageEmbeddingProvider(cfg))
registerEmbeddingProvider('openai', (cfg) => new OpenAIEmbeddingProvider(cfg))
registerEmbeddingProvider('ollama', (cfg) => new OllamaEmbeddingProvider(cfg))

/**
 * Create an EmbeddingProvider from config. Throws on unknown provider names,
 * making misconfiguration immediately visible rather than silently degrading
 * to FTS5-only search.
 */
export function createProvider(config: EmbeddingProviderConfig): EmbeddingProvider {
  const factory = _providerRegistry.get(config.provider)
  if (!factory) {
    throw new Error(
      `Unknown embedding provider: "${config.provider}". ` +
      `Registered providers: ${[..._providerRegistry.keys()].join(', ')}`
    )
  }
  return factory(config)
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
