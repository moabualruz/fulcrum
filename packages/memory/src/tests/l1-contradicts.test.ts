// packages/memory/src/tests/l1-contradicts.test.ts
//
// Memory v3 PR 7 unit 7.2 — contradiction detector.
//
// The curator output may carry `contradicts: [old_page_id]` on each new_page.
// The apply-layer auto-emits a supersession exactly when the new page's
// confidence is at least as strong as the old page's. Weaker-evidence
// contradictions are ignored — supersession has to be earned.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle } from '../schema.js'
import { createCuratedPage, readCuratedPage } from '../l1/page.js'
import { applyCuratorOutput } from '../l1/apply.js'
import {
  parseCuratorOutput,
  getOutputSchema,
  type CuratorInput,
  type CuratorNewPage,
  type CuratorOutput,
} from '../l1/curator.js'
import type { CuratedPage } from '../l1/frontmatter.js'

let tmpVault: string
let prevVaultEnv: string | undefined

function mkpage(overrides: Partial<CuratedPage> = {}): CuratedPage {
  return {
    id: '01KC_OLD',
    schema: 'fulcrum.memory/v3',
    type: 'page',
    title: 'Auth answer',
    confidence: 0.6,
    first_seen: '2026-04-10T12:00:00Z',
    last_confirmed: '2026-04-10T12:00:00Z',
    retention_tier: 'working',
    access_count: 0,
    sources: ['01KL0_OLDSRC'],
    sources_via: [],
    supersedes: [],
    superseded_by: null,
    entities: [],
    workspace_id: 'ws_ct',
    project_id: 'proj_ct',
    body: '# Auth\n\nOld.\n\n- [[raw/bash_trace/2026/04/10/01KL0_OLDSRC]]\n',
    ...overrides,
  }
}

function seedL0(source_id: string): void {
  getDb()
    .prepare(
      `INSERT INTO l0_sources (source_id, workspace_id, project_id, source_type,
         vault_path, content_hash, size_bytes, created_at)
       VALUES (?, 'ws_ct', 'proj_ct', 'bash_trace', ?, 'abc', 10, datetime('now'))`,
    )
    .run(source_id, `raw/bash_trace/2026/04/10/${source_id}.md`)
}

function newPageDraft(overrides: Partial<CuratorNewPage> = {}): CuratorNewPage {
  return {
    type: 'page',
    name: null,
    title: 'New answer',
    entity_type: null,
    aliases: null,
    confidence: 0.9,
    retention_tier: 'working',
    sources: ['01KL0_NEWSRC'],
    sources_via: [],
    entities: [],
    body: '# Auth\n\nNew.\n\n- [[raw/bash_trace/2026/04/10/01KL0_NEWSRC]]\n',
    contradicts: [],
    ...overrides,
  }
}

function curatorOutputWith(np: CuratorNewPage): CuratorOutput {
  return { new_pages: [np], updates: [], supersessions: [], new_edges: [] }
}

beforeEach(() => {
  createTestDb()
  runMigration101MemoryV3Lifecycle(getDb())
  seedWorkspaceAndProject(getDb(), 'ws_ct', 'proj_ct')
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-l1-ct-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
})

afterEach(() => {
  resetTestDb()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
})

