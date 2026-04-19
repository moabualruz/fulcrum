// packages/memory/src/tests/migration-lint-ext.test.ts
//
// Memory v3 PR 7 unit 7.3 — extended lint categories on top of the PR 6.5
// foundation: broken wikilinks, stale claims, sources/wikilink divergence,
// retrospective template-validator violations.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, unlinkSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getDb } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import {
  runMigration101MemoryV3Lifecycle,
  runMigration102MemoryV3SourceIndex,
} from '../schema.js'
import { createCuratedPage } from '../l1/page.js'
import { lintMemoryVault } from '../migration/lint.js'
import type { CuratedPage } from '../l1/frontmatter.js'

let tmpVault: string
let prevVaultEnv: string | undefined

function seedL0(source_id: string, source_type = 'bash_trace'): void {
  const relPath = `raw/${source_type}/2026/04/10/${source_id}.md`
  getDb()
    .prepare(
      `INSERT INTO l0_sources (source_id, source_type, workspace_id, project_id,
         vault_path, content_hash, size_bytes, created_at)
       VALUES (?, ?, 'ws_lx', 'proj_lx', ?, 'abc', 10, datetime('now'))`,
    )
    .run(source_id, source_type, relPath)
  // Mirror real ingestion: the l0_sources row and the vault file go together.
  // Tests that assert BROKEN_WIKILINK unlink the file explicitly.
  const absDir = join(tmpVault, 'raw', source_type, '2026', '04', '10')
  mkdirSync(absDir, { recursive: true })
  writeFileSync(join(absDir, `${source_id}.md`), `---\nid: ${source_id}\n---\nbody\n`)
}

function mkpage(overrides: Partial<CuratedPage> = {}): CuratedPage {
  return {
    id: '01KLX_A',
    schema: 'fulcrum.memory/v3',
    type: 'page',
    title: 'Lint page',
    confidence: 0.8,
    first_seen: '2026-04-10T12:00:00Z',
    last_confirmed: '2026-04-10T12:00:00Z',
    retention_tier: 'working',
    access_count: 0,
    sources: ['01KL0_LX1'],
    sources_via: [],
    supersedes: [],
    superseded_by: null,
    entities: [],
    workspace_id: 'ws_lx',
    project_id: 'proj_lx',
    body: '# Lint\n\n- [[raw/bash_trace/2026/04/10/01KL0_LX1]]\n',
    ...overrides,
  }
}

beforeEach(() => {
  createTestDb()
  runMigration101MemoryV3Lifecycle(getDb())
  runMigration102MemoryV3SourceIndex(getDb())
  seedWorkspaceAndProject(getDb(), 'ws_lx', 'proj_lx')
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-lint-ext-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
})

afterEach(() => {
  resetTestDb()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
})

describe('lintMemoryVault — BROKEN_WIKILINK', () => {
  it('reports wikilinks whose L0 file is missing on disk', () => {
    seedL0('01KL0_LX1')
    createCuratedPage(mkpage({ id: '01KLX_BW', sources: ['01KL0_LX1'] }))

    const cleanReport = lintMemoryVault(getDb(), {
      vaultPath: tmpVault,
      now: new Date('2026-04-15T00:00:00Z'),
    })
    expect(cleanReport.counts.broken_wikilinks).toBe(0)

    unlinkSync(join(tmpVault, 'raw', 'bash_trace', '2026', '04', '10', '01KL0_LX1.md'))
    const brokenReport = lintMemoryVault(getDb(), {
      vaultPath: tmpVault,
      now: new Date('2026-04-15T00:00:00Z'),
    })
    expect(brokenReport.counts.broken_wikilinks).toBe(1)
    expect(brokenReport.ok).toBe(false)
    expect(brokenReport.issues.some(i => i.code === 'BROKEN_WIKILINK')).toBe(true)
  })

  it('does not report wikilinks whose L0 row is missing (already flagged by MISSING_SOURCE)', () => {
    // sources=['01KL0_GONE'] has no l0_sources row → already MISSING_SOURCE.
    // The body wikilink is also broken, but we only raise BROKEN_WIKILINK
    // when the l0_sources row exists yet the file is missing — otherwise we
    // double-count the same defect.
    createCuratedPage(
      mkpage({
        id: '01KLX_BW2',
        sources: ['01KL0_GONE'],
        body: '# Lint\n\n- [[raw/bash_trace/2026/04/10/01KL0_GONE]]\n',
      }),
    )
    const report = lintMemoryVault(getDb(), { vaultPath: tmpVault })
    expect(report.counts.broken_wikilinks).toBe(0)
    expect(report.counts.missing_sources).toBe(1)
  })
})

