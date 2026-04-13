import { describe, it, expect } from 'vitest'
import { LocalEmbeddingProvider } from '../embedding/local.js'
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
