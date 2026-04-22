// packages/memory/src/tests/helpers.ts
import Database from 'better-sqlite3'
import { setDb, closeDb, _configureDb, runMigrations, registerEmbeddingProvider, initEmbedding, resetProviders } from 'fulcrum-agent-core'

export function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

export function resetTestDb(): void {
  closeDb()
}

export function seedWorkspaceAndProject(db: Database.Database, wsId = 'ws_1', projId = 'proj_1'): void {
  db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES (?, ?)").run(wsId, wsId)
  db.prepare("INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES (?, ?, ?)").run(projId, wsId, projId)
}

// ── Stub embedder ────────────────────────────────────────────────────────
// vec_memories is declared `float[1024]`; the stub must honour that or the
// INSERT is rejected. A deterministic hash-style fill lets tests assert that
// update == replace (the vector genuinely changes when the body changes).

const STUB_DIM = 1024

class StubEmbeddingProvider {
  dimensions = STUB_DIM
  provider = 'stub'
  model = 'stub'
  device = 'auto'
  actualDevice = 'cpu'
  async warmUp(): Promise<void> { /* no-op */ }
  async embed(text: string): Promise<Float32Array> { return this.embedDocument(text) }
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map((t) => this.embedDocument(t)))
  }
  async embedDocument(text: string): Promise<Float32Array> {
    const vec = new Float32Array(STUB_DIM)
    for (let i = 0; i < text.length; i++) {
      vec[i % STUB_DIM] = (vec[i % STUB_DIM] ?? 0) + text.charCodeAt(i) / 1024
    }
    return vec
  }
}

export async function registerStubEmbedder(): Promise<void> {
  registerEmbeddingProvider('fulcrum-test-stub', () => new StubEmbeddingProvider())
  await initEmbedding({
    workspace_id: 'test',
    project_id: 'test',
    port: 0,
    embedding: {
      text: { provider: 'fulcrum-test-stub' as 'custom', model: 'stub' },
      code: null,
    },
    // provider !== 'local' keeps rerankerProvider null, avoiding the local
    // model warm-up (which would download ONNX weights from the network).
    reranker: { provider: 'custom', model: 'stub' },
    policy: {
      wip_limit: 0,
      wip_limit_per_role: {},
      heartbeat_timeout_minutes: 0,
      escalation_timeout_minutes: 0,
    },
  })
}

export function unregisterStubEmbedder(): void {
  resetProviders()
}
