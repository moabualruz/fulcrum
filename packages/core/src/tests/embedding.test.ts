import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LocalEmbeddingProvider, QUERY_PREFIX, DOC_PREFIX, truncateDimensions } from '../embedding/local.js'
import { LocalRerankerProvider } from '../embedding/reranker.js'
import { VoyageEmbeddingProvider, OpenAIEmbeddingProvider } from '../embedding/remote.js'
import { createProvider } from '../embedding/registry.js'

// NOTE: these tests download models on first run (~300MB+). Skipped in CI
// unless FULCRUM_EMBEDDING_TESTS=1 is set.
const RUN = process.env.FULCRUM_EMBEDDING_TESTS === '1'

describe.skipIf(!RUN)('LocalEmbeddingProvider', () => {
  it('returns a Float32Array of correct dimensions', async () => {
    const provider = new LocalEmbeddingProvider({
      provider: 'local',
      model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
      dimensions: 1024,
    })
    await provider.warmUp()
    const embedding = await provider.embed('hello world')
    expect(embedding).toBeInstanceOf(Float32Array)
    expect(embedding.length).toBe(1024)
  }, 60_000)

  it('similar texts have higher cosine similarity than dissimilar', async () => {
    const provider = new LocalEmbeddingProvider({
      provider: 'local',
      model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
      dimensions: 1024,
    })
    await provider.warmUp()
    const a = await provider.embed('the dog sat on the mat')
    const b = await provider.embed('a canine rested on a rug')
    const c = await provider.embed('quantum entanglement in superconductors')
    const simAB = cosineSim(a, b)
    const simAC = cosineSim(a, c)
    expect(simAB).toBeGreaterThan(simAC)
  }, 60_000)
})

describe.skipIf(!RUN)('LocalRerankerProvider', () => {
  it('returns a score array with one entry per passage', async () => {
    const provider = new LocalRerankerProvider({
      provider: 'local',
      model: 'onnx-community/bge-reranker-v2-m3-ONNX',
      dimensions: 0,
    })
    await provider.warmUp()
    const passages = ['the dog sat on the mat', 'quantum entanglement in superconductors']
    const scores = await provider.rerank('dog sitting', passages)
    expect(scores).toHaveLength(passages.length)
    expect(typeof scores[0]).toBe('number')
    expect(typeof scores[1]).toBe('number')
  }, 120_000)

  it('ranks the more relevant passage higher', async () => {
    const provider = new LocalRerankerProvider({
      provider: 'local',
      model: 'onnx-community/bge-reranker-v2-m3-ONNX',
      dimensions: 0,
    })
    await provider.warmUp()
    const relevant = 'a dog resting on a rug'
    const irrelevant = 'quantum entanglement in superconductors'
    const scores = await provider.rerank('dog sitting on mat', [relevant, irrelevant])
    expect(scores[0]).toBeGreaterThan(scores[1])
  }, 120_000)
})

function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i] }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// ---------- Instruction prefixes (unit — no model needed) ----------

describe('instruction prefixes', () => {
  it('QUERY_PREFIX and DOC_PREFIX are non-empty strings', () => {
    expect(typeof QUERY_PREFIX).toBe('string')
    expect(QUERY_PREFIX.length).toBeGreaterThan(0)
    expect(typeof DOC_PREFIX).toBe('string')
    expect(DOC_PREFIX.length).toBeGreaterThan(0)
  })

  it('QUERY_PREFIX and DOC_PREFIX are different', () => {
    expect(QUERY_PREFIX).not.toBe(DOC_PREFIX)
  })
})

// ---------- truncateDimensions (unit — no model needed) ----------

describe('truncateDimensions', () => {
  it('returns same vector when dims === length', () => {
    const v = new Float32Array([1, 2, 3, 4])
    const result = truncateDimensions(v, 4)
    expect(Array.from(result)).toEqual([1, 2, 3, 4])
  })

  it('truncates to fewer dimensions (Matryoshka truncation)', () => {
    const v = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6])
    const result = truncateDimensions(v, 3)
    expect(result.length).toBe(3)
    // Use source Float32 values to avoid float64 precision mismatch
    expect(result[0]).toBeCloseTo(0.1, 5)
    expect(result[1]).toBeCloseTo(0.2, 5)
    expect(result[2]).toBeCloseTo(0.3, 5)
  })

  it('zero-pads when dims > vector length', () => {
    const v = new Float32Array([1, 2])
    const result = truncateDimensions(v, 4)
    expect(result.length).toBe(4)
    expect(Array.from(result)).toEqual([1, 2, 0, 0])
  })
})

// ---------------------------------------------------------------------------
// VoyageEmbeddingProvider — mocked fetch (no real API calls)
// ---------------------------------------------------------------------------

function makeVoyageResponse(dims: number) {
  return {
    ok: true,
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({
      data: [{ embedding: Array.from({ length: dims }, (_, i) => i * 0.001) }],
    }),
  }
}

function makeOpenAIResponse(dims: number) {
  return {
    ok: true,
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({
      data: [{ embedding: Array.from({ length: dims }, (_, i) => i * 0.001) }],
    }),
  }
}

