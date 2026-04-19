// packages/memory/src/tests/l1-lifecycle.test.ts
//
// Memory v3 PR 7 unit 7.1 — L1 lifecycle primitives: applyDecay,
// promoteToTier, archivePage.
//
// Plan §Lifecycle: confidence *= exp(-λ * days_since_last_confirm);
// λ per retention_tier — working 0.3, episodic 0.1, semantic 0.01,
// procedural 0.001. Archival moves the vault file into curated/.archive/
// and updates memories.vault_path; the memories row stays (audit).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import {
  runMigration101MemoryV3Lifecycle,
  runMigration103MemoryV3Cutover,
} from '../schema.js'
import { createCuratedPage, readCuratedPage } from '../l1/page.js'
import {
  applyDecay,
  promoteToTier,
  archivePage,
  DECAY_LAMBDA_PER_DAY,
} from '../l1/lifecycle.js'
import type { CuratedPage, L1RetentionTier } from '../l1/frontmatter.js'

let tmpVault: string
let prevVaultEnv: string | undefined

function mkpage(overrides: Partial<CuratedPage> = {}): CuratedPage {
  return {
    id: '01KLIFE_A',
    schema: 'fulcrum.memory/v3',
    type: 'page',
    title: 'Auth page',
    confidence: 1.0,
    first_seen: '2026-04-10T12:00:00Z',
    last_confirmed: '2026-04-10T12:00:00Z',
    retention_tier: 'working',
    access_count: 0,
    sources: ['01KL0SRC_1'],
    sources_via: [],
    supersedes: [],
    superseded_by: null,
    entities: [],
    workspace_id: 'ws_lc',
    project_id: 'proj_lc',
    body: '# Auth\n\n- [[raw/bash_trace/2026/04/10/01KL0SRC_1]]\n',
    ...overrides,
  }
}

beforeEach(() => {
  createTestDb()
  runMigration101MemoryV3Lifecycle(getDb())
  seedWorkspaceAndProject(getDb(), 'ws_lc', 'proj_lc')
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-l1-life-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
})

afterEach(() => {
  resetTestDb()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
})

describe('DECAY_LAMBDA_PER_DAY', () => {
  it('exposes the plan-specified per-tier lambdas', () => {
    expect(DECAY_LAMBDA_PER_DAY.working).toBeCloseTo(0.3, 6)
    expect(DECAY_LAMBDA_PER_DAY.episodic).toBeCloseTo(0.1, 6)
    expect(DECAY_LAMBDA_PER_DAY.semantic).toBeCloseTo(0.01, 6)
    expect(DECAY_LAMBDA_PER_DAY.procedural).toBeCloseTo(0.001, 6)
  })
})

