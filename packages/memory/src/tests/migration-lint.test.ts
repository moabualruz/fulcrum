// packages/memory/src/tests/migration-lint.test.ts
//
// Memory v3 PR 6 unit 6.5 — `fulcrum memory lint` verification pass.
//
// Plan §6.5: reports zero orphans, zero missing-source references, zero
// cycle in supersession graph. Migration stubs (sources=[] + sources_via=[])
// are tracked as a separate `migration_stubs` category — post-migration the
// vault will legitimately have stubs with empty sources per §6.2, and those
// must NOT count as orphans.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDb, newId } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import {
  runMigration101MemoryV3Lifecycle,
  runMigration102MemoryV3SourceIndex,
} from '../schema.js'
import { lintMemoryVault } from '../migration/lint.js'

function insertL1Page(opts: {
  id?: string
  kind?: string
  sources?: string[]
  sources_via?: string[]
  supersedes?: string[]
  superseded_by?: string | null
  schemaVersion?: number
}): string {
  const id = opts.id ?? newId('memory')
  const provenance = JSON.stringify({ sources: opts.sources ?? [] })
  getDb().prepare(`
    INSERT INTO memories(
      memory_id, workspace_id, project_id, scope, kind, title, summary, content,
      schema_version, retention_tier, confidence_decay_at, provenance, supersedes, superseded_by, vault_path
    ) VALUES (?, 'ws_lint', 'proj_lint', 'project', ?, '', '', 'body',
              ?, 'working', datetime('now'), ?, ?, ?, ?)
  `).run(
    id,
    opts.kind ?? 'decision',
    opts.schemaVersion ?? 3,
    provenance,
    JSON.stringify(opts.supersedes ?? []),
    opts.superseded_by ?? null,
    `curated/pages/${id}.md`,
  )
  return id
}

function insertL0Source(source_id: string, source_type = 'bash_trace'): void {
  getDb().prepare(`
    INSERT INTO l0_sources(source_id, source_type, workspace_id, vault_path, content_hash, size_bytes)
    VALUES(?, ?, 'ws_lint', ?, 'hash', 1)
  `).run(source_id, source_type, `raw/${source_type}/2026/03/15/${source_id}.md`)
}

beforeEach(() => {
  createTestDb()
  runMigration101MemoryV3Lifecycle(getDb())
  runMigration102MemoryV3SourceIndex(getDb())
  seedWorkspaceAndProject(getDb(), 'ws_lint', 'proj_lint')
})

afterEach(() => {
  resetTestDb()
})

describe('lintMemoryVault — clean vault', () => {
  it('returns ok=true on an empty vault', () => {
    const report = lintMemoryVault(getDb())
    expect(report.ok).toBe(true)
    expect(report.counts.pages_checked).toBe(0)
    expect(report.issues).toEqual([])
  })

  it('fully-populated valid vault returns ok=true', () => {
    const l0a = newId('memory')
    const l0b = newId('memory')
    insertL0Source(l0a)
    insertL0Source(l0b)
    insertL1Page({ sources: [l0a, l0b] })
    const report = lintMemoryVault(getDb())
    expect(report.ok).toBe(true)
    expect(report.counts.pages_checked).toBe(1)
    expect(report.counts.missing_sources).toBe(0)
    expect(report.counts.orphans).toBe(0)
  })
})

describe('lintMemoryVault — migration stubs vs orphans', () => {
  it('classifies sources=[]+sources_via=[] rows as migration_stubs, not orphans', () => {
    insertL1Page({ sources: [], sources_via: [] })
    const report = lintMemoryVault(getDb())
    expect(report.counts.orphans).toBe(0)
    expect(report.counts.migration_stubs).toBe(1)
    expect(report.ok).toBe(true) // stubs alone do not fail the verify gate
  })

  it('fully-sourced and stub pages coexist cleanly', () => {
    const l0 = newId('memory')
    insertL0Source(l0)
    insertL1Page({ sources: [l0] })
    insertL1Page({ sources: [] }) // stub
    const report = lintMemoryVault(getDb())
    expect(report.counts.migration_stubs).toBe(1)
    expect(report.counts.orphans).toBe(0)
  })
})

describe('lintMemoryVault — missing source references', () => {
  it('flags sources[] entries that do not resolve to l0_sources', () => {
    const missing = newId('memory')
    const pageId = insertL1Page({ sources: [missing] })
    const report = lintMemoryVault(getDb())
    expect(report.counts.missing_sources).toBe(1)
    expect(report.ok).toBe(false)
    const issue = report.issues.find(i => i.code === 'MISSING_SOURCE')!
    expect(issue.page_id).toBe(pageId)
    expect(issue.source_id).toBe(missing)
  })

  it('partial matches: good sources count normally; bad ones listed', () => {
    const good = newId('memory')
    const bad = newId('memory')
    insertL0Source(good)
    insertL1Page({ sources: [good, bad] })
    const report = lintMemoryVault(getDb())
    expect(report.counts.missing_sources).toBe(1)
    expect(report.issues.find(i => i.code === 'MISSING_SOURCE')?.source_id).toBe(bad)
  })
})

describe('lintMemoryVault — supersession cycles', () => {
  it('flags a 2-node A→B→A cycle', () => {
    const a = insertL1Page({ supersedes: [] })
    const b = insertL1Page({ supersedes: [a] })
    // Make A supersede B — forms a cycle.
    getDb().prepare('UPDATE memories SET supersedes = ? WHERE memory_id = ?').run(JSON.stringify([b]), a)

    const report = lintMemoryVault(getDb())
    expect(report.counts.supersession_cycles).toBeGreaterThanOrEqual(1)
    expect(report.ok).toBe(false)
    expect(report.issues.some(i => i.code === 'SUPERSESSION_CYCLE')).toBe(true)
  })

  it('flags a 3-node A→B→C→A cycle', () => {
    const a = insertL1Page({})
    const b = insertL1Page({ supersedes: [a] })
    const c = insertL1Page({ supersedes: [b] })
    getDb().prepare('UPDATE memories SET supersedes = ? WHERE memory_id = ?').run(JSON.stringify([c]), a)

    const report = lintMemoryVault(getDb())
    expect(report.counts.supersession_cycles).toBeGreaterThanOrEqual(1)
  })

  it('a linear supersession chain A→B→C is not a cycle', () => {
    const a = insertL1Page({})
    const b = insertL1Page({ supersedes: [a] })
    insertL1Page({ supersedes: [b] })
    const report = lintMemoryVault(getDb())
    expect(report.counts.supersession_cycles).toBe(0)
  })
})

describe('lintMemoryVault — excludes pre-v3 rows', () => {
  it('ignores rows with schema_version < 3', () => {
    insertL1Page({ sources: ['missing_1'], schemaVersion: 2 })
    const report = lintMemoryVault(getDb())
    expect(report.counts.pages_checked).toBe(0)
    expect(report.counts.missing_sources).toBe(0)
  })
})

describe('lintMemoryVault — report shape', () => {
  it('returns a deterministic shape with ok, counts, and issues', () => {
    const l0 = newId('memory')
    insertL0Source(l0)
    insertL1Page({ sources: [l0] })
    insertL1Page({}) // stub

    const report = lintMemoryVault(getDb())
    expect(report).toMatchObject({
      ok: expect.any(Boolean),
      counts: {
        pages_checked: 2,
        orphans: 0,
        migration_stubs: 1,
        missing_sources: 0,
        supersession_cycles: 0,
      },
      issues: expect.any(Array),
    })
  })
})
