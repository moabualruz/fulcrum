// packages/memory/src/tests/eval-harness.test.ts
// Retrieval evaluation harness: seeds 50 fixtures, runs 25 query cases,
// asserts aggregate recall@5 >= 0.70.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { setDb, closeDb, _configureDb, runMigrations } from 'fulcrum-agent-core'
import { writeMemory } from '../write.js'
import { recallMemory } from '../recall.js'
import { EVAL_FIXTURES } from '../eval/fixtures.js'
import { QUERY_CASES } from '../eval/queries.js'
import { recallAtK, precisionAtK, aggregate } from '../eval/metrics.js'
import type { EvalResult } from '../eval/metrics.js'

const WS = 'ws_eval'
const PROJ = 'proj_eval'

let db: Database.Database

beforeAll(async () => {
  db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)

  db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES (?, ?)").run(WS, WS)
  db.prepare("INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES (?, ?, ?)").run(PROJ, WS, PROJ)

  // Seed all 50 fixtures
  for (const fix of EVAL_FIXTURES) {
    await writeMemory({
      workspace_id: WS,
      project_id: PROJ,
      title: fix.title,
      summary: fix.summary,
      content: fix.content,
      kind: fix.kind as Parameters<typeof writeMemory>[0]['kind'],
      scope: fix.scope as Parameters<typeof writeMemory>[0]['scope'],
      tags: fix.tags,
      importance: 0.7,
    })
  }
}, 60_000)

afterAll(() => {
  closeDb()
})

describe('retrieval eval harness — 60 fixtures, 35 query cases', () => {
  it('all 60 fixtures are indexed', () => {
    const count = db.prepare('SELECT count(*) as n FROM memories WHERE workspace_id = ?').get(WS) as { n: number }
    expect(count.n).toBeGreaterThanOrEqual(60)
  })

  it('individual query cases — recall@5 per query', async () => {
    const results: EvalResult[] = []

    for (const qc of QUERY_CASES) {
      const retrieved = await recallMemory({
        query: qc.query,
        workspace_id: WS,
        project_id: PROJ,
        limit: 5,
        mode: 'compact',
      })

      // Map retrieved results back to fixture IDs
      const retrievedIds = (retrieved as Array<{ title: string }>).map(r => {
        const fix = EVAL_FIXTURES.find(f => f.title === r.title)
        return fix?.id ?? ''
      }).filter(Boolean)

      const relevant = new Set(qc.relevant)
      const r5 = recallAtK(relevant, retrievedIds, 5)
      const p5 = precisionAtK(relevant, retrievedIds, 5)
      const rrAt1 = retrievedIds.findIndex(id => relevant.has(id))
      const rr = rrAt1 >= 0 ? 1 / (rrAt1 + 1) : 0

      results.push({
        queryId: qc.id,
        query: qc.query,
        recallAt5: r5,
        precisionAt5: p5,
        reciprocalRank: rr,
      })
    }

    const agg = aggregate(results)

    // Report failing cases for debugging
    const failing = results.filter(r => r.recallAt5 < 0.5)
    if (failing.length > 0) {
      console.log('Failing queries (recall@5 < 0.5):')
      for (const f of failing) {
        console.log(`  [${f.queryId}] "${f.query}" → recall@5=${f.recallAt5.toFixed(2)}`)
      }
    }

    // Assert aggregate recall@5 >= 0.70
    expect(agg.meanRecallAt5).toBeGreaterThanOrEqual(0.70)
    expect(agg.totalCount).toBe(QUERY_CASES.length) // now 35
  })

  it('metrics: recallAtK with full overlap returns 1.0', () => {
    const relevant = new Set(['a', 'b', 'c'])
    expect(recallAtK(relevant, ['a', 'b', 'c', 'd', 'e'], 5)).toBe(1.0)
  })

  it('metrics: recallAtK with no overlap returns 0.0', () => {
    const relevant = new Set(['x', 'y'])
    expect(recallAtK(relevant, ['a', 'b', 'c', 'd', 'e'], 5)).toBe(0.0)
  })

  it('metrics: recallAtK with partial overlap', () => {
    const relevant = new Set(['a', 'b', 'c', 'd'])
    expect(recallAtK(relevant, ['a', 'b', 'x', 'y', 'z'], 5)).toBeCloseTo(0.5)
  })

  it('metrics: precisionAtK', () => {
    const relevant = new Set(['a', 'b'])
    expect(precisionAtK(relevant, ['a', 'x', 'b', 'y', 'z'], 5)).toBeCloseTo(0.4)
  })

  it('metrics: empty relevant set is vacuously 1.0', () => {
    expect(recallAtK(new Set(), ['a', 'b'], 2)).toBe(1.0)
  })
})