describe('applyDecay', () => {
  function seedPageWithLastConfirm(
    id: string,
    tier: L1RetentionTier,
    confidence: number,
    last_confirmed_iso: string,
  ): void {
    createCuratedPage(
      mkpage({
        id,
        retention_tier: tier,
        confidence,
        last_confirmed: last_confirmed_iso,
      }),
    )
    // createCuratedPage stamps confidence_decay_at with wall-clock-now. Clear
    // it so the first-pass anchor falls back to updated_at (our seeded
    // last_confirmed) — what every test in this block exercises.
    getDb()
      .prepare('UPDATE memories SET confidence_decay_at = NULL WHERE memory_id = ?')
      .run(id)
  }

  it('decays a working-tier page exactly by exp(-0.3 * 1) over 1 day', () => {
    const now = new Date('2026-04-11T12:00:00Z')
    seedPageWithLastConfirm('01KDEC_A', 'working', 1.0, '2026-04-10T12:00:00Z')
    const res = applyDecay(getDb(), { now })
    expect(res.pages_decayed).toBe(1)
    const row = getDb()
      .prepare('SELECT confidence, confidence_decay_at FROM memories WHERE memory_id = ?')
      .get('01KDEC_A') as { confidence: number; confidence_decay_at: string }
    expect(row.confidence).toBeCloseTo(Math.exp(-0.3), 4)
    expect(row.confidence_decay_at).toBe(now.toISOString())
  })

  it('decays semantic tier by exp(-0.01 * 10) over 10 days', () => {
    const now = new Date('2026-04-20T12:00:00Z')
    seedPageWithLastConfirm('01KDEC_S', 'semantic', 1.0, '2026-04-10T12:00:00Z')
    applyDecay(getDb(), { now })
    const row = getDb()
      .prepare('SELECT confidence FROM memories WHERE memory_id = ?')
      .get('01KDEC_S') as { confidence: number }
    expect(row.confidence).toBeCloseTo(Math.exp(-0.1), 4)
  })

  it('decays procedural tier by exp(-0.001 * 30) over 30 days (barely)', () => {
    const now = new Date('2026-05-10T12:00:00Z')
    seedPageWithLastConfirm('01KDEC_P', 'procedural', 1.0, '2026-04-10T12:00:00Z')
    applyDecay(getDb(), { now })
    const row = getDb()
      .prepare('SELECT confidence FROM memories WHERE memory_id = ?')
      .get('01KDEC_P') as { confidence: number }
    expect(row.confidence).toBeCloseTo(Math.exp(-0.03), 4)
  })

  it('uses confidence_decay_at as the anchor on subsequent passes', () => {
    const day0 = new Date('2026-04-10T12:00:00Z')
    const day1 = new Date('2026-04-11T12:00:00Z')
    const day2 = new Date('2026-04-12T12:00:00Z')
    seedPageWithLastConfirm('01KDEC_R', 'working', 1.0, day0.toISOString())
    applyDecay(getDb(), { now: day1 })
    applyDecay(getDb(), { now: day2 })
    const row = getDb()
      .prepare('SELECT confidence FROM memories WHERE memory_id = ?')
      .get('01KDEC_R') as { confidence: number }
    // Two independent 1-day decays against the preceding anchor: exp(-0.3)^2
    expect(row.confidence).toBeCloseTo(Math.exp(-0.6), 4)
  })

  it('skips rows already decayed within the last hour (idempotent on re-run)', () => {
    const now = new Date('2026-04-11T12:00:00Z')
    seedPageWithLastConfirm('01KDEC_I', 'working', 1.0, '2026-04-10T12:00:00Z')
    const r1 = applyDecay(getDb(), { now })
    const after1 = getDb()
      .prepare('SELECT confidence FROM memories WHERE memory_id = ?')
      .get('01KDEC_I') as { confidence: number }
    const r2 = applyDecay(getDb(), { now: new Date(now.getTime() + 5 * 60_000) })
    const after2 = getDb()
      .prepare('SELECT confidence FROM memories WHERE memory_id = ?')
      .get('01KDEC_I') as { confidence: number }
    expect(r1.pages_decayed).toBe(1)
    expect(r2.pages_decayed).toBe(0)
    expect(after2.confidence).toBeCloseTo(after1.confidence, 6)
  })

  it('skips pre-v3 rows (schema_version < 3)', () => {
    const now = new Date('2026-04-11T12:00:00Z')
    getDb()
      .prepare(
        `INSERT INTO memories (memory_id, workspace_id, project_id, scope, kind, content,
           confidence, retention_tier, confidence_decay_at, access_count, schema_version,
           created_at, updated_at, last_accessed_at)
         VALUES (?, 'ws_lc', 'proj_lc', 'project', 'decision', 'x',
           1.0, 'working', NULL, 0, 2,
           '2026-04-10T12:00:00Z', '2026-04-10T12:00:00Z', '2026-04-10T12:00:00Z')`,
      )
      .run('01KDEC_OLD')
    applyDecay(getDb(), { now })
    const row = getDb()
      .prepare('SELECT confidence FROM memories WHERE memory_id = ?')
      .get('01KDEC_OLD') as { confidence: number }
    expect(row.confidence).toBe(1.0)
  })

  it('skips superseded rows', () => {
    const now = new Date('2026-04-11T12:00:00Z')
    seedPageWithLastConfirm('01KDEC_SUP', 'working', 1.0, '2026-04-10T12:00:00Z')
    getDb()
      .prepare('UPDATE memories SET superseded_by = ? WHERE memory_id = ?')
      .run('01KDEC_NEW', '01KDEC_SUP')
    applyDecay(getDb(), { now })
    const row = getDb()
      .prepare('SELECT confidence FROM memories WHERE memory_id = ?')
      .get('01KDEC_SUP') as { confidence: number }
    expect(row.confidence).toBe(1.0)
  })

  it('returns counts.tiers per-retention_tier', () => {
    const now = new Date('2026-04-11T12:00:00Z')
    seedPageWithLastConfirm('01KDEC_W1', 'working', 1.0, '2026-04-10T12:00:00Z')
    seedPageWithLastConfirm('01KDEC_W2', 'working', 0.5, '2026-04-10T12:00:00Z')
    seedPageWithLastConfirm('01KDEC_E1', 'episodic', 1.0, '2026-04-10T12:00:00Z')
    const res = applyDecay(getDb(), { now })
    expect(res.pages_decayed).toBe(3)
    expect(res.tiers.working).toBe(2)
    expect(res.tiers.episodic).toBe(1)
    expect(res.tiers.semantic).toBe(0)
    expect(res.tiers.procedural).toBe(0)
  })

  it('handles 10k pages in under 10 seconds (plan §PR 7 budget)', () => {
    const now = new Date('2026-04-11T12:00:00Z')
    const db = getDb()
    const insertBulk = db.prepare(
      `INSERT INTO memories (memory_id, workspace_id, project_id, scope, kind, content,
         confidence, retention_tier, confidence_decay_at, access_count, schema_version,
         created_at, updated_at, last_accessed_at, vault_path, provenance, supersedes, superseded_by)
       VALUES (?, 'ws_lc', 'proj_lc', 'project', 'page', 'x',
         1.0, 'working', NULL, 0, 3,
         '2026-04-10T12:00:00Z', '2026-04-10T12:00:00Z', '2026-04-10T12:00:00Z',
         '', '{}', '[]', NULL)`,
    )
    const tx = db.transaction(() => {
      for (let i = 0; i < 10_000; i++) insertBulk.run(`01KDEC_BULK_${i}`)
    })
    tx()
    const t0 = Date.now()
    const res = applyDecay(db, { now })
    const elapsed = Date.now() - t0
    expect(res.pages_decayed).toBe(10_000)
    expect(elapsed).toBeLessThan(10_000)
  })
})

