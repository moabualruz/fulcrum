import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  _configureDb,
  closeDb,
  getDb,
  initEmbedding,
  registerEmbeddingProvider,
  resetProviders,
  runMigrations,
  setDb,
} from 'fulcrum-agent-core'
import {
  createCuratedPage,
  flushPendingMemoryWrites,
  recordL1Embedding,
  runMigration101MemoryV3Lifecycle,
  type CuratedPage,
} from 'fulcrum-memory'
import { recallKnowledge } from '../commands/memory-recall.js'
import { TOOL_SCHEMAS } from '../mcp-tools.js'
import { TOOL_REGISTRY } from '../tool-registry.js'

const STUB_DIM = 1024

class StubEmbeddingProvider {
  dimensions = STUB_DIM
  provider = 'custom'
  model = 'stub'
  device = 'auto'
  actualDevice = 'cpu'
  async warmUp(): Promise<void> {}
  async embed(text: string): Promise<Float32Array> { return this.embedDocument(text) }
  async embedBatch(texts: string[]): Promise<Float32Array[]> { return Promise.all(texts.map((text) => this.embedDocument(text))) }
  async embedDocument(text: string): Promise<Float32Array> {
    const vec = new Float32Array(STUB_DIM)
    for (let i = 0; i < text.length; i++) vec[i % STUB_DIM] = (vec[i % STUB_DIM] ?? 0) + text.charCodeAt(i) / 1024
    return vec
  }
}

let tmpVault: string
let prevVaultEnv: string | undefined

beforeEach(async () => {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  runMigration101MemoryV3Lifecycle(db)
  db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES ('ws_cli_exp', 'ws_cli_exp')").run()
  db.prepare("INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES ('proj_cli_exp', 'ws_cli_exp', 'proj_cli_exp')").run()
  setDb(db)
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-cli-recall-explain-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
  registerEmbeddingProvider('fulcrum-cli-explain-stub', () => new StubEmbeddingProvider())
  await initEmbedding({
    workspace_id: 'test',
    project_id: 'test',
    port: 0,
    embedding: { text: { provider: 'fulcrum-cli-explain-stub' as 'custom', model: 'stub' }, code: null },
    reranker: { provider: 'custom', model: 'stub' },
    policy: { wip_limit: 0, wip_limit_per_role: {}, heartbeat_timeout_minutes: 0, escalation_timeout_minutes: 0 },
  })
})

afterEach(() => {
  resetProviders()
  closeDb()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
})

function seedRawSource(sourceId: string): void {
  getDb()
    .prepare(
      `INSERT INTO l0_sources (source_id, source_type, workspace_id, project_id, vault_path, content_hash, size_bytes, created_at)
       VALUES (?, 'session_transcript', 'ws_cli_exp', 'proj_cli_exp', ?, ?, 20, '2026-04-22T13:00:00Z')`,
    )
    .run(sourceId, `raw/session_transcript/2026/04/22/${sourceId}.md`, `hash-${sourceId}`)
}

function seedPage(id: string): CuratedPage {
  const now = '2026-04-22T13:00:00Z'
  const page: CuratedPage = {
    id,
    schema: 'fulcrum.memory/v3',
    type: 'page',
    title: `Page ${id}`,
    confidence: 0.8,
    first_seen: now,
    last_confirmed: now,
    retention_tier: 'working',
    access_count: 0,
    sources: ['01CLI_EXP_SRC'],
    sources_via: [],
    supersedes: [],
    superseded_by: null,
    entities: [],
    workspace_id: 'ws_cli_exp',
    project_id: 'proj_cli_exp',
    body: '# Auth\n\nAuth recall explain contract. [[raw/session_transcript/2026/04/22/01CLI_EXP_SRC]]\n',
  }
  return createCuratedPage(page)
}

async function seedRecallFixture(): Promise<void> {
  seedRawSource('01CLI_EXP_SRC')
  seedPage('01CLI_EXP_PAGE')
  recordL1Embedding(getDb(), '01CLI_EXP_PAGE')
  await flushPendingMemoryWrites(5_000)
}

describe('recall explain CLI/MCP contract', () => {
  it('recallKnowledge returns explanation only when requested', async () => {
    await seedRecallFixture()

    const withoutExplain = await recallKnowledge({
      workspace_id: 'ws_cli_exp',
      project_id: 'proj_cli_exp',
      query: 'auth recall',
    })
    expect(withoutExplain.results[0]).not.toHaveProperty('explanation')

    const withExplain = await recallKnowledge({
      workspace_id: 'ws_cli_exp',
      project_id: 'proj_cli_exp',
      query: 'auth recall',
      explain: true,
    })
    expect(withExplain.results[0]).toHaveProperty('explanation')
    expect(withExplain.results[0]!.explanation).toMatchObject({
      result_id: '01CLI_EXP_PAGE',
      result_type: 'memory',
      trust: { provenance_class: 'raw-backed' },
    })
  })

  it('recall_knowledge MCP schema and handler accept explain=true', async () => {
    await seedRecallFixture()

    const schema = TOOL_SCHEMAS.find((tool) => tool.name === 'recall_knowledge')
    const props = schema!.inputSchema.properties as Record<string, unknown>
    expect(props['explain']).toEqual(expect.objectContaining({ type: 'boolean' }))

    const entry = TOOL_REGISTRY.get('recall_knowledge')!
    const out = await entry.handler(
      {
        workspace_id: 'ws_cli_exp',
        project_id: 'proj_cli_exp',
        query: 'auth recall',
        explain: true,
      },
      { db: getDb(), workspace_id: 'ws_cli_exp', project_id: 'proj_cli_exp' },
    ) as Awaited<ReturnType<typeof recallKnowledge>>

    expect(out.results[0]!.explanation).toMatchObject({
      result_id: '01CLI_EXP_PAGE',
      trust: { provenance_class: 'raw-backed' },
    })
  })
})
