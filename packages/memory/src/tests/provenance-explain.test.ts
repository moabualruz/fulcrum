import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
import { getDb, getReranker } from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle } from '../schema.js'
import { createCuratedPage } from '../l1/page.js'
import { recordL1Embedding } from '../l2/embed.js'
import { flushPendingMemoryWrites } from '../l2/queue.js'
import { runV3Search } from '../retrieval/v3-search.js'
import type { CuratedPage } from '../l1/frontmatter.js'

vi.mock('fulcrum-agent-core', async () => {
  const actual = await vi.importActual<typeof import('fulcrum-agent-core')>('fulcrum-agent-core')
  return {
    ...actual,
    getReranker: vi.fn().mockReturnValue(null),
  }
})

let tmpVault: string
let prevVaultEnv: string | undefined

beforeEach(async () => {
  vi.mocked(getReranker).mockReturnValue(null)
  createTestDb()
  runMigration101MemoryV3Lifecycle(getDb())
  seedWorkspaceAndProject(getDb(), 'ws_prov', 'proj_prov')
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-provenance-explain-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
  await registerStubEmbedder()
})

afterEach(() => {
  unregisterStubEmbedder()
  resetTestDb()
  vi.clearAllMocks()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
})

function seedPage(input: { id: string; body: string; sources: string[]; sources_via?: string[] }): CuratedPage {
  const now = '2026-04-22T10:00:00Z'
  return createCuratedPage({
    id: input.id,
    schema: 'fulcrum.memory/v3',
    type: 'page',
    title: `Page ${input.id}`,
    confidence: 0.8,
    first_seen: now,
    last_confirmed: now,
    retention_tier: 'working',
    access_count: 0,
    sources: input.sources,
    sources_via: input.sources_via ?? [],
    supersedes: [],
    superseded_by: null,
    entities: [],
    workspace_id: 'ws_prov',
    project_id: 'proj_prov',
    body: input.body,
  })
}

describe('provenance explain mapping', () => {
  it('classifies raw-backed results and surfaces broken raw source references', async () => {
    getDb().prepare(`
      INSERT INTO l0_sources (
        source_id, source_type, session_id, workspace_id, project_id, cwd,
        vault_path, content_hash, size_bytes, created_at
      ) VALUES (
        'src_present', 'bash_trace', NULL, 'ws_prov', 'proj_prov', NULL,
        'raw/bash_trace/2026/04/22/src_present.md', 'hash-present', 12, '2026-04-22T10:00:00Z'
      )
    `).run()

    seedPage({
      id: '01PROV_RAW',
      body: '# Raw backed\n\nRaw backed provenance target. [[raw/bash_trace/2026/04/22/src_missing]]\n',
      sources: ['src_present', 'src_missing'],
    })
    recordL1Embedding(getDb(), '01PROV_RAW')
    await flushPendingMemoryWrites(5_000)

    const out = await runV3Search({
      workspace_id: 'ws_prov',
      project_id: 'proj_prov',
      query: 'raw backed provenance',
      explain: true,
    })

    const hit = out.find((r) => r.memory_id === '01PROV_RAW')!
    expect(hit.explanation!.trust.provenance_class).toBe('raw-backed')
    expect(hit.explanation!.sources).toContainEqual(expect.objectContaining({
      kind: 'raw',
      source_id: 'src_present',
      path: 'raw/bash_trace/2026/04/22/src_present.md',
      missing: false,
    }))
    expect(hit.explanation!.sources).toContainEqual(expect.objectContaining({
      kind: 'raw',
      source_id: 'src_missing',
      missing: true,
    }))
  })

  it('classifies curated pages without raw refs as curated-backed', async () => {
    seedPage({
      id: '01PROV_CURATED',
      body: '# Curated only\n\nCurated only provenance target.\n',
      sources: [],
      sources_via: ['01PROV_SEED'],
    })
    recordL1Embedding(getDb(), '01PROV_CURATED')
    await flushPendingMemoryWrites(5_000)

    const out = await runV3Search({
      workspace_id: 'ws_prov',
      project_id: 'proj_prov',
      query: 'curated only provenance',
      explain: true,
    })

    const hit = out.find((r) => r.memory_id === '01PROV_CURATED')!
    expect(hit.explanation!.trust.provenance_class).toBe('curated-backed')
    expect(hit.explanation!.sources).toContainEqual(expect.objectContaining({
      kind: 'curated',
      source_id: '01PROV_CURATED',
      path: 'curated/pages/01PROV_CURATED.md',
    }))
  })
})