describe('promoteToTier', () => {
  it('updates memories.retention_tier and rewrites vault frontmatter', () => {
    createCuratedPage(mkpage({ id: '01KPROMO_A', retention_tier: 'working' }))
    promoteToTier('01KPROMO_A', 'semantic')
    const row = getDb()
      .prepare('SELECT retention_tier FROM memories WHERE memory_id = ?')
      .get('01KPROMO_A') as { retention_tier: string }
    expect(row.retention_tier).toBe('semantic')
    const page = readCuratedPage('01KPROMO_A')
    expect(page?.retention_tier).toBe('semantic')
  })

  it('rejects an invalid target tier', () => {
    createCuratedPage(mkpage({ id: '01KPROMO_B' }))
    expect(() =>
      promoteToTier('01KPROMO_B', 'bogus' as L1RetentionTier),
    ).toThrow(/retention_tier/i)
  })

  it('throws not_found on a missing page', () => {
    expect(() => promoteToTier('01KPROMO_MISSING', 'semantic')).toThrow(/not.?found|not found/i)
  })
})

describe('archivePage', () => {
  it('moves the vault file under curated/.archive/ and updates vault_path', () => {
    const created = createCuratedPage(mkpage({ id: '01KARCH_A', type: 'page', title: 'A' }))
    const originalPath = join(tmpVault, 'curated', 'pages', `${created.id}.md`)
    expect(existsSync(originalPath)).toBe(true)

    const res = archivePage('01KARCH_A')
    expect(res.archived).toBe(true)
    expect(existsSync(originalPath)).toBe(false)
    const archivePath = join(tmpVault, 'curated', '.archive', 'pages', `${created.id}.md`)
    expect(existsSync(archivePath)).toBe(true)

    const row = getDb()
      .prepare('SELECT vault_path FROM memories WHERE memory_id = ?')
      .get('01KARCH_A') as { vault_path: string }
    expect(row.vault_path).toBe(`curated/.archive/pages/${created.id}.md`)
  })

  it('preserves the memories row (audit, not deletion)', () => {
    createCuratedPage(mkpage({ id: '01KARCH_B', type: 'page', title: 'B' }))
    archivePage('01KARCH_B')
    const row = getDb()
      .prepare('SELECT memory_id, content, confidence FROM memories WHERE memory_id = ?')
      .get('01KARCH_B') as { memory_id: string; content: string; confidence: number } | undefined
    expect(row).toBeDefined()
    expect(row?.memory_id).toBe('01KARCH_B')
  })

  it('is idempotent — second call returns archived=false', () => {
    createCuratedPage(mkpage({ id: '01KARCH_IDEM', type: 'page', title: 'I' }))
    const r1 = archivePage('01KARCH_IDEM')
    const r2 = archivePage('01KARCH_IDEM')
    expect(r1.archived).toBe(true)
    expect(r2.archived).toBe(false)
  })

  it('throws not_found when the page id is unknown', () => {
    expect(() => archivePage('01KARCH_MISSING')).toThrow(/not.?found|not found/i)
  })

  it('keeps the file contents intact after move', () => {
    const page = createCuratedPage(
      mkpage({ id: '01KARCH_CONTENT', type: 'page', title: 'C', body: '# C\n\n- [[raw/bash_trace/2026/04/10/01KL0SRC_1]]\nhello\n' }),
    )
    archivePage(page.id)
    const archiveFile = join(tmpVault, 'curated', '.archive', 'pages', `${page.id}.md`)
    const content = readFileSync(archiveFile, 'utf8')
    expect(content).toContain('hello')
    expect(content).toContain('id: 01KARCH_CONTENT')
  })
})

describe('runMigration103MemoryV3Cutover compatibility', () => {
  it('applyDecay still works after the NOT NULL cutover', () => {
    createCuratedPage(
      mkpage({ id: '01KDEC_CUT', last_confirmed: '2026-04-10T12:00:00Z' }),
    )
    // Stamp an anchor 1 day before `now` so the cutover pass has work to do.
    getDb()
      .prepare(
        'UPDATE memories SET confidence_decay_at = ? WHERE memory_id = ?',
      )
      .run('2026-04-10T12:00:00Z', '01KDEC_CUT')
    runMigration103MemoryV3Cutover(getDb())
    const now = new Date('2026-04-11T12:00:00Z')
    const res = applyDecay(getDb(), { now })
    expect(res.pages_decayed).toBe(1)
  })
})
