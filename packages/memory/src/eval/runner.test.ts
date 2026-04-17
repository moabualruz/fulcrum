// packages/memory/src/eval/runner.test.ts
// Eval harness runner: seeds fixtures, runs queries, computes Recall@5 + NDCG@5,
// compares against a stored baseline and fails if metrics drop >5%.
// Set UPDATE_BASELINE=1 to regenerate the baseline.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { setDb, closeDb, _configureDb, runMigrations } from 'fulcrum-core'
import { writeMemory } from '../write.js'
import { recallMemory } from '../recall.js'
import { EVAL_FIXTURES } from './fixtures.js'
import { QUERY_CASES } from './queries.js'
import { recallAtK, ndcg } from './metrics.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'baseline.json')
const UPDATE_BASELINE = !!process.env.UPDATE_BASELINE

const WS = 'ws_runner_eval'
const PROJ = 'proj_runner_eval'

interface BaselineEntry {
  query_id: string
  recall_at_5: number
  ndcg_at_5: number
}

interface Baseline {
  created_at: string
  entries: BaselineEntry[]
  avg_recall_at_5: number
  avg_ndcg_at_5: number
}

let db: Database.Database

beforeAll(async () => {
  db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)

  db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES (?, ?)").run(WS, WS)
  db.prepare("INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES (?, ?, ?)").run(PROJ, WS, PROJ)

  // Seed all fixtures
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

describe('Memory Eval Harness — Recall@5 + NDCG@5 regression baseline', () => {
  it('Recall@5 and NDCG@5 meet or exceed baseline', async () => {
    const results: BaselineEntry[] = []

    for (const qc of QUERY_CASES) {
      const retrieved = await recallMemory({
        query: qc.query,
        workspace_id: WS,
        project_id: PROJ,
        limit: 5,
        mode: 'compact',
      })

      // Map retrieved results back to fixture IDs via title matching
      const retrievedIds = (retrieved as Array<{ title: string }>).map(r => {
        const fix = EVAL_FIXTURES.find(f => f.title === r.title)
        return fix?.id ?? ''
      }).filter(Boolean)

      const relevant = new Set(qc.relevant)

      results.push({
        query_id: qc.id,
        recall_at_5: recallAtK(relevant, retrievedIds, 5),
        ndcg_at_5: ndcg(retrievedIds, relevant, 5),
      })
    }

    const avgRecall = results.reduce((s, r) => s + r.recall_at_5, 0) / results.length
    const avgNdcg = results.reduce((s, r) => s + r.ndcg_at_5, 0) / results.length

    if (UPDATE_BASELINE || !existsSync(BASELINE_PATH)) {
      const baseline: Baseline = {
        created_at: new Date().toISOString(),
        entries: results,
        avg_recall_at_5: avgRecall,
        avg_ndcg_at_5: avgNdcg,
      }
      writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2))
      console.log(`Baseline written: Recall@5=${avgRecall.toFixed(3)}, NDCG@5=${avgNdcg.toFixed(3)}`)
      return
    }

    const baseline: Baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
    const threshold = 0.05 // 5% regression tolerance

    console.log(`Current:  Recall@5=${avgRecall.toFixed(3)}, NDCG@5=${avgNdcg.toFixed(3)}`)
    console.log(`Baseline: Recall@5=${baseline.avg_recall_at_5.toFixed(3)}, NDCG@5=${baseline.avg_ndcg_at_5.toFixed(3)}`)

    // Log any per-query regressions
    for (const entry of results) {
      const base = baseline.entries.find(e => e.query_id === entry.query_id)
      if (base && entry.recall_at_5 < base.recall_at_5 - threshold) {
        console.log(`  Regression [${entry.query_id}]: recall@5 ${base.recall_at_5.toFixed(2)} → ${entry.recall_at_5.toFixed(2)}`)
      }
    }

    expect(avgRecall).toBeGreaterThanOrEqual(baseline.avg_recall_at_5 - threshold)
    expect(avgNdcg).toBeGreaterThanOrEqual(baseline.avg_ndcg_at_5 - threshold)
  }, 120_000)
})
