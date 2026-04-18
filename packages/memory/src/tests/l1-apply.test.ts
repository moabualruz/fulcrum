// packages/memory/src/tests/l1-apply.test.ts
//
// Memory v3 PR 3 unit 3.5 — deterministic apply-layer.
//
// `applyCuratorOutput` is the single writer that runs between the curator
// runtime (unit 3.1) and the vault / graph primitives (units 2.2 + 2.5).
// Tests cover: happy path for every array (new_pages, updates,
// supersessions, new_edges); atomic rollback of DB + vault on any failure;
// dry-run mode returns a diff-shaped result without writing; add_sources /
// add_entities merge+dedup with the existing sets.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle } from '../schema.js'
import { upsertEntity } from '../l1/entities.js'
import { createCuratedPage, readCuratedPage, curatedRelativePath } from '../l1/page.js'
import { applyCuratorOutput } from '../l1/apply.js'
import type { CuratedPage } from '../l1/frontmatter.js'
import type { CuratorNewPage, CuratorOutput } from '../l1/curator.js'

let tmpVault: string
let prevVaultEnv: string | undefined

beforeEach(() => {
  createTestDb()
  runMigration101MemoryV3Lifecycle(getDb())
  seedWorkspaceAndProject(getDb(), 'ws_apply', 'proj_apply')
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-l1-apply-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
})

afterEach(() => {
  resetTestDb()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
})

function newPageDraft(overrides: Partial<CuratorNewPage> = {}): CuratorNewPage {
  return {
    type: 'page',
    name: null,
    title: 'From L0',
    entity_type: null,
    aliases: null,
    confidence: 0.9,
    retention_tier: 'working',
    sources: ['01KL0_ALPHA'],
    sources_via: [],
    entities: [],
    body: '# From L0\n\nSee [[raw/bash_trace/2026/04/18/01KL0_ALPHA]] for the source.\n',
    ...overrides,
  }
}

function baseOutput(overrides: Partial<CuratorOutput> = {}): CuratorOutput {
  return {
    new_pages: [],
    updates: [],
    supersessions: [],
    new_edges: [],
    ...overrides,
  }
}

function ctx(overrides: Partial<Parameters<typeof applyCuratorOutput>[1]> = {}) {
  return {
    workspace_id: 'ws_apply',
    project_id: 'proj_apply',
    curator_input_sources: ['01KL0_ALPHA', '01KL0_BETA'],
    ...overrides,
  }
}

describe('applyCuratorOutput — new_pages', () => {
  it('creates a page on disk + inserts a memories row', () => {
    const result = applyCuratorOutput(baseOutput({ new_pages: [newPageDraft()] }), ctx())
    expect(result.created_page_ids).toHaveLength(1)
    const page_id = result.created_page_ids[0]!
    const stored = readCuratedPage(page_id)
    expect(stored).not.toBeNull()
    expect(stored!.title).toBe('From L0')
    expect(stored!.workspace_id).toBe('ws_apply')
    expect(stored!.project_id).toBe('proj_apply')
    // Vault file exists on disk.
    expect(existsSync(join(tmpVault, curatedRelativePath(stored!)))).toBe(true)
  })

  it('stamps first_seen + last_confirmed from ctx.now (deterministic tests)', () => {
    const NOW = '2026-04-18T20:00:00Z'
    const result = applyCuratorOutput(
      baseOutput({ new_pages: [newPageDraft()] }),
      ctx({ now: () => NOW }),
    )
    const page = readCuratedPage(result.created_page_ids[0]!)
    expect(page!.first_seen).toBe(NOW)
    expect(page!.last_confirmed).toBe(NOW)
  })

  it('rejects pages whose sources escape the curator input batch (Constraint §15)', () => {
    expect(() =>
      applyCuratorOutput(
        baseOutput({
          new_pages: [newPageDraft({ sources: ['01KL0_FABRICATED'] })],
        }),
        ctx(),
      ),
    ).toThrow(/01KL0_FABRICATED|CURATOR_SOURCE_NOT_IN_BATCH|batch/)
  })
})

