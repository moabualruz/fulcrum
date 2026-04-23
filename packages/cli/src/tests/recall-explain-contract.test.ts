import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  _configureDb,
  setDb,
  closeDb,
  runMigrations,
  getDb,
  registerEmbeddingProvider,
  initEmbedding,
  resetProviders,
  getReranker,
  getTextEmbedder,
  loadConfig,
  type FulcrumConfig,
} from 'fulcrum-agent-core'
import {
  runMigration101MemoryV3Lifecycle,
  createCuratedPage,
  recordL1Embedding,
  flushPendingMemoryWrites,
  type CuratedPage,
} from 'fulcrum-memory'
import { recallKnowledge } from '../commands/memory-recall.js'
import { TOOL_SCHEMAS } from '../mcp-tools.js'
import { TOOL_REGISTRY, buildDeps } from '../tool-registry.js'

vi.mock('fulcrum-agent-core', async () => {
  const actual = await vi.importActual<typeof import('fulcrum-agent-core')>('fulcrum-agent-core')
  return {
    ...actual,
    getTextEmbedder: vi.fn(() => actual.getTextEmbedder()),
    initEmbedding: vi.fn((config: Parameters<typeof actual.initEmbedding>[0]) => actual.initEmbedding(config)),
    loadConfig: vi.fn(() => actual.loadConfig()),
    getReranker: vi.fn().mockReturnValue(null),
  }
})

const STUB_DIM = 1024

class StubEmbeddingProvider {
  dimensions = STUB_DIM
  actualDevice = 'cpu'
  async warmUp(): Promise<void> {}
  async embed(text: string): Promise<Float32Array> { return this.embedDocument(text) }
  async embedBatch(texts: string[]): Promise<Float32Array[]> { return Promise.all(texts.map((t) => this.embedDocument(t))) }
  async embedDocument(text: string): Promise<Float32Array> {
    const vec = new Float32Array(STUB_DIM)
    for (let i = 0; i < text.length; i++) vec[i % STUB_DIM] = (vec[i % STUB_DIM] ?? 0) + text.charCodeAt(i) / 1024
    return vec
  }
}

async function installStub(): Promise<void> {
  registerEmbeddingProvider('fulcrum-test-stub', () => new StubEmbeddingProvider())
  await initEmbedding({
    workspace_id: 'test',
    project_id: 'test',
    port: 0,
    embedding: { text: { provider: 'fulcrum-test-stub' as 'custom', model: 'stub' }, code: null },
    reranker: { provider: 'custom', model: 'stub' },
    policy: { wip_limit: 0, wip_limit_per_role: {}, heartbeat_timeout_minutes: 0, escalation_timeout_minutes: 0 },
  })
}

let tmpVault: string
let prevVaultEnv: string | undefined

beforeEach(async () => {
  vi.mocked(getReranker).mockReturnValue(null)
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  runMigration101MemoryV3Lifecycle(db)
  db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES ('ws_cli_explain', 'ws_cli_explain')").run()
  db.prepare("INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES ('proj_cli_explain', 'ws_cli_explain', 'proj_cli_explain')").run()
  setDb(db)
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-cli-explain-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
  await installStub()
})

afterEach(() => {
  resetProviders()
  closeDb()
  vi.clearAllMocks()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
})

function seedPage(): CuratedPage {
  const page: CuratedPage = {
    id: '01CLI_EXPLAIN',
    schema: 'fulcrum.memory/v3',
    type: 'page',
    title: 'CLI explain page',
    confidence: 0.8,
    first_seen: '2026-04-22T10:00:00Z',
    last_confirmed: '2026-04-22T10:00:00Z',
    retention_tier: 'working',
    access_count: 0,
    sources: ['src_cli_explain'],
    sources_via: [],
    supersedes: [],
    superseded_by: null,
    entities: [],
    workspace_id: 'ws_cli_explain',
    project_id: 'proj_cli_explain',
    body: '# CLI explain\n\nCLI explain contract target. [[raw/bash_trace/2026/04/22/src_cli_explain]]\n',
  }
  return createCuratedPage(page)
}

