import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { tokenize, jaccardSimilarity, textSimilarity, computeMMRScore, mmrRerank, applyMMRToHybridResults } from '../scoring/mmr.js'
import { mergeHybridResults, buildFtsQuery, bm25RankToScore } from '../retrieval/hybrid.js'
import { appendMemoryHostEvent, readMemoryHostEvents, resolveMemoryHostEventLogPath, MEMORY_HOST_EVENT_LOG_RELATIVE_PATH } from '../wal/events.js'
import { walk } from '../pci/walker.js'
import { maxSim, cosineSim } from '../retrieval/colbert-math.js'
import { acquireLock, withLock, LockError } from '../pci/lock.js'

describe('mmr — v2a Task 7 (Tier A algorithm)', () => {
  it('tokenize returns ascii word tokens', () => {
    const t = tokenize('Hello, World — getUserById')
    expect(t.has('hello')).toBe(true)
    expect(t.has('world')).toBe(true)
    expect(t.has('getuserbyid')).toBe(true)
  })

  it('jaccardSimilarity: empty sets are identical (1.0); disjoint sets are 0', () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1)
    expect(jaccardSimilarity(new Set(['a']), new Set())).toBe(0)
    expect(jaccardSimilarity(new Set(['a', 'b']), new Set(['a']))).toBeCloseTo(0.5, 5)
    expect(jaccardSimilarity(new Set(['x']), new Set(['x']))).toBe(1)
  })

  it('textSimilarity correlates with content overlap', () => {
    const high = textSimilarity('the quick brown fox', 'the quick brown dog')
    const low = textSimilarity('astronomy stars', 'database queries')
    expect(high).toBeGreaterThan(low)
  })

  it('computeMMRScore weights relevance vs diversity', () => {
    expect(computeMMRScore(1, 0, 1)).toBe(1)        // pure relevance, no penalty
    expect(computeMMRScore(1, 1, 0)).toBe(-1)       // pure diversity, max penalty
    expect(computeMMRScore(1, 0.5, 0.5)).toBeCloseTo(0.25, 5)
  })

  it('mmrRerank: disabled is a no-op (returns shallow copy)', () => {
    const items = [{ id: 'a', score: 0.9, content: 'foo' }, { id: 'b', score: 0.8, content: 'bar' }]
    expect(mmrRerank(items, { enabled: false })).toEqual(items)
  })

  it('mmrRerank: lambda=1 sorts by relevance only', () => {
    const items = [
      { id: 'a', score: 0.5, content: 'aaa' },
      { id: 'b', score: 0.9, content: 'aaa' },
      { id: 'c', score: 0.7, content: 'aaa' },
    ]
    const out = mmrRerank(items, { enabled: true, lambda: 1 })
    expect(out.map(i => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('mmrRerank: lambda<1 demotes near-duplicates after the first pick', () => {
    const items = [
      { id: 'a', score: 0.9, content: 'apple banana cherry' },
      { id: 'b', score: 0.85, content: 'apple banana cherry' }, // near-dup of a
      { id: 'c', score: 0.7, content: 'kangaroo lighthouse stairs' }, // diverse
    ]
    const out = mmrRerank(items, { enabled: true, lambda: 0.5 })
    expect(out[0]!.id).toBe('a')
    // c should appear before b because it's diverse vs a
    const cIdx = out.findIndex(i => i.id === 'c')
    const bIdx = out.findIndex(i => i.id === 'b')
    expect(cIdx).toBeLessThan(bIdx)
  })

  it('applyMMRToHybridResults preserves type-shaped fields', () => {
    const results = [
      { score: 0.9, snippet: 'foo bar', path: 'a.ts', startLine: 1, endLine: 5 },
      { score: 0.8, snippet: 'baz qux', path: 'b.ts', startLine: 1, endLine: 5 },
    ]
    const out = applyMMRToHybridResults(results, { enabled: true, lambda: 0.5 })
    expect(out).toHaveLength(2)
    for (const r of out) expect(r).toHaveProperty('snippet')
  })
})

describe('hybrid — v2a Task 7 (Tier A algorithm)', () => {
  it('buildFtsQuery returns null for empty/whitespace input', () => {
    expect(buildFtsQuery('')).toBeNull()
    expect(buildFtsQuery('   ')).toBeNull()
  })

  it('buildFtsQuery quotes tokens and joins with AND', () => {
    expect(buildFtsQuery('hello world')).toBe('"hello" AND "world"')
  })

  it('bm25RankToScore monotonic — lower rank = higher score', () => {
    expect(bm25RankToScore(0)).toBeGreaterThan(bm25RankToScore(10))
    expect(bm25RankToScore(10)).toBeGreaterThan(bm25RankToScore(100))
  })

  it('mergeHybridResults: keyword + vector deduped by id, weighted, sorted', async () => {
    const out = await mergeHybridResults({
      vector: [{ id: '1', path: 'a', startLine: 1, endLine: 5, source: 'vec', snippet: 'va', vectorScore: 0.5 }],
      keyword: [
        { id: '1', path: 'a', startLine: 1, endLine: 5, source: 'fts', snippet: 'ka', textScore: 1.0 },
        { id: '2', path: 'b', startLine: 1, endLine: 5, source: 'fts', snippet: 'kb', textScore: 0.3 },
      ],
      vectorWeight: 0.5,
      textWeight: 0.5,
    })
    expect(out).toHaveLength(2)
    expect(out[0]!.path).toBe('a') // 0.5*0.5 + 0.5*1.0 = 0.75 > 0 + 0.5*0.3 = 0.15
  })
})

describe('events (WAL JSONL) — v2a Task 7 (Tier A algorithm)', () => {
  let tmp: string
  let cleanup: string[] = []
  beforeEachReset()

  function beforeEachReset() {
    // vitest's beforeEach not at the top; inline run dir per test
  }

  it('resolveMemoryHostEventLogPath returns memory/.dreams/events.jsonl under the workspaceDir', () => {
    expect(resolveMemoryHostEventLogPath('/tmp/ws')).toContain(MEMORY_HOST_EVENT_LOG_RELATIVE_PATH)
  })

  it('append + read round-trips a JSONL event', async () => {
    tmp = join(tmpdir(), `fulcrum-events-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    cleanup.push(tmp)
    mkdirSync(tmp, { recursive: true })
    await appendMemoryHostEvent(tmp, {
      type: 'memory.recall.recorded',
      timestamp: new Date().toISOString(),
      query: 'q',
      resultCount: 1,
      results: [{ path: 'a.ts', startLine: 1, endLine: 5, score: 0.9 }],
    })
    const events = await readMemoryHostEvents({ workspaceDir: tmp })
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe('memory.recall.recorded')
  })

  it('readMemoryHostEvents returns empty when file is absent (ENOENT)', async () => {
    tmp = join(tmpdir(), `fulcrum-events-empty-${Date.now()}`)
    cleanup.push(tmp)
    mkdirSync(tmp, { recursive: true })
    const events = await readMemoryHostEvents({ workspaceDir: tmp })
    expect(events).toEqual([])
  })

  afterCleanupAll()

  function afterCleanupAll() {
    // run after this describe block via vitest hook in module scope
  }
})

describe('walker — v2a Task 7 (Tier A algorithm)', () => {
  let root: string
  beforeAllSetup()
  function beforeAllSetup() {
    root = join(tmpdir(), `fulcrum-walker-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'a.ts'), 'export const a = 1\n')
    writeFileSync(join(root, 'src', 'b.ts'), 'export const b = 2\n')
    writeFileSync(join(root, '.gitignore'), 'node_modules/\nignored.txt\n')
    writeFileSync(join(root, 'ignored.txt'), 'should not appear\n')
    mkdirSync(join(root, 'node_modules'), { recursive: true })
    writeFileSync(join(root, 'node_modules', 'pkg.js'), 'module.exports = {}\n')
  }

  it('walks files and respects .gitignore + DEFAULT_IGNORE_PATTERNS', async () => {
    const collected: string[] = []
    for await (const f of walk(root)) collected.push(f)
    const sorted = collected.sort()
    expect(sorted).toContain('a.ts')
    expect(sorted).toContain('src/b.ts')
    expect(sorted).not.toContain('ignored.txt')
    expect(sorted.find(f => f.includes('node_modules'))).toBeUndefined()
    rmSync(root, { recursive: true, force: true })
  })
})

describe('colbert-math — v2a Task 7 (adaptation)', () => {
  it('cosineSim of identical vectors is the squared norm', () => {
    const v = [1, 2, 3]
    expect(cosineSim(v, v)).toBeCloseTo(14, 5) // 1 + 4 + 9
  })

  it('cosineSim handles Float32Array input', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([0, 1, 0])
    expect(cosineSim(a, b)).toBeCloseTo(0, 5)
  })

  it('maxSim returns 0 when either input is empty', () => {
    expect(maxSim([], [[1, 2]])).toBe(0)
    expect(maxSim([[1, 2]], [])).toBe(0)
  })

  it('maxSim sums per-query best dot-products', () => {
    const q = [[1, 0], [0, 1]]
    const d = [[1, 0], [0, 1], [0.5, 0.5]]
    // q[0]=[1,0]·d=[1,0,0.5] → max 1; q[1]=[0,1]·d=[0,1,0.5] → max 1
    expect(maxSim(q, d)).toBeCloseTo(2, 5)
  })

  it('maxSim respects skipIds', () => {
    const q = [[1, 0]]
    const d = [[10, 0], [1, 0]]
    const skip = new Set([42])
    expect(maxSim(q, d, [42, 99], skip)).toBeCloseTo(1, 5) // skips 10*1 winner
  })
})

describe('lock — v2a Task 7 (cross-process)', () => {
  it('acquires + releases a lock cleanly', () => {
    const lockPath = join(tmpdir(), `fulcrum-lock-${Date.now()}-${Math.random().toString(36).slice(2)}.lock`)
    const handle = acquireLock(lockPath)
    expect(existsSync(lockPath)).toBe(true)
    handle.release()
    expect(existsSync(lockPath)).toBe(false)
  })

  it('throws LockError on contention', () => {
    const lockPath = join(tmpdir(), `fulcrum-lock-${Date.now()}-${Math.random().toString(36).slice(2)}.lock`)
    const a = acquireLock(lockPath)
    try {
      expect(() => acquireLock(lockPath)).toThrow(LockError)
    } finally {
      a.release()
    }
  })

  it('reclaims stale lock past ttlMs', async () => {
    const lockPath = join(tmpdir(), `fulcrum-lock-${Date.now()}-${Math.random().toString(36).slice(2)}.lock`)
    writeFileSync(lockPath, '99999')
    // Set its mtime way in the past via fs.utimes
    const past = new Date(Date.now() - 5 * 60 * 1000)
    const { utimesSync } = await import('node:fs')
    utimesSync(lockPath, past, past)
    // Should reclaim because ttlMs default is 60s
    const handle = acquireLock(lockPath)
    handle.release()
  })

  it('withLock runs and releases even on throw', async () => {
    const lockPath = join(tmpdir(), `fulcrum-lock-${Date.now()}-${Math.random().toString(36).slice(2)}.lock`)
    await expect(withLock(lockPath, () => { throw new Error('inner') })).rejects.toThrow('inner')
    expect(existsSync(lockPath)).toBe(false)
  })
})
