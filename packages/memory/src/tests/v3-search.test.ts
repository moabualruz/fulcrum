// packages/memory/src/tests/v3-search.test.ts
//
// Memory v3 PR 5 unit 5.1 — graph traversal + confidence + supersession filters.
//
// runV3Search is the recall entry point (FULCRUM_MEMORY_V3 flag retired in PR 9.5).
// This suite pins:
//   * confidence filter (rows with confidence < floor are excluded)
//   * supersession filter (rows with superseded_by NOT NULL are excluded
//     unless include_superseded is passed explicitly)
//   * graph traversal (entity-linked pages surface even when the query
//     doesn't match their body text)
//   * FTS + vec stages keep working against v3-only rows
//   * L0 back-refs (sources[] + l0_wikilinks[]) on every hit
//   * schema_version gate (legacy rows never returned)

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  createTestDb,
  resetTestDb,
  seedWorkspaceAndProject,
  registerStubEmbedder,
  unregisterStubEmbedder,
} from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle } from '../schema.js'
import { upsertEntity, addEdge } from '../l1/entities.js'
import { createCuratedPage } from '../l1/page.js'
import { recordL1Embedding } from '../l2/embed.js'
import { flushPendingMemoryWrites } from '../l2/queue.js'
import { runV3Search } from '../retrieval/v3-search.js'
import type { CuratedPage } from '../l1/frontmatter.js'

let tmpVault: string
let prevVaultEnv: string | undefined

beforeEach(async () => {
  createTestDb()
  runMigration101MemoryV3Lifecycle(getDb())
  seedWorkspaceAndProject(getDb(), 'ws_v3', 'proj_v3')
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-v3-search-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
  await registerStubEmbedder()
})

afterEach(() => {
  unregisterStubEmbedder()
  resetTestDb()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
})

function seedPage(overrides: Partial<CuratedPage> & { id: string; body: string; sources: string[] }): CuratedPage {
  const now = '2026-04-18T10:00:00Z'
  const base: CuratedPage = {
    id: overrides.id,
    schema: 'fulcrum.memory/v3',
    type: 'page',
    title: overrides.title ?? `Page ${overrides.id}`,
    confidence: overrides.confidence ?? 0.7,
    first_seen: now,
    last_confirmed: now,
    retention_tier: overrides.retention_tier ?? 'working',
    access_count: 0,
    sources: overrides.sources,
    sources_via: overrides.sources_via ?? [],
    supersedes: overrides.supersedes ?? [],
    superseded_by: overrides.superseded_by ?? null,
    entities: overrides.entities ?? [],
    workspace_id: 'ws_v3',
    project_id: 'proj_v3',
    body: overrides.body,
  }
  return createCuratedPage(base)
}

function markSuperseded(old_id: string, new_id: string): void {
  getDb()
    .prepare('UPDATE memories SET superseded_by = ?, updated_at = ? WHERE memory_id = ?')
    .run(new_id, new Date().toISOString(), old_id)
}

async function embedAll(ids: string[]): Promise<void> {
  for (const id of ids) recordL1Embedding(getDb(), id)
  await flushPendingMemoryWrites(5_000)
}

describe('runV3Search — confidence filter', () => {
  it('excludes pages below the confidence floor', async () => {
    seedPage({ id: '01KV3_HIGH', body: '# High\n\nAuth middleware details. [[raw/bash_trace/2026/04/18/01SRC_A]]\n', sources: ['01SRC_A'], confidence: 0.8 })
    seedPage({ id: '01KV3_LOW', body: '# Low\n\nAuth middleware details. [[raw/bash_trace/2026/04/18/01SRC_A]]\n', sources: ['01SRC_A'], confidence: 0.1 })
    await embedAll(['01KV3_HIGH', '01KV3_LOW'])

    const out = await runV3Search({ workspace_id: 'ws_v3', project_id: 'proj_v3', query: 'auth middleware', confidence_floor: 0.5 })
    const ids = out.map((r) => r.memory_id)
    expect(ids).toContain('01KV3_HIGH')
    expect(ids).not.toContain('01KV3_LOW')
  })

  it('defaults the floor to 0.3', async () => {
    seedPage({ id: '01KV3_02', body: '# Lowish\n\nAuth details. [[raw/bash_trace/2026/04/18/01SRC_B]]\n', sources: ['01SRC_B'], confidence: 0.2 })
    seedPage({ id: '01KV3_05', body: '# Fine\n\nAuth details. [[raw/bash_trace/2026/04/18/01SRC_B]]\n', sources: ['01SRC_B'], confidence: 0.5 })
    await embedAll(['01KV3_02', '01KV3_05'])

    const out = await runV3Search({ workspace_id: 'ws_v3', project_id: 'proj_v3', query: 'auth details' })
    const ids = out.map((r) => r.memory_id)
    expect(ids).toContain('01KV3_05')
    expect(ids).not.toContain('01KV3_02')
  })
})

