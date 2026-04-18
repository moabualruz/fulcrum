// packages/cli/src/tests/memory-curate-integration.test.ts
//
// Memory v3 PR 3 unit 3.8 — end-to-end integration tests.
//
// These tests compose the full curator pipeline (units 3.1-3.7):
//   ingestRawSource (L0 row + vault file)
//     → curateMemory (runCurator via stub backend → applyCuratorOutput →
//       appendCuratorLog)
//     → readCuratedPage (L1 file + memories row)
//     → graph_edges row inspection
//     → log.md audit inspection
//
// The stub backend returns a deterministic CuratorOutput that exercises
// every array (new_pages, updates, supersessions, new_edges). pi is
// deliberately skipped — plan says "stub in PR 3, filled when pi's non-
// interactive mode stabilizes."

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  _configureDb,
  setDb,
  closeDb,
  runMigrations,
  getDb,
} from 'fulcrum-agent-core'
import {
  runMigration101MemoryV3Lifecycle,
  ingestRawSource,
  upsertEntity,
  createCuratedPage,
  readCuratedPage,
  clearBackendsForTest,
  registerBackend,
  type CuratorBackend,
  type CuratedPage,
} from 'fulcrum-memory'
import { curateMemory } from '../commands/memory-curate.js'

let tmpVault: string
let prevVaultEnv: string | undefined

function freshDb(): void {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  runMigration101MemoryV3Lifecycle(db)
  db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES (?, ?)").run('ws_int3', 'ws_int3')
  db.prepare("INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES (?, ?, ?)").run('proj_int3', 'ws_int3', 'proj_int3')
  setDb(db)
}

function stubBackend(name: 'codex' | 'openai', rawText: string): CuratorBackend {
  return {
    name,
    async isAvailable() {
      return true
    },
    async curate(input) {
      return {
        raw_text: rawText,
        backend: name,
        model: input.model,
        duration_ms: 1,
      }
    },
  }
}

beforeEach(() => {
  freshDb()
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-curate-int-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
  clearBackendsForTest()
})

afterEach(() => {
  closeDb()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
  clearBackendsForTest()
})

function seedL0(): string {
  const file = ingestRawSource({
    source_type: 'bash_trace',
    body: 'pnpm build\n✓ 117 packages\n',
    meta: { workspace_id: 'ws_int3', project_id: 'proj_int3', cwd: '/home/mkh' },
  })
  return file.frontmatter.id
}

