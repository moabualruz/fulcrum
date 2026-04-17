// v2b PR 10 Task 1.7 — SQLite ↔ Kuzu divergence monitor tests.

import { describe, it, expect, vi } from 'vitest'
import {
  checkDivergence,
  type DivergeReport,
  type KuzuNodeChecker,
  type SqliteRowSampler,
} from '../divergence-monitor.js'

// Build a mock SqliteRowSampler returning fixed ids
function makeSampler(ids: string[]): SqliteRowSampler {
  return {
    sampleIds: vi.fn().mockReturnValue(ids),
  }
}

// Build a mock KuzuNodeChecker that treats given ids as "present" in Kuzu
function makeChecker(presentIds: Set<string>): KuzuNodeChecker {
  return {
    hasNode: vi.fn().mockImplementation(async (_table: string, id: string) => presentIds.has(id)),
  }
}

describe('divergence monitor — v2b PR 10 Task 1.7', () => {
  it('returns zero divergence when all sampled ids exist in Kuzu', async () => {
    const ids = ['a', 'b', 'c']
    const report = await checkDivergence(
      [{ table: 'Task', sqliteTable: 'tasks' }],
      makeSampler(ids),
      makeChecker(new Set(ids)),
      { sampleSize: 3 }
    )
    expect(report.totalChecked).toBe(3)
    expect(report.missingInKuzu).toBe(0)
    expect(report.driftPct).toBe(0)
    expect(report.missing).toHaveLength(0)
  })

  it('detects missing rows when Kuzu node was deleted but SQLite row remains', async () => {
    const ids = ['x', 'y', 'z']
    // Only 'y' exists in Kuzu — simulates divergence from deleted nodes
    const report = await checkDivergence(
      [{ table: 'Task', sqliteTable: 'tasks' }],
      makeSampler(ids),
      makeChecker(new Set(['y'])),
      { sampleSize: 3 }
    )
    expect(report.missingInKuzu).toBe(2)
    expect(report.totalChecked).toBe(3)
    expect(report.driftPct).toBeCloseTo(2 / 3)
    expect(report.missing.map(m => m.id)).toEqual(expect.arrayContaining(['x', 'z']))
  })

  it('reports drift across multiple table configs in one call', async () => {
    const sampler = makeSampler(['id1'])
    const checker = makeChecker(new Set()) // no nodes exist

    const report = await checkDivergence(
      [
        { table: 'Task', sqliteTable: 'tasks' },
        { table: 'AgentRun', sqliteTable: 'agent_runs' },
        { table: 'TeamInstance', sqliteTable: 'team_instances' },
      ],
      sampler,
      checker,
      { sampleSize: 1 }
    )
    // Sampler called once per table config
    expect(sampler.sampleIds).toHaveBeenCalledTimes(3)
    expect(report.missingInKuzu).toBe(3)
    expect(report.totalChecked).toBe(3)
  })

  it('returns isDrifting=true when driftPct exceeds threshold', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
    const present = new Set(['a']) // 9/10 missing = 90% drift
    const report = await checkDivergence(
      [{ table: 'Task', sqliteTable: 'tasks' }],
      makeSampler(ids),
      makeChecker(present),
      { sampleSize: 10, alertThreshold: 0.001 }
    )
    expect(report.isDrifting).toBe(true)
  })

  it('returns isDrifting=false when drift is below threshold', async () => {
    const ids = ['a', 'b', 'c']
    const report = await checkDivergence(
      [{ table: 'Task', sqliteTable: 'tasks' }],
      makeSampler(ids),
      makeChecker(new Set(ids)),
      { sampleSize: 3, alertThreshold: 0.001 }
    )
    expect(report.isDrifting).toBe(false)
  })
})
