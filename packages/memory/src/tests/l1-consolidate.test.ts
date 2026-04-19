// packages/memory/src/tests/l1-consolidate.test.ts
//
// Memory v3 PR 7 unit 7.4 — `fulcrum memory consolidate`.
//
// Plan §7.4: finds pages with same entity set + same retention_tier + min
// confidence ≥ threshold; proposes a merged page to the curator (dry-run
// default).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getDb } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { runMigration101MemoryV3Lifecycle } from '../schema.js'
import { createCuratedPage } from '../l1/page.js'
import { findConsolidationCandidates } from '../l1/consolidate.js'
import type { CuratedPage, L1RetentionTier } from '../l1/frontmatter.js'

let tmpVault: string
let prevVaultEnv: string | undefined

function seedEntity(id: string): void {
  getDb()
    .prepare(
      `INSERT INTO graph_entities (entity_id, workspace_id, name, entity_type,
         properties, created_at, updated_at)
       VALUES (?, 'ws_cs', ?, 'concept', '{}', datetime('now'), datetime('now'))`,
    )
    .run(id, id)
}

function mkpage(overrides: Partial<CuratedPage> = {}): CuratedPage {
  return {
    id: '01KCS_A',
    schema: 'fulcrum.memory/v3',
    type: 'concept',
    name: 'React',
    confidence: 0.8,
    first_seen: '2026-04-10T12:00:00Z',
    last_confirmed: '2026-04-10T12:00:00Z',
    retention_tier: 'working',
    access_count: 0,
    sources: [],
    sources_via: ['01KSV_A'],
    supersedes: [],
    superseded_by: null,
    entities: ['01KENT_REACT'],
    workspace_id: 'ws_cs',
    project_id: 'proj_cs',
    body: '# Note\n\n- [[page/01KSV_A]]\n- [[raw/bash_trace/2026/04/10/01KCS_ANY]]\n',
    ...overrides,
  }
}

beforeEach(() => {
  createTestDb()
  runMigration101MemoryV3Lifecycle(getDb())
  seedWorkspaceAndProject(getDb(), 'ws_cs', 'proj_cs')
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-consol-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
  seedEntity('01KENT_REACT')
  seedEntity('01KENT_NEXT')
})

afterEach(() => {
  resetTestDb()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
})