describe('curator PR 3 end-to-end (stub backend)', () => {
  it('creates L1 page + memories row + vault file + telemetry from one L0 source', async () => {
    const source_id = seedL0()
    const curatorOutput = JSON.stringify({
      new_pages: [
        {
          type: 'page',
          name: null,
          title: 'Build success',
          entity_type: null,
          aliases: null,
          confidence: 0.95,
          retention_tier: 'working',
          sources: [source_id],
          sources_via: [],
          entities: [],
          body: `# Build success\n\n[[raw/bash_trace/2026/04/18/${source_id}]] passed.\n`,
        },
      ],
      updates: [],
      supersessions: [],
      new_edges: [],
    })
    registerBackend(stubBackend('codex', curatorOutput))

    const result = await curateMemory({ l0_id: source_id, backend: 'codex' })
    expect(result.apply.created_page_ids).toHaveLength(1)
    const page_id = result.apply.created_page_ids[0]!

    // L1 round-trip: readCuratedPage returns a page with schema_version=3.
    const page = readCuratedPage(page_id)
    expect(page).not.toBeNull()
    expect(page!.title).toBe('Build success')
    expect(page!.sources).toEqual([source_id])

    // DB row exists with schema_version=3 and the correct workspace.
    const row = getDb()
      .prepare('SELECT workspace_id, schema_version FROM memories WHERE memory_id = ?')
      .get(page_id) as { workspace_id: string; schema_version: number }
    expect(row.workspace_id).toBe('ws_int3')
    expect(row.schema_version).toBeGreaterThanOrEqual(3)

    // Vault file on disk.
    const vaultPath = join(tmpVault, 'curated', 'pages', `${page_id}.md`)
    expect(existsSync(vaultPath)).toBe(true)
    expect(readFileSync(vaultPath, 'utf-8')).toContain(source_id)

    // Telemetry line.
    const logPath = join(tmpVault, 'curated', 'log.md')
    const entry = JSON.parse(readFileSync(logPath, 'utf-8').trim()) as {
      backend: string
      affected_pages: { created: string[] }
      l0_id: string
    }
    expect(entry.backend).toBe('codex')
    expect(entry.l0_id).toBe(source_id)
    expect(entry.affected_pages.created).toEqual([page_id])
  })

  it('mutates graph when CuratorOutput supplies new_edges with existing entities', async () => {
    const source_id = seedL0()
    const reactId = upsertEntity({
      workspace_id: 'ws_int3',
      entity_type: 'library',
      name: 'React',
    })
    const hooksId = upsertEntity({
      workspace_id: 'ws_int3',
      entity_type: 'concept',
      name: 'hooks',
    })

    const curatorOutput = JSON.stringify({
      new_pages: [],
      updates: [],
      supersessions: [],
      new_edges: [
        {
          source_entity_id: reactId,
          target_entity_id: hooksId,
          relation: 'provides',
          confidence: 0.92,
          source_ids: [source_id],
        },
      ],
    })
    registerBackend(stubBackend('codex', curatorOutput))

    const result = await curateMemory({ l0_id: source_id, backend: 'codex' })
    expect(result.apply.created_edge_ids).toHaveLength(1)
    const edge = getDb()
      .prepare('SELECT relation, confidence, source_ids FROM graph_edges WHERE edge_id = ?')
      .get(result.apply.created_edge_ids[0]!) as { relation: string; confidence: number; source_ids: string | null }
    expect(edge.relation).toBe('provides')
    expect(edge.confidence).toBe(0.92)
    expect(JSON.parse(edge.source_ids ?? '[]')).toEqual([source_id])
  })

  it('supersedes an existing page — old row carries superseded_by, new row carries supersedes[old_id]', async () => {
    const source_id = seedL0()
    // Pre-seed an old L1 page that the curator will supersede.
    const oldId = '01KINTOLD'
    const oldPage: CuratedPage = {
      id: oldId,
      schema: 'fulcrum.memory/v3',
      type: 'page',
      title: 'Stale',
      confidence: 0.5,
      first_seen: '2026-04-18T10:00:00Z',
      last_confirmed: '2026-04-18T10:00:00Z',
      retention_tier: 'working',
      access_count: 0,
      sources: [source_id],
      sources_via: [],
      supersedes: [],
      superseded_by: null,
      entities: [],
      workspace_id: 'ws_int3',
      project_id: 'proj_int3',
      body: `# Stale\n\n[[raw/bash_trace/2026/04/18/${source_id}]]\n`,
    }
    createCuratedPage(oldPage)

    const curatorOutput = JSON.stringify({
      new_pages: [],
      updates: [],
      supersessions: [
        {
          old_page_id: oldId,
          reason: 'Build now reports 117 packages instead of 100',
          new_page: {
            type: 'page',
            name: null,
            title: 'Fresh',
            entity_type: null,
            aliases: null,
            confidence: 0.9,
            retention_tier: 'working',
            sources: [source_id],
            sources_via: [],
            entities: [],
            body: `# Fresh\n\n117 packages per [[raw/bash_trace/2026/04/18/${source_id}]].\n`,
          },
        },
      ],
      new_edges: [],
    })
    registerBackend(stubBackend('codex', curatorOutput))

    const result = await curateMemory({ l0_id: source_id, backend: 'codex' })
    expect(result.apply.superseded_pairs).toHaveLength(1)
    const { old_id, new_id } = result.apply.superseded_pairs[0]!
    expect(old_id).toBe(oldId)

    // Old row now points at new.
    const oldRow = getDb()
      .prepare('SELECT superseded_by FROM memories WHERE memory_id = ?')
      .get(oldId) as { superseded_by: string | null }
    expect(oldRow.superseded_by).toBe(new_id)

    // New page's supersedes includes old.
    const fresh = readCuratedPage(new_id)!
    expect(fresh.supersedes).toContain(oldId)
  })

  it('backend rotation: codex vs openai both land identical CuratorOutputs via stubs', async () => {
    // codex first.
    const source_id = seedL0()
    const curatorOutput = JSON.stringify({
      new_pages: [
        {
          type: 'page',
          name: null,
          title: 'CodexPath',
          entity_type: null,
          aliases: null,
          confidence: 0.7,
          retention_tier: 'working',
          sources: [source_id],
          sources_via: [],
          entities: [],
          body: `# CodexPath\n\n[[raw/bash_trace/2026/04/18/${source_id}]]\n`,
        },
      ],
      updates: [],
      supersessions: [],
      new_edges: [],
    })
    registerBackend(stubBackend('codex', curatorOutput))
    registerBackend(
      stubBackend(
        'openai',
        curatorOutput.replaceAll('CodexPath', 'OpenAIPath'),
      ),
    )

    const viaCodex = await curateMemory({ l0_id: source_id, backend: 'codex' })
    const viaOpenai = await curateMemory({ l0_id: source_id, backend: 'openai' })

    expect(viaCodex.backend).toBe('codex')
    expect(viaOpenai.backend).toBe('openai')

    // Telemetry has two entries with matching backends.
    const logPath = join(tmpVault, 'curated', 'log.md')
    const lines = readFileSync(logPath, 'utf-8').trim().split('\n')
    expect(lines).toHaveLength(2)
    const first = JSON.parse(lines[0]!) as { backend: string }
    const second = JSON.parse(lines[1]!) as { backend: string }
    expect(first.backend).toBe('codex')
    expect(second.backend).toBe('openai')
  })

  it('dry-run does not land pages in DB or vault but still appends telemetry', async () => {
    const source_id = seedL0()
    const curatorOutput = JSON.stringify({
      new_pages: [
        {
          type: 'page',
          name: null,
          title: 'Phantom',
          entity_type: null,
          aliases: null,
          confidence: 0.5,
          retention_tier: 'working',
          sources: [source_id],
          sources_via: [],
          entities: [],
          body: `# Phantom\n\n[[raw/bash_trace/2026/04/18/${source_id}]]\n`,
        },
      ],
      updates: [],
      supersessions: [],
      new_edges: [],
    })
    registerBackend(stubBackend('codex', curatorOutput))

    await curateMemory({ l0_id: source_id, backend: 'codex', dry_run: true })

    // No pages in DB.
    const count = getDb()
      .prepare('SELECT COUNT(*) AS n FROM memories WHERE workspace_id = ?')
      .get('ws_int3') as { n: number }
    expect(count.n).toBe(0)

    // Telemetry present.
    const logPath = join(tmpVault, 'curated', 'log.md')
    const entry = JSON.parse(readFileSync(logPath, 'utf-8').trim()) as { dry_run: boolean }
    expect(entry.dry_run).toBe(true)
  })

  it('PR 3 Verify gate — full path: ingest → curate --dry-run → curate → log inspection', async () => {
    const source_id = seedL0()
    const curatorOutput = JSON.stringify({
      new_pages: [
        {
          type: 'page',
          name: null,
          title: 'Audit chain',
          entity_type: null,
          aliases: null,
          confidence: 0.85,
          retention_tier: 'working',
          sources: [source_id],
          sources_via: [],
          entities: [],
          body: `# Audit chain\n\n[[raw/bash_trace/2026/04/18/${source_id}]]\n`,
        },
      ],
      updates: [],
      supersessions: [],
      new_edges: [],
    })
    registerBackend(stubBackend('codex', curatorOutput))

    const dry = await curateMemory({ l0_id: source_id, backend: 'codex', dry_run: true })
    expect(dry.dry_run).toBe(true)

    const live = await curateMemory({ l0_id: source_id, backend: 'codex' })
    expect(live.dry_run).toBe(false)
    expect(live.apply.created_page_ids).toHaveLength(1)

    const logLines = readFileSync(join(tmpVault, 'curated', 'log.md'), 'utf-8')
      .trim()
      .split('\n')
    expect(logLines).toHaveLength(2)
    const [dryEntry, liveEntry] = logLines.map((l) => JSON.parse(l) as Record<string, unknown>)
    expect(dryEntry!['dry_run']).toBe(true)
    expect(liveEntry!['dry_run']).toBe(false)
    expect(dryEntry!['backend']).toBe('codex')
    expect(liveEntry!['backend']).toBe('codex')
    expect(liveEntry!['prompt_version']).toBe('v3.0.0')
  })
})