describe('runV3Search — supersession filter', () => {
  it('skips rows whose superseded_by is non-null by default', async () => {
    seedPage({ id: '01KV3_OLD', body: '# Old claim\n\nAuth uses basic. [[raw/bash_trace/2026/04/18/01SRC_C]]\n', sources: ['01SRC_C'] })
    seedPage({ id: '01KV3_NEW', body: '# Updated\n\nAuth uses OAuth. [[raw/bash_trace/2026/04/18/01SRC_C]]\n', sources: ['01SRC_C'] })
    markSuperseded('01KV3_OLD', '01KV3_NEW')
    await embedAll(['01KV3_OLD', '01KV3_NEW'])

    const out = await runV3Search({ workspace_id: 'ws_v3', project_id: 'proj_v3', query: 'auth' })
    const ids = out.map((r) => r.memory_id)
    expect(ids).toContain('01KV3_NEW')
    expect(ids).not.toContain('01KV3_OLD')
  })

  it('returns superseded rows when include_superseded=true', async () => {
    seedPage({ id: '01KV3_OLD', body: '# Old claim\n\nAuth uses basic. [[raw/bash_trace/2026/04/18/01SRC_C]]\n', sources: ['01SRC_C'] })
    seedPage({ id: '01KV3_NEW', body: '# Updated\n\nAuth uses OAuth. [[raw/bash_trace/2026/04/18/01SRC_C]]\n', sources: ['01SRC_C'] })
    markSuperseded('01KV3_OLD', '01KV3_NEW')
    await embedAll(['01KV3_OLD', '01KV3_NEW'])

    const out = await runV3Search({ workspace_id: 'ws_v3', project_id: 'proj_v3', query: 'auth', include_superseded: true })
    const ids = out.map((r) => r.memory_id)
    expect(ids).toContain('01KV3_OLD')
    expect(ids).toContain('01KV3_NEW')
  })
})

describe('runV3Search — schema_version gate', () => {
  it('ignores legacy (schema_version < 3) rows', async () => {
    seedPage({ id: '01KV3_REAL', body: '# V3 page\n\nAuth middleware. [[raw/bash_trace/2026/04/18/01SRC_D]]\n', sources: ['01SRC_D'] })
    const db = getDb()
    const now = new Date().toISOString()
    // Insert a pre-v3 row directly so we know schema_version=1 is the gate.
    db.prepare(`INSERT INTO memories (
      memory_id, workspace_id, project_id, scope, kind, title, summary, content,
      tags, entities, confidence, importance, freshness, content_hash,
      source, content_type, tier, slug, vault_path, provenance,
      schema_version, created_at, updated_at, last_accessed_at, access_count
    ) VALUES (?, ?, ?, 'project', 'fact', ?, 'auth summary', 'auth middleware prose', '[]', '[]', 0.9, 0.5, 1.0, 'abc',
              'legacy', 'text', 'short_term', ?, 'legacy/path.md', '{}', 1, ?, ?, ?, 0)
    `).run('mem_LEGACY', 'ws_v3', 'proj_v3', 'Legacy title', 'mem_LEGACY', now, now, now)
    await embedAll(['01KV3_REAL'])

    const out = await runV3Search({ workspace_id: 'ws_v3', project_id: 'proj_v3', query: 'auth middleware' })
    const ids = out.map((r) => r.memory_id)
    expect(ids).toContain('01KV3_REAL')
    expect(ids).not.toContain('mem_LEGACY')
  })
})

describe('runV3Search — graph traversal', () => {
  it('surfaces a page whose entity is 1 hop from a query-mentioned entity', async () => {
    const reactId = upsertEntity({ workspace_id: 'ws_v3', entity_type: 'library', name: 'React' })
    const hookId = upsertEntity({ workspace_id: 'ws_v3', entity_type: 'concept', name: 'useState' })
    addEdge({ workspace_id: 'ws_v3', source_id: reactId, target_id: hookId, relation: 'provides' })

    // Page body has NO mention of "React" — FTS alone wouldn't find it. It only
    // links via the graph (entities[] contains hookId).
    seedPage({
      id: '01KV3_HOOK',
      body: `# The useState hook\n\nIt stores component-local state. [[raw/bash_trace/2026/04/18/01SRC_H]]\n`,
      sources: ['01SRC_H'],
      entities: [hookId],
    })
    await embedAll(['01KV3_HOOK'])

    const out = await runV3Search({ workspace_id: 'ws_v3', project_id: 'proj_v3', query: 'React' })
    const ids = out.map((r) => r.memory_id)
    expect(ids).toContain('01KV3_HOOK')
    const hit = out.find((r) => r.memory_id === '01KV3_HOOK')!
    expect(hit.stage_ranks.graph).toBeDefined()
  })

  it('a page whose entity is the query match itself still scores via graph', async () => {
    const reduxId = upsertEntity({ workspace_id: 'ws_v3', entity_type: 'library', name: 'Redux' })
    seedPage({
      id: '01KV3_REDUX',
      body: `# State management library choice\n\nUse this pattern. [[raw/bash_trace/2026/04/18/01SRC_R]]\n`,
      sources: ['01SRC_R'],
      entities: [reduxId],
    })
    await embedAll(['01KV3_REDUX'])

    const out = await runV3Search({ workspace_id: 'ws_v3', project_id: 'proj_v3', query: 'Redux' })
    const ids = out.map((r) => r.memory_id)
    expect(ids).toContain('01KV3_REDUX')
  })
})

describe('runV3Search — L0 back-refs on every hit', () => {
  it('returns sources[] + l0_wikilinks[] parsed from the body', async () => {
    seedPage({
      id: '01KV3_REFS',
      body: '# Auth\n\nFirst claim [[raw/bash_trace/2026/04/18/01SRC_A]].\nSecond claim [[raw/bash_trace/2026/04/18/01SRC_B]].\n',
      sources: ['01SRC_A', '01SRC_B'],
    })
    await embedAll(['01KV3_REFS'])

    const out = await runV3Search({ workspace_id: 'ws_v3', project_id: 'proj_v3', query: 'auth' })
    const hit = out.find((r) => r.memory_id === '01KV3_REFS')!
    expect(hit.sources.sort()).toEqual(['01SRC_A', '01SRC_B'])
    expect(hit.l0_wikilinks.length).toBe(2)
    expect(hit.l0_wikilinks[0]).toContain('raw/bash_trace/')
  })
})