describe('applyCuratorOutput — updates', () => {
  function seedExistingPage(id: string): void {
    const now = '2026-04-18T10:00:00Z'
    const page: CuratedPage = {
      id,
      schema: 'fulcrum.memory/v3',
      type: 'page',
      title: 'Original',
      confidence: 0.5,
      first_seen: now,
      last_confirmed: now,
      retention_tier: 'working',
      access_count: 0,
      sources: ['01KL0_ALPHA'],
      sources_via: [],
      supersedes: [],
      superseded_by: null,
      entities: [],
      workspace_id: 'ws_apply',
      project_id: 'proj_apply',
      body: '# Original\n\n[[raw/bash_trace/2026/04/18/01KL0_ALPHA]]\n',
    }
    createCuratedPage(page)
  }

  it('merges add_sources and add_entities into the existing sets (no dupes)', () => {
    seedExistingPage('01KPAGE_X')
    const entityId = upsertEntity({
      workspace_id: 'ws_apply',
      entity_type: 'library',
      name: 'React',
    })
    const result = applyCuratorOutput(
      baseOutput({
        updates: [
          {
            page_id: '01KPAGE_X',
            body: null,
            confidence: 0.75,
            retention_tier: null,
            add_sources: ['01KL0_ALPHA', '01KL0_BETA'],
            add_entities: [entityId],
          },
        ],
      }),
      ctx(),
    )
    expect(result.updated_page_ids).toEqual(['01KPAGE_X'])
    const page = readCuratedPage('01KPAGE_X')!
    expect(page.confidence).toBe(0.75)
    expect(page.sources).toEqual(['01KL0_ALPHA', '01KL0_BETA'])
    expect(page.entities).toEqual([entityId])
  })

  it('updates body + retention_tier when non-null', () => {
    seedExistingPage('01KPAGE_Y')
    applyCuratorOutput(
      baseOutput({
        updates: [
          {
            page_id: '01KPAGE_Y',
            body: '# Updated\n\n[[raw/bash_trace/2026/04/18/01KL0_ALPHA]]\n',
            confidence: null,
            retention_tier: 'semantic',
            add_sources: [],
            add_entities: [],
          },
        ],
      }),
      ctx(),
    )
    const page = readCuratedPage('01KPAGE_Y')!
    expect(page.body.trim()).toContain('# Updated')
    expect(page.retention_tier).toBe('semantic')
  })

  it('throws when the update target does not exist', () => {
    expect(() =>
      applyCuratorOutput(
        baseOutput({
          updates: [
            {
              page_id: '01KPAGE_MISSING',
              body: 'x',
              confidence: null,
              retention_tier: null,
              add_sources: [],
              add_entities: [],
            },
          ],
        }),
        ctx(),
      ),
    ).toThrow(/not_found|MISSING/)
  })
})

describe('applyCuratorOutput — supersessions', () => {
  it('creates a new page, links supersedes on new + superseded_by on old', () => {
    // Seed an old page.
    const oldId = '01KPAGE_OLD'
    const now = '2026-04-18T10:00:00Z'
    createCuratedPage({
      id: oldId,
      schema: 'fulcrum.memory/v3',
      type: 'page',
      title: 'Stale',
      confidence: 0.8,
      first_seen: now,
      last_confirmed: now,
      retention_tier: 'working',
      access_count: 0,
      sources: ['01KL0_ALPHA'],
      sources_via: [],
      supersedes: [],
      superseded_by: null,
      entities: [],
      workspace_id: 'ws_apply',
      project_id: 'proj_apply',
      body: '# Stale\n\n[[raw/bash_trace/2026/04/18/01KL0_ALPHA]]\n',
    })
    const result = applyCuratorOutput(
      baseOutput({
        supersessions: [
          {
            old_page_id: oldId,
            new_page: newPageDraft({ title: 'Fresh' }),
            reason: 'newer evidence in 01KL0_BETA',
          },
        ],
      }),
      ctx({ curator_input_sources: ['01KL0_ALPHA'] }),
    )
    expect(result.superseded_pairs).toHaveLength(1)
    const pair = result.superseded_pairs[0]!
    expect(pair.old_id).toBe(oldId)
    const fresh = readCuratedPage(pair.new_id)!
    expect(fresh.title).toBe('Fresh')
    expect(fresh.supersedes).toEqual([oldId])
    // Old page gets superseded_by via the primitive (PR 2 unit 2.2).
    const oldRow = getDb()
      .prepare('SELECT superseded_by FROM memories WHERE memory_id = ?')
      .get(oldId) as { superseded_by: string }
    expect(oldRow.superseded_by).toBe(pair.new_id)
  })
})