describe('findConsolidationCandidates', () => {
  it('groups pages with same entities[] + same retention_tier', () => {
    createCuratedPage(mkpage({ id: '01KCS_P1', entities: ['01KENT_REACT'] }))
    createCuratedPage(mkpage({ id: '01KCS_P2', entities: ['01KENT_REACT'] }))
    const candidates = findConsolidationCandidates(getDb(), {
      workspace_id: 'ws_cs',
      min_confidence: 0.5,
    })
    expect(candidates.length).toBe(1)
    expect(candidates[0]!.page_ids.sort()).toEqual(['01KCS_P1', '01KCS_P2'])
    expect(candidates[0]!.entity_set).toEqual(['01KENT_REACT'])
    expect(candidates[0]!.retention_tier).toBe('working')
  })

  it('treats entity order as irrelevant (canonical sort)', () => {
    createCuratedPage(
      mkpage({ id: '01KCS_O1', entities: ['01KENT_NEXT', '01KENT_REACT'] }),
    )
    createCuratedPage(
      mkpage({ id: '01KCS_O2', entities: ['01KENT_REACT', '01KENT_NEXT'] }),
    )
    const candidates = findConsolidationCandidates(getDb(), {
      workspace_id: 'ws_cs',
      min_confidence: 0.5,
    })
    expect(candidates.length).toBe(1)
    expect(candidates[0]!.entity_set.sort()).toEqual(['01KENT_NEXT', '01KENT_REACT'])
  })

  it('does NOT merge across different retention_tier', () => {
    createCuratedPage(mkpage({ id: '01KCS_T1', retention_tier: 'working', entities: ['01KENT_REACT'] }))
    createCuratedPage(mkpage({ id: '01KCS_T2', retention_tier: 'episodic', entities: ['01KENT_REACT'] }))
    const candidates = findConsolidationCandidates(getDb(), {
      workspace_id: 'ws_cs',
      min_confidence: 0.5,
    })
    expect(candidates.length).toBe(0)
  })

  it('respects min_confidence — drops groups where any member is below', () => {
    createCuratedPage(
      mkpage({ id: '01KCS_C1', confidence: 0.9, entities: ['01KENT_REACT'] }),
    )
    createCuratedPage(
      mkpage({ id: '01KCS_C2', confidence: 0.4, entities: ['01KENT_REACT'] }),
    )
    const candidates = findConsolidationCandidates(getDb(), {
      workspace_id: 'ws_cs',
      min_confidence: 0.5,
    })
    expect(candidates.length).toBe(0)
  })

  it('filters by retention_tier when specified', () => {
    createCuratedPage(mkpage({ id: '01KCS_R1', retention_tier: 'working' }))
    createCuratedPage(mkpage({ id: '01KCS_R2', retention_tier: 'working' }))
    createCuratedPage(mkpage({ id: '01KCS_R3', retention_tier: 'semantic' }))
    createCuratedPage(mkpage({ id: '01KCS_R4', retention_tier: 'semantic' }))
    const filtered = findConsolidationCandidates(getDb(), {
      workspace_id: 'ws_cs',
      min_confidence: 0.5,
      retention_tier: 'working',
    })
    expect(filtered.length).toBe(1)
    expect(filtered[0]!.retention_tier).toBe('working')
  })

  it('skips superseded pages', () => {
    createCuratedPage(mkpage({ id: '01KCS_S1' }))
    createCuratedPage(mkpage({ id: '01KCS_S2' }))
    getDb()
      .prepare('UPDATE memories SET superseded_by = ? WHERE memory_id = ?')
      .run('01KCS_NEWER', '01KCS_S1')
    const candidates = findConsolidationCandidates(getDb(), {
      workspace_id: 'ws_cs',
      min_confidence: 0.5,
    })
    // Only one remaining live page in the group — not a candidate (< 2).
    expect(candidates.length).toBe(0)
  })

  it('returns [] when no group has ≥ 2 pages', () => {
    createCuratedPage(mkpage({ id: '01KCS_L1', entities: ['01KENT_REACT'] }))
    createCuratedPage(mkpage({ id: '01KCS_L2', entities: ['01KENT_NEXT'] }))
    const candidates = findConsolidationCandidates(getDb(), {
      workspace_id: 'ws_cs',
      min_confidence: 0.5,
    })
    expect(candidates.length).toBe(0)
  })

  it('ignores pages with empty entities[]', () => {
    createCuratedPage(mkpage({ id: '01KCS_E1', entities: [] }))
    createCuratedPage(mkpage({ id: '01KCS_E2', entities: [] }))
    const candidates = findConsolidationCandidates(getDb(), {
      workspace_id: 'ws_cs',
      min_confidence: 0.5,
    })
    expect(candidates.length).toBe(0)
  })

  it('returns min_confidence reported on each candidate', () => {
    createCuratedPage(mkpage({ id: '01KCS_M1', confidence: 0.9 }))
    createCuratedPage(mkpage({ id: '01KCS_M2', confidence: 0.7 }))
    const candidates = findConsolidationCandidates(getDb(), {
      workspace_id: 'ws_cs',
      min_confidence: 0.5,
    })
    expect(candidates[0]!.min_confidence_in_group).toBeCloseTo(0.7, 4)
  })

  it('default min_confidence = 0.5 when unspecified', () => {
    createCuratedPage(mkpage({ id: '01KCS_D1', confidence: 0.4 }))
    createCuratedPage(mkpage({ id: '01KCS_D2', confidence: 0.6 }))
    const candidates = findConsolidationCandidates(getDb(), {
      workspace_id: 'ws_cs',
    })
    // 0.4 is below default 0.5 → rejected.
    expect(candidates.length).toBe(0)
  })

  it('scopes by workspace_id', () => {
    createCuratedPage(mkpage({ id: '01KCS_W1' }))
    createCuratedPage(mkpage({ id: '01KCS_W2' }))
    seedWorkspaceAndProject(getDb(), 'ws_other', 'proj_other')
    createCuratedPage(
      mkpage({
        id: '01KCS_OT1',
        workspace_id: 'ws_other',
        project_id: 'proj_other',
      }),
    )
    createCuratedPage(
      mkpage({
        id: '01KCS_OT2',
        workspace_id: 'ws_other',
        project_id: 'proj_other',
      }),
    )
    const own = findConsolidationCandidates(getDb(), {
      workspace_id: 'ws_cs',
      min_confidence: 0.5,
    })
    expect(own.length).toBe(1)
    expect(own[0]!.page_ids.sort()).toEqual(['01KCS_W1', '01KCS_W2'])
  })

  it('handles pages with pre-v3 schema by ignoring them', () => {
    createCuratedPage(mkpage({ id: '01KCS_V1' }))
    getDb().prepare(`INSERT INTO memories (
      memory_id, workspace_id, project_id, scope, kind, content,
      confidence, retention_tier, access_count, schema_version,
      entities, vault_path
    ) VALUES (?, 'ws_cs', 'proj_cs', 'project', 'concept', 'x',
      0.9, 'working', 0, 2, ?, 'legacy/x.md')`)
      .run('01KCS_V0', JSON.stringify(['01KENT_REACT']))
    const cands = findConsolidationCandidates(getDb(), {
      workspace_id: 'ws_cs',
      min_confidence: 0.5,
    })
    expect(cands.length).toBe(0)
  })
})