describe('CuratorOutput schema — contradicts[]', () => {
  it('includes contradicts as a required string array on new_pages', () => {
    const schema = getOutputSchema()
    const np = (schema.properties as { new_pages: { items: { properties: Record<string, unknown>; required: string[] } } }).new_pages.items
    expect(np.properties['contradicts']).toBeDefined()
    expect(np.required).toContain('contradicts')
  })

  it('parseCuratorOutput accepts contradicts and defaults missing to []', () => {
    seedL0('01KL0_NEWSRC')
    seedL0('01KL0_OLDSRC')
    const input: CuratorInput = {
      task: 'extraction',
      l0_sources: [
        { source_id: '01KL0_NEWSRC', source_type: 'bash_trace', ingested_at: '2026-04-11T00:00Z', body: 'x', meta: {} },
      ],
    }
    const raw = JSON.stringify({
      new_pages: [
        {
          type: 'page',
          name: null,
          title: 'T',
          entity_type: null,
          aliases: null,
          confidence: 0.9,
          retention_tier: 'working',
          sources: ['01KL0_NEWSRC'],
          sources_via: [],
          entities: [],
          body: '# x\n- [[raw/bash_trace/2026/04/10/01KL0_NEWSRC]]\n',
          contradicts: ['01KC_OLD'],
        },
      ],
      updates: [],
      supersessions: [],
      new_edges: [],
    })
    const out = parseCuratorOutput(raw, input)
    expect(out.new_pages[0]!.contradicts).toEqual(['01KC_OLD'])
  })

  it('parseCuratorOutput tolerates missing contradicts by defaulting to []', () => {
    seedL0('01KL0_NEWSRC')
    const input: CuratorInput = {
      task: 'extraction',
      l0_sources: [
        { source_id: '01KL0_NEWSRC', source_type: 'bash_trace', ingested_at: '2026-04-11T00:00Z', body: 'x', meta: {} },
      ],
    }
    const raw = JSON.stringify({
      new_pages: [
        {
          type: 'page',
          name: null,
          title: 'T',
          entity_type: null,
          aliases: null,
          confidence: 0.9,
          retention_tier: 'working',
          sources: ['01KL0_NEWSRC'],
          sources_via: [],
          entities: [],
          body: '# x\n- [[raw/bash_trace/2026/04/10/01KL0_NEWSRC]]\n',
        },
      ],
      updates: [],
      supersessions: [],
      new_edges: [],
    })
    const out = parseCuratorOutput(raw, input)
    expect(out.new_pages[0]!.contradicts).toEqual([])
  })
})