describe('applyCuratorOutput — new_edges', () => {
  it('calls addEdge for each edge and returns the generated ids', () => {
    const reactId = upsertEntity({ workspace_id: 'ws_apply', entity_type: 'library', name: 'React' })
    const hookId = upsertEntity({ workspace_id: 'ws_apply', entity_type: 'concept', name: 'hooks' })
    const result = applyCuratorOutput(
      baseOutput({
        new_edges: [
          {
            source_entity_id: reactId,
            target_entity_id: hookId,
            relation: 'provides',
            confidence: 0.95,
            source_ids: ['01KL0_ALPHA'],
          },
        ],
      }),
      ctx(),
    )
    expect(result.created_edge_ids).toHaveLength(1)
    const edge = getDb()
      .prepare('SELECT * FROM graph_edges WHERE edge_id = ?')
      .get(result.created_edge_ids[0]!) as Record<string, unknown>
    expect(edge['source_id']).toBe(reactId)
    expect(edge['target_id']).toBe(hookId)
    expect(edge['relation']).toBe('provides')
    expect(edge['confidence']).toBe(0.95)
  })
})

describe('applyCuratorOutput — atomicity', () => {
  it('rolls back DB + cleans vault files when a later step throws', () => {
    // First page would land; second edge references a missing entity so
    // addEdge throws — txn rolls back, no DB rows + no vault file remain.
    expect(() =>
      applyCuratorOutput(
        baseOutput({
          new_pages: [newPageDraft()],
          new_edges: [
            {
              source_entity_id: '01KENT_MISSING_A',
              target_entity_id: '01KENT_MISSING_B',
              relation: 'x',
              confidence: 0.5,
              source_ids: [],
            },
          ],
        }),
        ctx(),
      ),
    ).toThrow(/does not exist|not found|01KENT_MISSING/)
    // No pages created.
    const rows = getDb()
      .prepare('SELECT COUNT(*) AS n FROM memories WHERE workspace_id = ?')
      .get('ws_apply') as { n: number }
    expect(rows.n).toBe(0)
    // Vault rollback — the curated/ subtree either doesn't exist or has no .md files.
    const { readdirSync } = require('fs') as typeof import('fs')
    const curated = join(tmpVault, 'curated')
    let orphans: string[] = []
    const walk = (p: string): void => {
      if (!existsSync(p)) return
      for (const e of readdirSync(p, { withFileTypes: true })) {
        const sub = join(p, e.name)
        if (e.isDirectory()) walk(sub)
        else if (e.name.endsWith('.md')) orphans.push(sub)
      }
    }
    walk(curated)
    expect(orphans).toEqual([])
  })
})

describe('applyCuratorOutput — dry_run', () => {
  it('returns a diff-shaped result without touching DB or vault', () => {
    const result = applyCuratorOutput(
      baseOutput({ new_pages: [newPageDraft()], updates: [] }),
      ctx({ dry_run: true }),
    )
    expect(result.dry_run).toBe(true)
    expect(result.created_page_ids).toHaveLength(1)
    // No memories row created.
    const rows = getDb()
      .prepare('SELECT COUNT(*) AS n FROM memories WHERE workspace_id = ?')
      .get('ws_apply') as { n: number }
    expect(rows.n).toBe(0)
  })
})
