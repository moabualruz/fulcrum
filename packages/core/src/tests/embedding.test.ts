import { describe, it, expect } from 'vitest'
import { LocalEmbeddingProvider, QUERY_PREFIX, DOC_PREFIX, truncateDimensions } from '../embedding/local.js'
import { LocalRerankerProvider } from '../embedding/reranker.js'

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
