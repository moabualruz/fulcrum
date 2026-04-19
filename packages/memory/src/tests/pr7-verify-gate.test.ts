// packages/memory/src/tests/pr7-verify-gate.test.ts
//
// Memory v3 PR 7 unit 7.5 — end-to-end Verify gate for the lifecycle PR.
//
// Plan §7.5 pins three checks:
//   (1) decay curve matches Ebbinghaus within 1% over multi-day windows
//   (2) consolidation dry-run prints the expected merge candidates
//   (3) contradiction round-trip — inject a new page with contradicts[] →
//       apply → old page superseded → lint still clean
//
// Bundled as one file so the regression signal is "if PR 7 stops working
// end-to-end, this file turns red".

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getDb } from 'fulcrum-agent-core'
import {
  createTestDb,
  resetTestDb,
  seedWorkspaceAndProject,
} from './helpers.js'
import { runMigration101MemoryV3Lifecycle } from '../schema.js'
import { createCuratedPage, readCuratedPage } from '../l1/page.js'
import {
  applyDecay,
  DECAY_LAMBDA_PER_DAY,
  promoteToTier,
  archivePage,
} from '../l1/lifecycle.js'
import { applyCuratorOutput } from '../l1/apply.js'
import { findConsolidationCandidates } from '../l1/consolidate.js'
import { lintMemoryVault } from '../migration/lint.js'
import type { CuratedPage, L1RetentionTier } from '../l1/frontmatter.js'
import type { CuratorNewPage, CuratorOutput } from '../l1/curator.js'

let tmpVault: string
let prevVaultEnv: string | undefined

function seedL0OnDisk(source_id: string): void {
  const relDir = join(tmpVault, 'raw', 'bash_trace', '2026', '04', '10')
  mkdirSync(relDir, { recursive: true })
  writeFileSync(join(relDir, `${source_id}.md`), `---\nid: ${source_id}\n---\nbody\n`)
  getDb()
    .prepare(
      `INSERT INTO l0_sources (source_id, source_type, workspace_id, project_id,
         vault_path, content_hash, size_bytes, created_at)
       VALUES (?, 'bash_trace', 'ws_pr7', 'proj_pr7', ?, 'abc', 10, datetime('now'))`,
    )
    .run(source_id, `raw/bash_trace/2026/04/10/${source_id}.md`)
}

function seedEntity(id: string, name: string): void {
  getDb()
    .prepare(
      `INSERT INTO graph_entities (entity_id, workspace_id, name, entity_type,
         properties, created_at, updated_at)
       VALUES (?, 'ws_pr7', ?, 'concept', '{}', datetime('now'), datetime('now'))`,
    )
    .run(id, name)
}

function mkpage(overrides: Partial<CuratedPage> = {}): CuratedPage {
  return {
    id: '01KPR7_A',
    schema: 'fulcrum.memory/v3',
    type: 'concept',
    name: 'Auth',
    confidence: 0.8,
    first_seen: '2026-04-10T12:00:00Z',
    last_confirmed: '2026-04-10T12:00:00Z',
    retention_tier: 'working',
    access_count: 0,
    sources: ['01KL0_PR7_A'],
    sources_via: [],
    supersedes: [],
    superseded_by: null,
    entities: ['01KENT_AUTH'],
    workspace_id: 'ws_pr7',
    project_id: 'proj_pr7',
    body: '# Auth\n\nOld claim.\n\n- [[raw/bash_trace/2026/04/10/01KL0_PR7_A]]\n',
    ...overrides,
  }
}

beforeEach(() => {
  createTestDb()
  runMigration101MemoryV3Lifecycle(getDb())
  seedWorkspaceAndProject(getDb(), 'ws_pr7', 'proj_pr7')
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-pr7-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
  seedEntity('01KENT_AUTH', 'Auth')
  seedEntity('01KENT_TOKEN', 'Token')
})

afterEach(() => {
  resetTestDb()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
})

describe('PR 7 Verify gate — decay curve within 1% of Ebbinghaus', () => {
  it.each<{ tier: L1RetentionTier; days: number }>([
    { tier: 'working', days: 1 },
    { tier: 'working', days: 3 },
    { tier: 'episodic', days: 7 },
    { tier: 'episodic', days: 14 },
    { tier: 'semantic', days: 30 },
    { tier: 'semantic', days: 90 },
    { tier: 'procedural', days: 180 },
    { tier: 'procedural', days: 365 },
  ])(
    '%s tier over %d days matches exp(-λ·t) within 1%%',
    ({ tier, days }) => {
      seedL0OnDisk('01KL0_PR7_A')
      const baseId = `01KDC_${tier}_${days}`
      createCuratedPage(
        mkpage({
          id: baseId,
          retention_tier: tier,
          confidence: 1.0,
          last_confirmed: '2026-04-10T12:00:00Z',
        }),
      )
      // Match the first-pass anchor behaviour in the lifecycle tests.
      getDb()
        .prepare('UPDATE memories SET confidence_decay_at = NULL WHERE memory_id = ?')
        .run(baseId)

      const now = new Date(
        new Date('2026-04-10T12:00:00Z').getTime() + days * 86_400_000,
      )
      applyDecay(getDb(), { now })

      const row = getDb()
        .prepare('SELECT confidence FROM memories WHERE memory_id = ?')
        .get(baseId) as { confidence: number }
      const expected = Math.exp(-DECAY_LAMBDA_PER_DAY[tier] * days)
      const relativeError = Math.abs(row.confidence - expected) / expected
      expect(relativeError).toBeLessThan(0.01)
    },
  )
})