describe('VoyageEmbeddingProvider', () => {
  let savedKey: string | undefined

  beforeEach(() => {
    savedKey = process.env.VOYAGE_API_KEY
    process.env.VOYAGE_API_KEY = 'test-voyage-key'
  })

  afterEach(() => {
    if (savedKey === undefined) {
      delete process.env.VOYAGE_API_KEY
    } else {
      process.env.VOYAGE_API_KEY = savedKey
    }
    vi.restoreAllMocks()
  })

  it('returns Float32Array of correct dimensions from embed()', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeVoyageResponse(1024)))

    const provider = new VoyageEmbeddingProvider({ provider: 'voyage', model: 'voyage-code-3', dimensions: 1024 })
    const result = await provider.embed('hello world')

    expect(result).toBeInstanceOf(Float32Array)
    expect(result.length).toBe(1024)
  })

  it('sends input_type: document for embedDocument()', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeVoyageResponse(1024))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new VoyageEmbeddingProvider({ provider: 'voyage', model: 'voyage-code-3', dimensions: 1024 })
    await provider.embedDocument('some code')

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.input_type).toBe('document')
  })

  it('sends input_type: query for embedQuery()', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeVoyageResponse(1024))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new VoyageEmbeddingProvider({ provider: 'voyage', model: 'voyage-code-3', dimensions: 1024 })
    await provider.embedQuery('find code')

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.input_type).toBe('query')
  })

  it('embedBatch sends all texts in one request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(''),
      json: () => Promise.resolve({
        data: [
          { embedding: new Array(1024).fill(0.1) },
          { embedding: new Array(1024).fill(0.2) },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = new VoyageEmbeddingProvider({ provider: 'voyage', model: 'voyage-code-3', dimensions: 1024 })
    const results = await provider.embedBatch(['text1', 'text2'])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(results).toHaveLength(2)
    expect(results[0]).toBeInstanceOf(Float32Array)
  })

  it('throws if VOYAGE_API_KEY is not set', () => {
    delete process.env.VOYAGE_API_KEY
    expect(() => new VoyageEmbeddingProvider({ provider: 'voyage', model: 'voyage-code-3' }))
      .toThrow('VOYAGE_API_KEY is not set')
  })

  it('throws on non-ok API response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    }))

    const provider = new VoyageEmbeddingProvider({ provider: 'voyage', model: 'voyage-code-3', dimensions: 1024 })
    await expect(provider.embed('test')).rejects.toThrow('Voyage API error: 401')
  })

  it('uses config.apiKey over env var when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeVoyageResponse(1024))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new VoyageEmbeddingProvider({
      provider: 'voyage',
      model: 'voyage-code-3',
      dimensions: 1024,
      apiKey: 'config-key-override',
    })
    await provider.embed('test')

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer config-key-override')
  })
})

// ---------------------------------------------------------------------------
// OpenAIEmbeddingProvider — mocked fetch (no real API calls)
// ---------------------------------------------------------------------------

describe('OpenAIEmbeddingProvider', () => {
  let savedKey: string | undefined

  beforeEach(() => {
    savedKey = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = 'test-openai-key'
  })

  afterEach(() => {
    if (savedKey === undefined) {
      delete process.env.OPENAI_API_KEY
    } else {
      process.env.OPENAI_API_KEY = savedKey
    }
    vi.restoreAllMocks()
  })

  it('returns Float32Array of correct dimensions from embed()', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOpenAIResponse(3072)))

    const provider = new OpenAIEmbeddingProvider({ provider: 'openai', model: 'text-embedding-3-large', dimensions: 3072 })
    const result = await provider.embed('hello world')

    expect(result).toBeInstanceOf(Float32Array)
    expect(result.length).toBe(3072)
  })

  it('embedBatch sends all texts in one request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(''),
      json: () => Promise.resolve({
        data: [
          { embedding: new Array(3072).fill(0.1) },
          { embedding: new Array(3072).fill(0.2) },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAIEmbeddingProvider({ provider: 'openai', model: 'text-embedding-3-large', dimensions: 3072 })
    const results = await provider.embedBatch(['text1', 'text2'])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(results).toHaveLength(2)
    expect(results[0]).toBeInstanceOf(Float32Array)
  })

  it('throws if OPENAI_API_KEY is not set', () => {
    delete process.env.OPENAI_API_KEY
    expect(() => new OpenAIEmbeddingProvider({ provider: 'openai', model: 'text-embedding-3-large' }))
      .toThrow('OPENAI_API_KEY is not set')
  })

  it('throws on non-ok API response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limit exceeded'),
    }))

    const provider = new OpenAIEmbeddingProvider({ provider: 'openai', model: 'text-embedding-3-large', dimensions: 3072 })
    await expect(provider.embed('test')).rejects.toThrow('OpenAI API error: 429')
  })
})

// ---------------------------------------------------------------------------
// createProvider — unknown provider throws
// ---------------------------------------------------------------------------

describe('createProvider', () => {
  it('throws on unknown provider name', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => createProvider({ provider: 'unknown_provider' as any, model: 'x' }))
      .toThrow('Unknown embedding provider: "unknown_provider"')
  })

  it('returns LocalEmbeddingProvider for provider: local', () => {
    const provider = createProvider({ provider: 'local', model: 'some-model', dimensions: 512 })
    expect(provider).toBeInstanceOf(LocalEmbeddingProvider)
  })

  it('returns VoyageEmbeddingProvider for provider: voyage (with apiKey in config)', () => {
    const provider = createProvider({
      provider: 'voyage',
      model: 'voyage-code-3',
      dimensions: 1024,
      apiKey: 'test-key',
    })
    expect(provider).toBeInstanceOf(VoyageEmbeddingProvider)
  })

  it('returns OpenAIEmbeddingProvider for provider: openai (with apiKey in config)', () => {
    const provider = createProvider({
      provider: 'openai',
      model: 'text-embedding-3-large',
      dimensions: 3072,
      apiKey: 'test-key',
    })
    expect(provider).toBeInstanceOf(OpenAIEmbeddingProvider)
  })
})