describe('recall explain CLI/MCP contract', () => {
  it('returns explanation only when recallKnowledge explain is requested', async () => {
    seedPage()
    recordL1Embedding(getDb(), '01CLI_EXPLAIN')
    await flushPendingMemoryWrites(5_000)

    const plain = await recallKnowledge({
      workspace_id: 'ws_cli_explain',
      project_id: 'proj_cli_explain',
      query: 'cli explain contract',
    })
    expect(plain.results[0]!.explanation).toBeUndefined()

    const explained = await recallKnowledge({
      workspace_id: 'ws_cli_explain',
      project_id: 'proj_cli_explain',
      query: 'cli explain contract',
      explain: true,
    })
    expect(explained.results[0]!.explanation).toBeDefined()
    expect(explained.results[0]!.explanation!.trust.provenance_class).toBe('legacy-unbacked')
  })

  it('exposes explain on recall_knowledge MCP schema and registry handler', async () => {
    seedPage()
    recordL1Embedding(getDb(), '01CLI_EXPLAIN')
    await flushPendingMemoryWrites(5_000)

    const schema = TOOL_SCHEMAS.find((tool) => tool.name === 'recall_knowledge')!
    const props = schema.inputSchema.properties as Record<string, unknown>
    expect(props['explain']).toEqual(expect.objectContaining({ type: 'boolean' }))

    const entry = TOOL_REGISTRY.get('recall_knowledge')!
    const result = await entry.handler({
      query: 'cli explain contract',
      explain: true,
    }, buildDeps('ws_cli_explain', 'proj_cli_explain')) as { results: Array<{ explanation?: unknown }> }
    expect(result.results[0]!.explanation).toBeDefined()
  })

  it('fails closed when explicit recall embedding device cannot initialize', async () => {
    const explicitCudaConfig: FulcrumConfig = {
      workspace_id: 'test',
      project_id: 'test',
      port: 0,
      embedding: { text: { provider: 'local', model: 'stub', device: 'cuda' }, code: null },
      reranker: { provider: 'custom', model: 'stub' },
      policy: { wip_limit: 0, wip_limit_per_role: {}, heartbeat_timeout_minutes: 0, escalation_timeout_minutes: 0 },
      vault: { l2_enabled: false },
    }
    vi.mocked(getTextEmbedder).mockReturnValueOnce(null)
    vi.mocked(loadConfig).mockReturnValueOnce(explicitCudaConfig)
    vi.mocked(initEmbedding).mockRejectedValueOnce(new Error('cuda unavailable'))

    const entry = TOOL_REGISTRY.get('recall_knowledge')!
    await expect(entry.handler({
      query: 'explicit device should fail closed',
      explain: true,
    }, buildDeps('ws_cli_explain', 'proj_cli_explain'))).rejects.toThrow('cuda unavailable')
  })

  it('fails closed when initialized provider violates explicit recall device', async () => {
    const explicitCudaConfig: FulcrumConfig = {
      workspace_id: 'test',
      project_id: 'test',
      port: 0,
      embedding: { text: { provider: 'custom', model: 'stub', device: 'cuda' }, code: null },
      reranker: { provider: 'custom', model: 'stub' },
      policy: { wip_limit: 0, wip_limit_per_role: {}, heartbeat_timeout_minutes: 0, escalation_timeout_minutes: 0 },
      vault: { l2_enabled: false },
    }
    const mismatchedProvider = {
      dimensions: STUB_DIM,
      actualDevice: 'cpu',
      warmUp: vi.fn(),
      embed: vi.fn().mockResolvedValue(new Float32Array(STUB_DIM)),
    }
    vi.mocked(getTextEmbedder)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(mismatchedProvider)
    vi.mocked(loadConfig).mockReturnValueOnce(explicitCudaConfig)
    vi.mocked(initEmbedding).mockResolvedValueOnce(undefined)

    const entry = TOOL_REGISTRY.get('recall_knowledge')!
    await expect(entry.handler({
      query: 'explicit device mismatch should fail closed',
      explain: true,
    }, buildDeps('ws_cli_explain', 'proj_cli_explain'))).rejects.toThrow(/requested device cuda/)
  })

  it('passes explain through the search_code registry handler', async () => {
    getDb().prepare(`INSERT INTO code_chunks (
      chunk_id, workspace_id, project_id, file_path, language, chunk_strategy, source_type, content, start_line, end_line, indexed_at
    ) VALUES (
      'chunk_cli_explain', 'ws_cli_explain', 'proj_cli_explain', 'src/cli-explain.ts', 'typescript', 'syntax', 'code',
      'export const cliExplainNeedle = "search code explain"', 1, 1, '2026-04-22T10:00:00Z'
    )`).run()

    const entry = TOOL_REGISTRY.get('search_code')!
    const result = await entry.handler({
      text: 'search code explain',
      explain: true,
    }, buildDeps('ws_cli_explain', 'proj_cli_explain')) as { results: Array<{ explanation?: { trust: { provenance_class: string } } }> }

    expect(result.results[0]!.explanation?.trust.provenance_class).toBe('code-backed')
  })
})