describe('PR 7 Verify gate — consolidation dry-run prints proposed merges', () => {
  it('returns the two-page collision as a candidate', () => {
    seedL0OnDisk('01KL0_PR7_A')
    createCuratedPage(mkpage({ id: '01KCS_V1', entities: ['01KENT_AUTH'] }))
    createCuratedPage(
      mkpage({ id: '01KCS_V2', entities: ['01KENT_AUTH'], confidence: 0.7 }),
    )
    const candidates = findConsolidationCandidates(getDb(), {
      workspace_id: 'ws_pr7',
      min_confidence: 0.5,
    })
    expect(candidates.length).toBe(1)
    expect(candidates[0]!.entity_set).toEqual(['01KENT_AUTH'])
    expect(candidates[0]!.page_ids.sort()).toEqual(['01KCS_V1', '01KCS_V2'])
    expect(candidates[0]!.min_confidence_in_group).toBeCloseTo(0.7, 4)
  })

  it('skips collisions that fall below min_confidence', () => {
    seedL0OnDisk('01KL0_PR7_A')
    createCuratedPage(mkpage({ id: '01KCS_L1', confidence: 0.4 }))
    createCuratedPage(mkpage({ id: '01KCS_L2', confidence: 0.9 }))
    const candidates = findConsolidationCandidates(getDb(), {
      workspace_id: 'ws_pr7',
      min_confidence: 0.5,
    })
    expect(candidates.length).toBe(0)
  })
})

describe('PR 7 Verify gate — contradiction round-trip ends with lint clean', () => {
  it('seeds an old page → applies a contradicting new page → old is superseded → lint clean', () => {
    // --- Seed the "before" state: old page grounded in L0_A. ---
    seedL0OnDisk('01KL0_PR7_A')
    const oldPage = createCuratedPage(
      mkpage({
        id: '01KPR7_OLD',
        confidence: 0.5,
        sources: ['01KL0_PR7_A'],
      }),
    )

    // --- Inject the correction L0. ---
    seedL0OnDisk('01KL0_PR7_B')

    // --- Run the apply-layer with a curator-shaped output that contradicts
    //     the old page. Stubbed (no real LLM) — the apply-layer is what the
    //     7.2 detector gates on. ---
    const draft: CuratorNewPage = {
      type: 'concept',
      name: 'Auth',
      title: null,
      entity_type: null,
      aliases: null,
      confidence: 0.9,
      retention_tier: 'working',
      sources: ['01KL0_PR7_B'],
      sources_via: [],
      entities: ['01KENT_AUTH'],
      body: '# Auth\n\nUpdated.\n\n- [[raw/bash_trace/2026/04/10/01KL0_PR7_B]]\n',
      contradicts: [oldPage.id],
    }
    const output: CuratorOutput = {
      new_pages: [draft],
      updates: [],
      supersessions: [],
      new_edges: [],
    }
    const result = applyCuratorOutput(output, {
      workspace_id: 'ws_pr7',
      project_id: 'proj_pr7',
      curator_input_sources: ['01KL0_PR7_B'],
    })

    // --- Verify: the old page is now superseded by the new one. ---
    expect(result.superseded_pairs.length).toBe(1)
    const newId = result.created_page_ids[0]!
    const superseded = getDb()
      .prepare('SELECT superseded_by FROM memories WHERE memory_id = ?')
      .get(oldPage.id) as { superseded_by: string | null }
    expect(superseded.superseded_by).toBe(newId)

    // --- Verify: the new page's supersedes[] now carries the old id. ---
    const newPage = readCuratedPage(newId)
    expect(newPage?.supersedes).toContain(oldPage.id)

    // --- Verify: lint is clean on the cut-over vault. ---
    const report = lintMemoryVault(getDb(), {
      vaultPath: tmpVault,
      now: new Date('2026-04-15T00:00:00Z'),
    })
    expect(report.counts.missing_sources).toBe(0)
    expect(report.counts.supersession_cycles).toBe(0)
    expect(report.counts.broken_wikilinks).toBe(0)
    expect(report.counts.sources_wikilink_divergence).toBe(0)
    expect(report.counts.template_violations).toBe(0)
    expect(report.ok).toBe(true)
  })
})

describe('PR 7 Verify gate — lifecycle primitives compose', () => {
  it('decay → promote → archive leaves the page ready for follow-up work', () => {
    seedL0OnDisk('01KL0_PR7_A')
    createCuratedPage(
      mkpage({
        id: '01KLCP_A',
        retention_tier: 'working',
        confidence: 1.0,
        last_confirmed: '2026-04-10T12:00:00Z',
      }),
    )
    getDb()
      .prepare('UPDATE memories SET confidence_decay_at = NULL WHERE memory_id = ?')
      .run('01KLCP_A')

    applyDecay(getDb(), { now: new Date('2026-04-11T12:00:00Z') })
    const afterDecay = getDb()
      .prepare('SELECT confidence, retention_tier FROM memories WHERE memory_id = ?')
      .get('01KLCP_A') as { confidence: number; retention_tier: string }
    expect(afterDecay.confidence).toBeCloseTo(Math.exp(-0.3), 4)
    expect(afterDecay.retention_tier).toBe('working')

    promoteToTier('01KLCP_A', 'semantic')
    const afterPromote = getDb()
      .prepare('SELECT retention_tier FROM memories WHERE memory_id = ?')
      .get('01KLCP_A') as { retention_tier: string }
    expect(afterPromote.retention_tier).toBe('semantic')

    const archived = archivePage('01KLCP_A')
    expect(archived.archived).toBe(true)
    expect(archived.new_path).toMatch(/^curated\/\.archive\//)
  })
})
