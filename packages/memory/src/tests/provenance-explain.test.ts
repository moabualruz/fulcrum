import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getDb, getReranker } from 'fulcrum-agent-core'
import {
  createTestDb,
  resetTestDb,
  seedWorkspaceAndProject,
  registerStubEmbedder,
  unregisterStubEmbedder,
} from './helpers.js'
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
  seedWorkspaceAndProject(getDb(), 'ws_prov_exp', 'proj_prov_exp')
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

function seedRawSource(sourceId: string): void {
  getDb()
    .prepare(
      `INSERT INTO l0_sources (source_id, source_type, workspace_id, project_id, vault_path, content_hash, size_bytes, created_at)
       VALUES (?, 'tool_trace', 'ws_prov_exp', 'proj_prov_exp', ?, ?, 20, '2026-04-22T11:00:00Z')`,
    )
    .run(sourceId, `raw/tool_trace/2026/04/22/${sourceId}.md`, `hash-${sourceId}`)
}

function seedPage(id: string, body: string, sources: string[]): CuratedPage {
  const now = '2026-04-22T11:00:00Z'
  return createCuratedPage({
    id,
    schema: 'fulcrum.memory/v3',
    type: 'page',
    title: `Page ${id}`,
    confidence: 0.7,
    first_seen: now,
    last_confirmed: now,
    retention_tier: 'working',
    access_count: 0,
    sources,
    sources_via: [],
    supersedes: [],
    superseded_by: null,
    entities: [],
    workspace_id: 'ws_prov_exp',
    project_id: 'proj_prov_exp',
    body,
  })
}

async function explainFor(query: string, id: string) {
  const hits = await runV3Search({
    workspace_id: 'ws_prov_exp',
    project_id: 'proj_prov_exp',
    query,
    explain: true,
  })
  const hit = hits.find((row) => row.memory_id === id)
  expect(hit).toBeDefined()
  expect(hit!.explanation).toBeDefined()
  return hit!.explanation!
}

describe('recall provenance explanations', () => {
  it('classifies resolved raw-backed memory and exposes source links', async () => {
    seedRawSource('01PROV_RAW')
    seedPage(
      '01PROV_PAGE',
      '# Deployment note\n\nDeployment trace came from raw evidence. [[raw/tool_trace/2026/04/22/01PROV_RAW]]\n',
      ['01PROV_RAW'],
    )
    recordL1Embedding(getDb(), '01PROV_PAGE')
    await flushPendingMemoryWrites(5_000)

    const explanation = await explainFor('deployment trace', '01PROV_PAGE')

    expect(explanation.trust.provenance_class).toBe('raw-backed')
    expect(explanation.sources).toContainEqual(
      expect.objectContaining({
        kind: 'raw',
        source_id: '01PROV_RAW',
        path: 'raw/tool_trace/2026/04/22/01PROV_RAW.md',
        status: 'resolved',
      }),
    )
  })

  it('detects broken raw source references without hiding the result', async () => {
    seedPage(
      '01PROV_BROKEN',
      '# Broken note\n\nBroken source reference should be visible. [[raw/tool_trace/2026/04/22/01PROV_MISSING]]\n',
      ['01PROV_MISSING'],
    )
    recordL1Embedding(getDb(), '01PROV_BROKEN')
    await flushPendingMemoryWrites(5_000)

    const explanation = await explainFor('broken source reference', '01PROV_BROKEN')

    expect(explanation.trust.provenance_class).toBe('raw-backed')
    expect(explanation.sources).toContainEqual(
      expect.objectContaining({
        kind: 'raw',
        source_id: '01PROV_MISSING',
        status: 'missing',
      }),
    )
  })
})