describe('applyCuratorOutput — auto-supersession from contradicts', () => {
  it('supersedes when new_page.confidence >= old_page.confidence', () => {
    seedL0('01KL0_NEWSRC')
    createCuratedPage(mkpage({ id: '01KC_OLD', confidence: 0.6 }))
    const out = curatorOutputWith(newPageDraft({ confidence: 0.9, contradicts: ['01KC_OLD'] }))
    const res = applyCuratorOutput(out, {
      workspace_id: 'ws_ct',
      project_id: 'proj_ct',
      curator_input_sources: ['01KL0_NEWSRC'],
    })

    expect(res.superseded_pairs.length).toBe(1)
    const pair = res.superseded_pairs[0]!
    expect(pair.old_id).toBe('01KC_OLD')
    const oldRow = getDb()
      .prepare('SELECT superseded_by FROM memories WHERE memory_id = ?')
      .get('01KC_OLD') as { superseded_by: string | null }
    expect(oldRow.superseded_by).toBe(pair.new_id)
    const newPage = readCuratedPage(pair.new_id)
    expect(newPage?.supersedes).toContain('01KC_OLD')
  })

  it('does NOT supersede when new_page.confidence < old_page.confidence', () => {
    seedL0('01KL0_NEWSRC')
    createCuratedPage(mkpage({ id: '01KC_OLD2', confidence: 0.9 }))
    const out = curatorOutputWith(newPageDraft({ confidence: 0.4, contradicts: ['01KC_OLD2'] }))
    const res = applyCuratorOutput(out, {
      workspace_id: 'ws_ct',
      project_id: 'proj_ct',
      curator_input_sources: ['01KL0_NEWSRC'],
    })
    expect(res.superseded_pairs.length).toBe(0)
    const oldRow = getDb()
      .prepare('SELECT superseded_by FROM memories WHERE memory_id = ?')
      .get('01KC_OLD2') as { superseded_by: string | null }
    expect(oldRow.superseded_by).toBeNull()
  })

  it('supersedes when equal confidence (>= threshold is inclusive)', () => {
    seedL0('01KL0_NEWSRC')
    createCuratedPage(mkpage({ id: '01KC_EQ', confidence: 0.7 }))
    const out = curatorOutputWith(newPageDraft({ confidence: 0.7, contradicts: ['01KC_EQ'] }))
    const res = applyCuratorOutput(out, {
      workspace_id: 'ws_ct',
      project_id: 'proj_ct',
      curator_input_sources: ['01KL0_NEWSRC'],
    })
    expect(res.superseded_pairs.length).toBe(1)
  })

  it('silently skips contradicts pointing at non-existent pages', () => {
    seedL0('01KL0_NEWSRC')
    const out = curatorOutputWith(newPageDraft({ contradicts: ['01KC_MISSING'] }))
    const res = applyCuratorOutput(out, {
      workspace_id: 'ws_ct',
      project_id: 'proj_ct',
      curator_input_sources: ['01KL0_NEWSRC'],
    })
    expect(res.superseded_pairs.length).toBe(0)
    expect(res.created_page_ids.length).toBe(1) // new page still created
  })

  it('skips contradicts pointing at already-superseded pages', () => {
    seedL0('01KL0_NEWSRC')
    createCuratedPage(mkpage({ id: '01KC_OLDA', confidence: 0.5 }))
    createCuratedPage(
      mkpage({
        id: '01KC_OLDB',
        confidence: 0.5,
        sources: ['01KL0_OLDSRC'],
        body: '# Auth\n\nOldB.\n\n- [[raw/bash_trace/2026/04/10/01KL0_OLDSRC]]\n',
      }),
    )
    // Mark OLDA as already superseded by OLDB.
    getDb()
      .prepare('UPDATE memories SET superseded_by = ? WHERE memory_id = ?')
      .run('01KC_OLDB', '01KC_OLDA')

    const out = curatorOutputWith(newPageDraft({ confidence: 0.9, contradicts: ['01KC_OLDA'] }))
    const res = applyCuratorOutput(out, {
      workspace_id: 'ws_ct',
      project_id: 'proj_ct',
      curator_input_sources: ['01KL0_NEWSRC'],
    })
    expect(res.superseded_pairs.length).toBe(0)
    const row = getDb()
      .prepare('SELECT superseded_by FROM memories WHERE memory_id = ?')
      .get('01KC_OLDA') as { superseded_by: string | null }
    expect(row.superseded_by).toBe('01KC_OLDB')
  })

  it('handles multiple contradicts on one new_page', () => {
    seedL0('01KL0_NEWSRC')
    createCuratedPage(mkpage({ id: '01KC_O1', confidence: 0.4 }))
    createCuratedPage(
      mkpage({
        id: '01KC_O2',
        confidence: 0.5,
        sources: ['01KL0_NEWSRC'],
        body: '# Auth\n\nO2.\n\n- [[raw/bash_trace/2026/04/10/01KL0_NEWSRC]]\n',
      }),
    )
    const out = curatorOutputWith(
      newPageDraft({ confidence: 0.8, contradicts: ['01KC_O1', '01KC_O2'] }),
    )
    const res = applyCuratorOutput(out, {
      workspace_id: 'ws_ct',
      project_id: 'proj_ct',
      curator_input_sources: ['01KL0_NEWSRC'],
    })
    expect(res.superseded_pairs.length).toBe(2)
    const newId = res.created_page_ids[0]!
    const page = readCuratedPage(newId)
    expect(page?.supersedes.sort()).toEqual(['01KC_O1', '01KC_O2'])
  })

  it('empty contradicts[] behaves like vanilla apply', () => {
    seedL0('01KL0_NEWSRC')
    const out = curatorOutputWith(newPageDraft({ contradicts: [] }))
    const res = applyCuratorOutput(out, {
      workspace_id: 'ws_ct',
      project_id: 'proj_ct',
      curator_input_sources: ['01KL0_NEWSRC'],
    })
    expect(res.superseded_pairs.length).toBe(0)
    expect(res.created_page_ids.length).toBe(1)
  })

  it('dry_run does not write superseded_by', () => {
    seedL0('01KL0_NEWSRC')
    createCuratedPage(mkpage({ id: '01KC_OLD_DRY', confidence: 0.5 }))
    const out = curatorOutputWith(newPageDraft({ confidence: 0.9, contradicts: ['01KC_OLD_DRY'] }))
    applyCuratorOutput(out, {
      workspace_id: 'ws_ct',
      project_id: 'proj_ct',
      curator_input_sources: ['01KL0_NEWSRC'],
      dry_run: true,
    })
    const row = getDb()
      .prepare('SELECT superseded_by FROM memories WHERE memory_id = ?')
      .get('01KC_OLD_DRY') as { superseded_by: string | null }
    expect(row.superseded_by).toBeNull()
  })
})