describe('lintMemoryVault — STALE_CLAIM', () => {
  it('flags pages with last_confirmed > 90d AND confidence > 0.5', () => {
    seedL0('01KL0_LX1')
    const now = new Date('2026-07-15T00:00:00Z')
    // last_confirmed is 120 days before `now`; confidence 0.8 > 0.5 → stale.
    createCuratedPage(
      mkpage({
        id: '01KLX_STALE',
        last_confirmed: '2026-03-17T00:00:00Z',
        confidence: 0.8,
      }),
    )
    const report = lintMemoryVault(getDb(), { vaultPath: tmpVault, now })
    expect(report.counts.stale_claims).toBe(1)
    expect(report.issues.some(i => i.code === 'STALE_CLAIM' && i.page_id === '01KLX_STALE')).toBe(true)
  })

  it('does NOT flag low-confidence old pages (confidence <= 0.5)', () => {
    seedL0('01KL0_LX1')
    const now = new Date('2026-07-15T00:00:00Z')
    createCuratedPage(
      mkpage({
        id: '01KLX_LOWCONF',
        last_confirmed: '2026-03-17T00:00:00Z',
        confidence: 0.3,
      }),
    )
    const report = lintMemoryVault(getDb(), { vaultPath: tmpVault, now })
    expect(report.counts.stale_claims).toBe(0)
  })

  it('does NOT flag recently-confirmed high-confidence pages', () => {
    seedL0('01KL0_LX1')
    const now = new Date('2026-04-15T00:00:00Z')
    createCuratedPage(
      mkpage({
        id: '01KLX_FRESH',
        last_confirmed: '2026-04-10T00:00:00Z',
        confidence: 0.9,
      }),
    )
    const report = lintMemoryVault(getDb(), { vaultPath: tmpVault, now })
    expect(report.counts.stale_claims).toBe(0)
  })
})

describe('lintMemoryVault — SOURCES_WIKILINK_DIVERGENCE', () => {
  it('flags frontmatter sources[] with no inline reference', () => {
    seedL0('01KL0_LX1')
    seedL0('01KL0_LX2')
    // sources has LX2 but body only links LX1 → divergence.
    createCuratedPage(
      mkpage({
        id: '01KLX_DIV1',
        sources: ['01KL0_LX1', '01KL0_LX2'],
        body: '# Lint\n\n- [[raw/bash_trace/2026/04/10/01KL0_LX1]]\n',
      }),
    )
    const report = lintMemoryVault(getDb(), { vaultPath: tmpVault })
    expect(report.counts.sources_wikilink_divergence).toBe(1)
    expect(report.issues.some(i =>
      i.code === 'SOURCES_WIKILINK_DIVERGENCE' && i.page_id === '01KLX_DIV1'
    )).toBe(true)
  })

  it('flags inline wikilinks pointing at L0s not in frontmatter sources[]', () => {
    seedL0('01KL0_LX1')
    seedL0('01KL0_LX3')
    createCuratedPage(
      mkpage({
        id: '01KLX_DIV2',
        sources: ['01KL0_LX1'],
        body:
          '# Lint\n\n- [[raw/bash_trace/2026/04/10/01KL0_LX1]]\n- [[raw/bash_trace/2026/04/10/01KL0_LX3]]\n',
      }),
    )
    const report = lintMemoryVault(getDb(), { vaultPath: tmpVault })
    expect(report.counts.sources_wikilink_divergence).toBe(1)
  })

  it('reports zero divergence when frontmatter and body agree', () => {
    seedL0('01KL0_LX1')
    createCuratedPage(
      mkpage({
        id: '01KLX_AGREE',
        sources: ['01KL0_LX1'],
        body: '# Lint\n\n- [[raw/bash_trace/2026/04/10/01KL0_LX1]]\n',
      }),
    )
    const report = lintMemoryVault(getDb(), { vaultPath: tmpVault })
    expect(report.counts.sources_wikilink_divergence).toBe(0)
  })
})

describe('lintMemoryVault — TEMPLATE_VIOLATION (retrospective)', () => {
  it('flags pages whose body now violates a validator rule', () => {
    seedL0('01KL0_LX1')
    const page = createCuratedPage(mkpage({ id: '01KLX_TPL' }))
    // Corrupt the page post-write — someone hand-edits the vault file and
    // leaves a placeholder token behind.
    const rel = `curated/pages/${page.id}.md`
    const abs = join(tmpVault, rel)
    const content = readFileSync(abs, 'utf8').replace(/^# Lint$/m, '# Lint TODO')
    writeFileSync(abs, content)

    const report = lintMemoryVault(getDb(), { vaultPath: tmpVault })
    expect(report.counts.template_violations).toBeGreaterThanOrEqual(1)
    expect(report.issues.some(i =>
      i.code === 'TEMPLATE_VIOLATION' && i.page_id === '01KLX_TPL'
    )).toBe(true)
  })

  it('reports zero template violations on a clean vault', () => {
    seedL0('01KL0_LX1')
    createCuratedPage(mkpage({ id: '01KLX_CLEAN' }))
    const report = lintMemoryVault(getDb(), { vaultPath: tmpVault })
    expect(report.counts.template_violations).toBe(0)
  })
})

describe('lintMemoryVault — ok aggregation', () => {
  it('ok = true when every additive counter is zero', () => {
    seedL0('01KL0_LX1')
    createCuratedPage(mkpage({ id: '01KLX_OK' }))
    const report = lintMemoryVault(getDb(), {
      vaultPath: tmpVault,
      now: new Date('2026-04-15T00:00:00Z'),
    })
    expect(report.issues).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('ok = false when any new 7.3 counter is non-zero', () => {
    seedL0('01KL0_LX1')
    // stale only — no other issues.
    createCuratedPage(
      mkpage({
        id: '01KLX_STALE2',
        last_confirmed: '2026-01-01T00:00:00Z',
        confidence: 0.9,
      }),
    )
    const report = lintMemoryVault(getDb(), {
      vaultPath: tmpVault,
      now: new Date('2026-07-01T00:00:00Z'),
    })
    expect(report.counts.stale_claims).toBeGreaterThan(0)
    expect(report.ok).toBe(false)
  })
})
