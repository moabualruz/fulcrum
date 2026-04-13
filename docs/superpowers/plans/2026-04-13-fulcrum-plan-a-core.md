# Fulcrum Plan A: @fulcrum/core + SQLite Schema

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete `@fulcrum/core` package — all domain logic, SQLite schema, policy engine, janitor, embedding + memory, and status functions — as a fully tested, zero-transport TypeScript library.

**Architecture:** Hexagonal / ports-and-adapters. All 14 public functions live in `packages/core/src/`. Transports (Plans B–E) import these functions directly — no business logic outside core. Tests use an in-memory SQLite database injected via `setDb()`.

**Tech Stack:** pnpm workspaces, TypeScript (ESM), better-sqlite3, sqlite-vec, @huggingface/transformers v3, ulid, vitest

---

## Scope note

This plan produces `packages/core/` only. It does NOT touch the existing Python code in `src/`. The Python backend stays intact until Plan F (migration). New TypeScript structure is added alongside it.

---

## File Map

| File | Responsibility |
|---|---|
| `pnpm-workspace.yaml` | Workspace root config |
| `packages/core/package.json` | Core package manifest + deps |
| `packages/core/tsconfig.json` | TypeScript config |
| `packages/core/vitest.config.ts` | Vitest config |
| `packages/core/src/types.ts` | All shared TypeScript interfaces |
| `packages/core/src/db/client.ts` | DB singleton, WAL mode, sqlite-vec load, `setDb()` for tests |
| `packages/core/src/db/migrations.ts` | Full SQL schema + migration runner |
| `packages/core/src/config.ts` | Load `.fulcrum.json`, env-var overrides |
| `packages/core/src/tasks.ts` | `listTasks`, `createTask`, `updateTask` |
| `packages/core/src/runs.ts` | `startAgentRun`, `heartbeatAgentRun`, `getAgentRunStatus`, `completeAgentRun`, `blockAgentRun`, `escalateRun` |
| `packages/core/src/policy.ts` | `checkPolicy` — WIP limits, dependency checks |
| `packages/core/src/janitor.ts` | Heartbeat timeout detection, auto-escalation loop |
| `packages/core/src/memory.ts` | `writeMemory` (with dedup), `recallMemory` (FTS5 + vector merge + rerank) |
| `packages/core/src/embedding/types.ts` | `EmbeddingProvider`, `RerankerProvider` interfaces |
| `packages/core/src/embedding/local.ts` | Qwen3-Embedding-0.6B-ONNX via @huggingface/transformers |
| `packages/core/src/embedding/reranker.ts` | bge-reranker-v2-m3-ONNX |
| `packages/core/src/embedding/registry.ts` | Provider factory, warm-up at startup |
| `packages/core/src/status.ts` | `getWorkspaceStatus`, `buildCosContext`, `listAgentProfiles` |
| `packages/core/src/index.ts` | Re-export all public API |
| `packages/core/src/tests/helpers.ts` | Shared test DB setup |
| `packages/core/src/tests/tasks.test.ts` | Task function tests |
| `packages/core/src/tests/runs.test.ts` | Run lifecycle tests |
| `packages/core/src/tests/policy.test.ts` | Policy engine tests |
| `packages/core/src/tests/janitor.test.ts` | Janitor tests |
| `packages/core/src/tests/memory.test.ts` | Memory + dedup tests |
| `packages/core/src/tests/status.test.ts` | Status + CoS tests |

---

## Task 1: Monorepo scaffold

**Files:**
- Create: `pnpm-workspace.yaml`
- Modify: `package.json` (root)
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`

- [ ] **Step 1: Create `pnpm-workspace.yaml` at repo root**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 2: Update root `package.json`**

Replace existing root `package.json` with:

```json
{
  "name": "fulcrum",
  "version": "0.0.1",
  "private": true,
  "description": "Fulcrum — local-first agent control plane",
  "keywords": ["pi-package", "fulcrum", "agent-os", "multi-agent"],
  "author": "Fulcrum",
  "license": "MIT",
  "type": "module",
  "pi": {
    "extensions": ["./packages/extension/index.ts"]
  },
  "scripts": {
    "postinstall": "node scripts/postinstall.js",
    "test": "pnpm -r test",
    "build": "pnpm -r build"
  },
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-tui": "*"
  }
}
```

- [ ] **Step 3: Create `packages/core/package.json`**

```json
{
  "name": "@fulcrum/core",
  "version": "0.0.1",
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "better-sqlite3": "^9.4.3",
    "sqlite-vec": "^0.1.6",
    "@huggingface/transformers": "^3.0.0",
    "ulid": "^2.3.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8",
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  }
}
```

- [ ] **Step 4: Create `packages/core/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 5: Create `packages/core/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
  },
})
```

- [ ] **Step 6: Install dependencies**

```bash
cd /home/mkh/workspace/pi-stack-plan
pnpm install
```

Expected: pnpm installs all workspace packages without errors.

- [ ] **Step 7: Commit**

```bash
git add pnpm-workspace.yaml package.json packages/core/package.json packages/core/tsconfig.json packages/core/vitest.config.ts pnpm-lock.yaml
git commit -m "chore: scaffold @fulcrum/core pnpm workspace"
```

---

## Task 2: Domain types

**Files:**
- Create: `packages/core/src/types.ts`

- [ ] **Step 1: Create `packages/core/src/types.ts`**

```typescript
export type TaskStatus = 'queued' | 'in_progress' | 'completed' | 'blocked'
export type RunStatus = 'running' | 'completed' | 'blocked' | 'stale' | 'escalated'
export type AgentRole =
  | 'chief_of_staff'
  | 'implementer'
  | 'tester'
  | 'reviewer'
  | 'researcher'
  | 'planner'

export interface Task {
  task_id: string
  workspace_id: string
  project_id: string
  title: string
  description: string | null
  status: TaskStatus
  depends_on: string[]
  assigned_to: string | null
  note: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface RunArtifacts {
  files_changed?: string[]
  tests_passed?: number
  tests_failed?: number
  pr_url?: string
  notes?: string[]
}

export interface AgentRun {
  run_id: string
  task_id: string
  workspace_id: string
  role: AgentRole
  status: RunStatus
  current_step: string | null
  progress_pct: number
  output_summary: string | null
  artifacts: RunArtifacts | null
  git_branch: string | null
  git_commit: string | null
  version: number
  started_at: string
  updated_at: string
  completed_at: string | null
}

export interface Memory {
  memory_id: string
  workspace_id: string
  project_id: string
  content: string
  tags: string[]
  confidence: number
  created_at: string
  updated_at: string
  last_accessed_at: string
  access_count: number
}

export interface AgentProfile {
  role: AgentRole
  description: string
  can_create_teams: boolean
  can_dispatch_agents: boolean
}

export interface WorkspaceStatus {
  workspace_id: string
  running_runs: AgentRun[]
  blocked_runs: AgentRun[]
  stale_runs: AgentRun[]
  wip_count: number
  queued_tasks: number
  completed_tasks_today: number
}

export interface PolicyConfig {
  wip_limit: number
  wip_limit_per_role: Partial<Record<AgentRole, number>>
  heartbeat_timeout_minutes: number
  escalation_timeout_minutes: number
}

export interface EmbeddingProviderConfig {
  provider: 'local' | 'openai' | 'voyage' | 'cohere' | 'ollama' | 'jina' | 'custom'
  model: string
  apiKey?: string
  baseUrl?: string
  dimensions?: number
}

export interface FulcrumConfig {
  workspace_id: string
  project_id: string
  port: number
  embedding: {
    text: EmbeddingProviderConfig
    code: EmbeddingProviderConfig | null
  }
  reranker: EmbeddingProviderConfig
  policy: PolicyConfig
}

export interface PolicyCheckResult {
  allowed: boolean
  reason?: string
  current_wip?: number
  limit?: number
  blocking_tasks?: string[]
}

export class FulcrumError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'not_found'
      | 'version_conflict'
      | 'policy_blocked'
      | 'invalid_input'
  ) {
    super(message)
    this.name = 'FulcrumError'
  }
}
```

- [ ] **Step 2: Verify TypeScript accepts the types**

```bash
cd packages/core && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat(core): domain types — Task, AgentRun, Memory, config interfaces"
```

---

## Task 3: DB client

**Files:**
- Create: `packages/core/src/db/client.ts`

- [ ] **Step 1: Create `packages/core/src/db/client.ts`**

```typescript
import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { join } from 'path'

let _db: Database.Database | null = null

export function getDb(dataDir?: string): Database.Database {
  if (_db) return _db
  const dir = dataDir ?? join(process.cwd(), '.fulcrum')
  mkdirSync(dir, { recursive: true })
  const db = new Database(join(dir, 'fulcrum.db'))
  _configureDb(db)
  _db = db
  return db
}

/** Inject a pre-configured database — used in tests to pass :memory: instances */
export function setDb(db: Database.Database): void {
  _db = db
}

export function closeDb(): void {
  _db?.close()
  _db = null
}

export function _configureDb(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sqliteVec = require('sqlite-vec') as { load: (db: Database.Database) => void }
    sqliteVec.load(db)
  } catch {
    // sqlite-vec optional — vector search degrades to FTS5-only if unavailable
  }
}
```

- [ ] **Step 2: Create `packages/core/src/tests/helpers.ts`**

```typescript
import Database from 'better-sqlite3'
import { setDb, closeDb, _configureDb } from '../db/client.js'
import { runMigrations } from '../db/migrations.js'

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
```

Note: `runMigrations` is defined in Task 4. This file will not compile until Task 4 is complete.

- [ ] **Step 3: Write the DB client test**

Create `packages/core/src/tests/db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb, getDb, closeDb, _configureDb } from '../db/client.js'

describe('db client', () => {
  beforeEach(() => closeDb())
  afterEach(() => closeDb())

  it('returns the same instance on repeated calls', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    setDb(db)
    expect(getDb()).toBe(db)
    expect(getDb()).toBe(db)
  })

  it('has WAL mode enabled', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    setDb(db)
    const row = getDb().prepare('PRAGMA journal_mode').get() as { journal_mode: string }
    expect(row.journal_mode).toBe('wal')
  })

  it('has foreign keys enabled', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    setDb(db)
    const row = getDb().prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
    expect(row.foreign_keys).toBe(1)
  })

  it('returns null after closeDb', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    setDb(db)
    closeDb()
    // After close, getDb() would create a new file-backed db if called without setDb
    // Just verify closeDb doesn't throw
    expect(() => closeDb()).not.toThrow()
  })
})
```

- [ ] **Step 4: Run the test**

```bash
cd packages/core && pnpm test -- --reporter=verbose src/tests/db.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/db/client.ts packages/core/src/tests/db.test.ts packages/core/src/tests/helpers.ts
git commit -m "feat(core): db client with setDb injection for tests"
```

---

## Task 4: Schema + migrations

**Files:**
- Create: `packages/core/src/db/migrations.ts`

- [ ] **Step 1: Write the failing migration test**

Create `packages/core/src/tests/migrations.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { closeDb, _configureDb } from '../db/client.js'
import { runMigrations } from '../db/migrations.js'

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  return db
}

describe('runMigrations', () => {
  afterEach(() => closeDb())

  it('creates all required tables', () => {
    const db = freshDb()
    runMigrations(db)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[]
    const names = tables.map(t => t.name)
    expect(names).toContain('workspaces')
    expect(names).toContain('projects')
    expect(names).toContain('tasks')
    expect(names).toContain('agent_runs')
    expect(names).toContain('memories')
    expect(names).toContain('advisory_locks')
    expect(names).toContain('schema_migrations')
  })

  it('is idempotent — safe to run twice', () => {
    const db = freshDb()
    expect(() => runMigrations(db)).not.toThrow()
    expect(() => runMigrations(db)).not.toThrow()
  })

  it('tasks table has version and depends_on columns', () => {
    const db = freshDb()
    runMigrations(db)
    const cols = db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]
    const colNames = cols.map(c => c.name)
    expect(colNames).toContain('version')
    expect(colNames).toContain('depends_on')
  })

  it('agent_runs table has artifacts and git_branch columns', () => {
    const db = freshDb()
    runMigrations(db)
    const cols = db.prepare('PRAGMA table_info(agent_runs)').all() as { name: string }[]
    const colNames = cols.map(c => c.name)
    expect(colNames).toContain('artifacts')
    expect(colNames).toContain('git_branch')
    expect(colNames).toContain('git_commit')
    expect(colNames).toContain('events')
    expect(colNames).toContain('version')
  })

  it('memories table has confidence and access_count columns', () => {
    const db = freshDb()
    runMigrations(db)
    const cols = db.prepare('PRAGMA table_info(memories)').all() as { name: string }[]
    const colNames = cols.map(c => c.name)
    expect(colNames).toContain('confidence')
    expect(colNames).toContain('access_count')
    expect(colNames).toContain('last_accessed_at')
    expect(colNames).toContain('embedding')
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd packages/core && pnpm test -- src/tests/migrations.test.ts
```

Expected: FAIL — `Cannot find module '../db/migrations.js'`

- [ ] **Step 3: Create `packages/core/src/db/migrations.ts`**

```typescript
import type Database from 'better-sqlite3'

const MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workspaces (
  workspace_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','in_progress','completed','blocked')),
  depends_on TEXT NOT NULL DEFAULT '[]',
  assigned_to TEXT,
  note TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_runs (
  run_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  role TEXT NOT NULL
    CHECK(role IN ('chief_of_staff','implementer','tester','reviewer','researcher','planner')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','blocked','stale','escalated')),
  current_step TEXT,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  output_summary TEXT,
  artifacts TEXT,
  git_branch TEXT,
  git_commit TEXT,
  events TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS memories (
  memory_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 1.0,
  embedding BLOB,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
  access_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS advisory_locks (
  resource_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts
  USING fts5(title, description, content='tasks', content_rowid='rowid');

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts
  USING fts5(content, content='memories', content_rowid='rowid');

CREATE TRIGGER IF NOT EXISTS tasks_fts_insert AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(rowid, title, description)
    VALUES (new.rowid, new.title, new.description);
END;
CREATE TRIGGER IF NOT EXISTS tasks_fts_delete BEFORE DELETE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, description)
    VALUES ('delete', old.rowid, old.title, old.description);
END;
CREATE TRIGGER IF NOT EXISTS tasks_fts_update AFTER UPDATE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, description)
    VALUES ('delete', old.rowid, old.title, old.description);
  INSERT INTO tasks_fts(rowid, title, description)
    VALUES (new.rowid, new.title, new.description);
END;

CREATE TRIGGER IF NOT EXISTS memories_fts_insert AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER IF NOT EXISTS memories_fts_delete BEFORE DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content)
    VALUES ('delete', old.rowid, old.content);
END;
CREATE TRIGGER IF NOT EXISTS memories_fts_update AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content)
    VALUES ('delete', old.rowid, old.content);
  INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_runs_workspace ON agent_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_runs_task ON agent_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_updated ON agent_runs(updated_at);
CREATE INDEX IF NOT EXISTS idx_memories_workspace ON memories(workspace_id);
CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);
`

export function runMigrations(db: Database.Database): void {
  db.exec(MIGRATION_001)
  // Record migration if not already recorded
  db.prepare(`
    INSERT OR IGNORE INTO schema_migrations(name) VALUES ('001_initial')
  `).run()
}
```

- [ ] **Step 4: Run migration tests**

```bash
cd packages/core && pnpm test -- src/tests/migrations.test.ts
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/db/migrations.ts packages/core/src/tests/migrations.test.ts
git commit -m "feat(core): SQLite schema — all tables, FTS5, triggers, indexes"
```

---

## Task 5: Config loader

**Files:**
- Create: `packages/core/src/config.ts`

- [ ] **Step 1: Write the failing config test**

Create `packages/core/src/tests/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { loadConfig, defaultConfig } from '../config.js'

const TMP = '/tmp/fulcrum-test-config'

beforeEach(() => mkdirSync(TMP, { recursive: true }))
afterEach(() => rmSync(TMP, { recursive: true, force: true }))

describe('loadConfig', () => {
  it('returns defaults when no file exists', () => {
    const cfg = loadConfig(join(TMP, 'nonexistent'))
    expect(cfg.port).toBe(4721)
    expect(cfg.embedding.text.provider).toBe('local')
    expect(cfg.policy.wip_limit).toBe(5)
  })

  it('reads values from .fulcrum.json', () => {
    writeFileSync(
      join(TMP, '.fulcrum.json'),
      JSON.stringify({ workspace_id: 'ws_test', project_id: 'proj_test', port: 9999 })
    )
    const cfg = loadConfig(TMP)
    expect(cfg.workspace_id).toBe('ws_test')
    expect(cfg.project_id).toBe('proj_test')
    expect(cfg.port).toBe(9999)
  })

  it('env vars override file values', () => {
    writeFileSync(
      join(TMP, '.fulcrum.json'),
      JSON.stringify({ workspace_id: 'ws_file', project_id: 'proj_file', port: 4721 })
    )
    process.env.FULCRUM_WORKSPACE_ID = 'ws_env'
    process.env.FULCRUM_PORT = '5000'
    const cfg = loadConfig(TMP)
    expect(cfg.workspace_id).toBe('ws_env')
    expect(cfg.port).toBe(5000)
    delete process.env.FULCRUM_WORKSPACE_ID
    delete process.env.FULCRUM_PORT
  })

  it('merges partial policy config with defaults', () => {
    writeFileSync(
      join(TMP, '.fulcrum.json'),
      JSON.stringify({ workspace_id: 'ws_x', project_id: 'p_x', policy: { wip_limit: 10 } })
    )
    const cfg = loadConfig(TMP)
    expect(cfg.policy.wip_limit).toBe(10)
    expect(cfg.policy.heartbeat_timeout_minutes).toBe(10) // default preserved
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd packages/core && pnpm test -- src/tests/config.test.ts
```

Expected: FAIL — `Cannot find module '../config.js'`

- [ ] **Step 3: Create `packages/core/src/config.ts`**

```typescript
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { FulcrumConfig, PolicyConfig, EmbeddingProviderConfig } from './types.js'

const DEFAULT_TEXT_EMBEDDING: EmbeddingProviderConfig = {
  provider: 'local',
  model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
  dimensions: 1024,
}

const DEFAULT_RERANKER: EmbeddingProviderConfig = {
  provider: 'local',
  model: 'onnx-community/bge-reranker-v2-m3-ONNX',
}

const DEFAULT_POLICY: PolicyConfig = {
  wip_limit: 5,
  wip_limit_per_role: {},
  heartbeat_timeout_minutes: 10,
  escalation_timeout_minutes: 30,
}

export const defaultConfig: FulcrumConfig = {
  workspace_id: '',
  project_id: '',
  port: 4721,
  embedding: { text: DEFAULT_TEXT_EMBEDDING, code: null },
  reranker: DEFAULT_RERANKER,
  policy: DEFAULT_POLICY,
}

export function loadConfig(projectRoot?: string): FulcrumConfig {
  const root = projectRoot ?? process.cwd()
  const configPath = join(root, '.fulcrum.json')

  let fileConfig: Partial<FulcrumConfig> = {}
  if (existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(readFileSync(configPath, 'utf-8')) as Partial<FulcrumConfig>
    } catch {
      // Malformed config — proceed with defaults
    }
  }

  const merged: FulcrumConfig = {
    ...defaultConfig,
    ...fileConfig,
    embedding: {
      text: fileConfig.embedding?.text ?? DEFAULT_TEXT_EMBEDDING,
      code: fileConfig.embedding?.code ?? null,
    },
    reranker: fileConfig.reranker ?? DEFAULT_RERANKER,
    policy: {
      ...DEFAULT_POLICY,
      ...(fileConfig.policy ?? {}),
    },
  }

  // Env-var overrides
  if (process.env.FULCRUM_WORKSPACE_ID) merged.workspace_id = process.env.FULCRUM_WORKSPACE_ID
  if (process.env.FULCRUM_PROJECT_ID) merged.project_id = process.env.FULCRUM_PROJECT_ID
  if (process.env.FULCRUM_PORT) merged.port = parseInt(process.env.FULCRUM_PORT, 10)

  return merged
}
```

- [ ] **Step 4: Run config tests**

```bash
cd packages/core && pnpm test -- src/tests/config.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config.ts packages/core/src/tests/config.test.ts
git commit -m "feat(core): config loader — .fulcrum.json + env-var overrides"
```

---

## Task 6: Task functions

**Files:**
- Create: `packages/core/src/tasks.ts`
- Create: `packages/core/src/tests/tasks.test.ts`

- [ ] **Step 1: Write failing task tests**

Create `packages/core/src/tests/tasks.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { listTasks, createTask, updateTask } from '../tasks.js'

beforeEach(() => createTestDb())
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces VALUES ('ws_1','test ws', datetime('now'))").run()
  db.prepare("INSERT INTO projects VALUES ('proj_1','ws_1','test proj', datetime('now'))").run()
}

describe('createTask', () => {
  it('creates a task with queued status', async () => {
    seed()
    const task = await createTask({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Write tests',
    })
    expect(task.status).toBe('queued')
    expect(task.title).toBe('Write tests')
    expect(task.version).toBe(0)
    expect(task.depends_on).toEqual([])
    expect(task.task_id).toMatch(/^[0-9A-Z]{26}$/) // ULID
  })

  it('creates a task with dependencies', async () => {
    seed()
    const t1 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'A' })
    const t2 = await createTask({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'B',
      depends_on: [t1.task_id],
    })
    expect(t2.depends_on).toEqual([t1.task_id])
  })
})

describe('listTasks', () => {
  it('returns all tasks for a workspace', async () => {
    seed()
    await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T1' })
    await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T2' })
    const tasks = await listTasks({ workspace_id: 'ws_1' })
    expect(tasks).toHaveLength(2)
  })

  it('filters by status', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T1' })
    await updateTask({ task_id: t.task_id, status: 'completed' })
    const queued = await listTasks({ workspace_id: 'ws_1', status: 'queued' })
    const completed = await listTasks({ workspace_id: 'ws_1', status: 'completed' })
    expect(queued).toHaveLength(0)
    expect(completed).toHaveLength(1)
  })
})

describe('updateTask', () => {
  it('increments version on update', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    const updated = await updateTask({ task_id: t.task_id, note: 'working on it' })
    expect(updated.version).toBe(1)
    const again = await updateTask({ task_id: t.task_id, note: 'done' })
    expect(again.version).toBe(2)
  })

  it('throws version_conflict when expected_version mismatches', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    await updateTask({ task_id: t.task_id, note: 'first' }) // now version=1
    await expect(
      updateTask({ task_id: t.task_id, note: 'conflict', expected_version: 0 })
    ).rejects.toMatchObject({ code: 'version_conflict' })
  })

  it('throws not_found for unknown task_id', async () => {
    seed()
    await expect(
      updateTask({ task_id: 'NONEXISTENT', status: 'completed' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd packages/core && pnpm test -- src/tests/tasks.test.ts
```

Expected: FAIL — `Cannot find module '../tasks.js'`

- [ ] **Step 3: Create `packages/core/src/tasks.ts`**

```typescript
import { ulid } from 'ulid'
import { getDb } from './db/client.js'
import { FulcrumError } from './types.js'
import type { Task, TaskStatus } from './types.js'

interface ListTasksInput {
  workspace_id: string
  project_id?: string
  status?: TaskStatus
}

interface CreateTaskInput {
  workspace_id: string
  project_id: string
  title: string
  description?: string
  depends_on?: string[]
  assigned_to?: string
}

interface UpdateTaskInput {
  task_id: string
  status?: TaskStatus
  note?: string
  assigned_to?: string
  description?: string
  expected_version?: number
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    task_id: row.task_id as string,
    workspace_id: row.workspace_id as string,
    project_id: row.project_id as string,
    title: row.title as string,
    description: row.description as string | null,
    status: row.status as TaskStatus,
    depends_on: JSON.parse(row.depends_on as string) as string[],
    assigned_to: row.assigned_to as string | null,
    note: row.note as string | null,
    version: row.version as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

export async function listTasks(input: ListTasksInput): Promise<Task[]> {
  const db = getDb()
  let sql = 'SELECT * FROM tasks WHERE workspace_id = ?'
  const params: unknown[] = [input.workspace_id]
  if (input.project_id) { sql += ' AND project_id = ?'; params.push(input.project_id) }
  if (input.status) { sql += ' AND status = ?'; params.push(input.status) }
  sql += ' ORDER BY created_at ASC'
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  return rows.map(rowToTask)
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const db = getDb()
  const task_id = ulid()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO tasks (task_id, workspace_id, project_id, title, description, depends_on, assigned_to, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task_id,
    input.workspace_id,
    input.project_id,
    input.title,
    input.description ?? null,
    JSON.stringify(input.depends_on ?? []),
    input.assigned_to ?? null,
    now,
    now
  )
  return rowToTask(db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(task_id) as Record<string, unknown>)
}

export async function updateTask(input: UpdateTaskInput): Promise<Task> {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(input.task_id) as Record<string, unknown> | undefined
  if (!existing) throw new FulcrumError(`Task ${input.task_id} not found`, 'not_found')

  if (input.expected_version !== undefined && existing.version !== input.expected_version) {
    throw new FulcrumError(
      `Version conflict: expected ${input.expected_version}, got ${existing.version as number}`,
      'version_conflict'
    )
  }

  const fields: string[] = ['version = version + 1', "updated_at = ?"]
  const values: unknown[] = [new Date().toISOString()]
  if (input.status !== undefined) { fields.push('status = ?'); values.push(input.status) }
  if (input.note !== undefined) { fields.push('note = ?'); values.push(input.note) }
  if (input.assigned_to !== undefined) { fields.push('assigned_to = ?'); values.push(input.assigned_to) }
  if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description) }
  values.push(input.task_id)

  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE task_id = ?`).run(...values)
  return rowToTask(db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(input.task_id) as Record<string, unknown>)
}
```

- [ ] **Step 4: Run task tests**

```bash
cd packages/core && pnpm test -- src/tests/tasks.test.ts
```

Expected: 7 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tasks.ts packages/core/src/tests/tasks.test.ts
git commit -m "feat(core): listTasks, createTask, updateTask with optimistic locking"
```

---

## Task 7: Run lifecycle

**Files:**
- Create: `packages/core/src/runs.ts`
- Create: `packages/core/src/tests/runs.test.ts`

- [ ] **Step 1: Write failing run tests**

Create `packages/core/src/tests/runs.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { createTask } from '../tasks.js'
import {
  startAgentRun,
  heartbeatAgentRun,
  getAgentRunStatus,
  completeAgentRun,
  blockAgentRun,
  escalateRun,
} from '../runs.js'

beforeEach(() => createTestDb())
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces VALUES ('ws_1','test ws',datetime('now'))").run()
  db.prepare("INSERT INTO projects VALUES ('proj_1','ws_1','test proj',datetime('now'))").run()
}

async function seedTask() {
  seed()
  return createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'A task' })
}

describe('startAgentRun', () => {
  it('creates a running run and returns run_id', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer' })
    expect(run.status).toBe('running')
    expect(run.role).toBe('implementer')
    expect(run.run_id).toMatch(/^[0-9A-Z]{26}$/)
    expect(run.progress_pct).toBe(0)
  })

  it('captures git context (branch/commit may be null in test env)', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'tester' })
    // git_branch and git_commit are either strings or null — never undefined
    expect(run.git_branch === null || typeof run.git_branch === 'string').toBe(true)
    expect(run.git_commit === null || typeof run.git_commit === 'string').toBe(true)
  })
})

describe('heartbeatAgentRun', () => {
  it('updates current_step and progress_pct', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer' })
    await heartbeatAgentRun({ run_id: run.run_id, current_step: 'parsing files', progress_pct: 42 })
    const updated = await getAgentRunStatus({ run_id: run.run_id })
    expect(updated.current_step).toBe('parsing files')
    expect(updated.progress_pct).toBe(42)
  })
})

describe('completeAgentRun', () => {
  it('sets status to completed with summary and artifacts', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer' })
    const completed = await completeAgentRun({
      run_id: run.run_id,
      output_summary: 'Done!',
      artifacts: { files_changed: ['src/foo.ts'], tests_passed: 10 },
    })
    expect(completed.status).toBe('completed')
    expect(completed.output_summary).toBe('Done!')
    expect(completed.artifacts?.files_changed).toEqual(['src/foo.ts'])
    expect(completed.artifacts?.tests_passed).toBe(10)
    expect(completed.completed_at).toBeTruthy()
  })
})

describe('blockAgentRun', () => {
  it('sets status to blocked with reason in note', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'reviewer' })
    const blocked = await blockAgentRun({ run_id: run.run_id, reason: 'waiting for upstream merge' })
    expect(blocked.status).toBe('blocked')
    expect(blocked.output_summary).toBe('waiting for upstream merge')
  })
})

describe('escalateRun', () => {
  it('creates a chief_of_staff task and sets run to escalated', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer' })
    await blockAgentRun({ run_id: run.run_id, reason: 'stuck' })
    const cosTask = await escalateRun({ run_id: run.run_id, escalation_reason: 'blocked for too long' })
    expect(cosTask.title).toContain('Escalation')
    expect(cosTask.assigned_to).toBe('chief_of_staff')
    const escalated = await getAgentRunStatus({ run_id: run.run_id })
    expect(escalated.status).toBe('escalated')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd packages/core && pnpm test -- src/tests/runs.test.ts
```

Expected: FAIL — `Cannot find module '../runs.js'`

- [ ] **Step 3: Create `packages/core/src/runs.ts`**

```typescript
import { execSync } from 'child_process'
import { ulid } from 'ulid'
import { getDb } from './db/client.js'
import { createTask } from './tasks.js'
import { FulcrumError } from './types.js'
import type { AgentRun, AgentRole, RunStatus, RunArtifacts, Task } from './types.js'

interface StartRunInput {
  task_id: string
  workspace_id: string
  role: AgentRole
}
interface HeartbeatInput {
  run_id: string
  current_step: string
  progress_pct: number
}
interface GetStatusInput { run_id: string }
interface CompleteRunInput {
  run_id: string
  output_summary: string
  artifacts?: RunArtifacts
}
interface BlockRunInput { run_id: string; reason: string }
interface EscalateRunInput { run_id: string; escalation_reason: string }

function captureGitContext(): { git_branch: string | null; git_commit: string | null } {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
    const commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
    return { git_branch: branch === 'HEAD' ? null : branch, git_commit: commit }
  } catch {
    return { git_branch: null, git_commit: null }
  }
}

function rowToRun(row: Record<string, unknown>): AgentRun {
  return {
    run_id: row.run_id as string,
    task_id: row.task_id as string,
    workspace_id: row.workspace_id as string,
    role: row.role as AgentRole,
    status: row.status as RunStatus,
    current_step: row.current_step as string | null,
    progress_pct: row.progress_pct as number,
    output_summary: row.output_summary as string | null,
    artifacts: row.artifacts ? JSON.parse(row.artifacts as string) as RunArtifacts : null,
    git_branch: row.git_branch as string | null,
    git_commit: row.git_commit as string | null,
    version: row.version as number,
    started_at: row.started_at as string,
    updated_at: row.updated_at as string,
    completed_at: row.completed_at as string | null,
  }
}

function getRun(run_id: string): AgentRun {
  const db = getDb()
  const row = db.prepare('SELECT * FROM agent_runs WHERE run_id = ?').get(run_id) as Record<string, unknown> | undefined
  if (!row) throw new FulcrumError(`Run ${run_id} not found`, 'not_found')
  return rowToRun(row)
}

export async function startAgentRun(input: StartRunInput): Promise<AgentRun> {
  const db = getDb()
  const run_id = ulid()
  const now = new Date().toISOString()
  const { git_branch, git_commit } = captureGitContext()
  db.prepare(`
    INSERT INTO agent_runs
      (run_id, task_id, workspace_id, role, git_branch, git_commit, started_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(run_id, input.task_id, input.workspace_id, input.role, git_branch, git_commit, now, now)
  return getRun(run_id)
}

export async function heartbeatAgentRun(input: HeartbeatInput): Promise<void> {
  const db = getDb()
  db.prepare(`
    UPDATE agent_runs
    SET current_step = ?, progress_pct = ?, updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(input.current_step, input.progress_pct, new Date().toISOString(), input.run_id)
}

export async function getAgentRunStatus(input: GetStatusInput): Promise<AgentRun> {
  return getRun(input.run_id)
}

export async function completeAgentRun(input: CompleteRunInput): Promise<AgentRun> {
  const db = getDb()
  const now = new Date().toISOString()
  db.prepare(`
    UPDATE agent_runs
    SET status = 'completed', output_summary = ?, artifacts = ?,
        completed_at = ?, updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(
    input.output_summary,
    input.artifacts ? JSON.stringify(input.artifacts) : null,
    now, now, input.run_id
  )
  return getRun(input.run_id)
}

export async function blockAgentRun(input: BlockRunInput): Promise<AgentRun> {
  const db = getDb()
  db.prepare(`
    UPDATE agent_runs
    SET status = 'blocked', output_summary = ?, updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(input.reason, new Date().toISOString(), input.run_id)
  return getRun(input.run_id)
}

export async function escalateRun(input: EscalateRunInput): Promise<Task> {
  const db = getDb()
  const run = getRun(input.run_id)

  // Mark run as escalated
  db.prepare(`
    UPDATE agent_runs SET status = 'escalated', updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(new Date().toISOString(), input.run_id)

  // Get the original task to find workspace + project
  const taskRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?')
    .get(run.task_id) as Record<string, unknown>

  // Create a chief_of_staff escalation task
  return createTask({
    workspace_id: run.workspace_id,
    project_id: taskRow.project_id as string,
    title: `Escalation: ${taskRow.title as string} (run ${run.run_id})`,
    description: `Run ${run.run_id} (role: ${run.role}) was escalated.\n\nReason: ${input.escalation_reason}`,
    assigned_to: 'chief_of_staff',
  })
}
```

- [ ] **Step 4: Run run tests**

```bash
cd packages/core && pnpm test -- src/tests/runs.test.ts
```

Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/runs.ts packages/core/src/tests/runs.test.ts
git commit -m "feat(core): agent run lifecycle — start, heartbeat, status, complete, block, escalate"
```

---

## Task 8: Policy engine

**Files:**
- Create: `packages/core/src/policy.ts`
- Create: `packages/core/src/tests/policy.test.ts`

- [ ] **Step 1: Write failing policy tests**

Create `packages/core/src/tests/policy.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { createTask } from '../tasks.js'
import { startAgentRun } from '../runs.js'
import { checkPolicy } from '../policy.js'
import type { PolicyConfig } from '../types.js'

beforeEach(() => createTestDb())
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces VALUES ('ws_1','test',datetime('now'))").run()
  db.prepare("INSERT INTO projects VALUES ('proj_1','ws_1','test',datetime('now'))").run()
}

const defaultPolicy: PolicyConfig = {
  wip_limit: 2,
  wip_limit_per_role: { implementer: 1 },
  heartbeat_timeout_minutes: 10,
  escalation_timeout_minutes: 30,
}

describe('checkPolicy — WIP limits', () => {
  it('allows a run when under global WIP limit', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    const result = await checkPolicy({
      workspace_id: 'ws_1',
      task_id: t.task_id,
      role: 'implementer',
      policy: defaultPolicy,
    })
    expect(result.allowed).toBe(true)
  })

  it('blocks when global WIP limit is reached', async () => {
    seed()
    const t1 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T1' })
    const t2 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T2' })
    const t3 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T3' })
    await startAgentRun({ task_id: t1.task_id, workspace_id: 'ws_1', role: 'tester' })
    await startAgentRun({ task_id: t2.task_id, workspace_id: 'ws_1', role: 'reviewer' })
    const result = await checkPolicy({
      workspace_id: 'ws_1',
      task_id: t3.task_id,
      role: 'tester',
      policy: defaultPolicy,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('wip_limit_exceeded')
    expect(result.current_wip).toBe(2)
    expect(result.limit).toBe(2)
  })

  it('blocks when per-role WIP limit is reached', async () => {
    seed()
    const t1 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T1' })
    const t2 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T2' })
    await startAgentRun({ task_id: t1.task_id, workspace_id: 'ws_1', role: 'implementer' })
    const result = await checkPolicy({
      workspace_id: 'ws_1',
      task_id: t2.task_id,
      role: 'implementer',
      policy: defaultPolicy,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('wip_limit_exceeded')
  })
})

describe('checkPolicy — task dependencies', () => {
  it('blocks when a dependency is not completed', async () => {
    seed()
    const dep = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Dep' })
    const child = await createTask({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Child',
      depends_on: [dep.task_id],
    })
    const result = await checkPolicy({
      workspace_id: 'ws_1',
      task_id: child.task_id,
      role: 'implementer',
      policy: defaultPolicy,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('dependencies_incomplete')
    expect(result.blocking_tasks).toContain(dep.task_id)
  })

  it('allows when all dependencies are completed', async () => {
    seed()
    const dep = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Dep' })
    const { updateTask } = await import('../tasks.js')
    await updateTask({ task_id: dep.task_id, status: 'completed' })
    const child = await createTask({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Child',
      depends_on: [dep.task_id],
    })
    const result = await checkPolicy({
      workspace_id: 'ws_1',
      task_id: child.task_id,
      role: 'implementer',
      policy: defaultPolicy,
    })
    expect(result.allowed).toBe(true)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd packages/core && pnpm test -- src/tests/policy.test.ts
```

Expected: FAIL — `Cannot find module '../policy.js'`

- [ ] **Step 3: Create `packages/core/src/policy.ts`**

```typescript
import { getDb } from './db/client.js'
import type { AgentRole, PolicyConfig, PolicyCheckResult } from './types.js'

interface CheckPolicyInput {
  workspace_id: string
  task_id: string
  role: AgentRole
  policy: PolicyConfig
}

export async function checkPolicy(input: CheckPolicyInput): Promise<PolicyCheckResult> {
  const db = getDb()

  // Check dependency completion
  const taskRow = db.prepare('SELECT depends_on FROM tasks WHERE task_id = ?')
    .get(input.task_id) as { depends_on: string } | undefined
  if (taskRow) {
    const deps = JSON.parse(taskRow.depends_on) as string[]
    if (deps.length > 0) {
      const placeholders = deps.map(() => '?').join(',')
      const incomplete = db.prepare(
        `SELECT task_id FROM tasks WHERE task_id IN (${placeholders}) AND status != 'completed'`
      ).all(...deps) as { task_id: string }[]
      if (incomplete.length > 0) {
        return {
          allowed: false,
          reason: 'dependencies_incomplete',
          blocking_tasks: incomplete.map(r => r.task_id),
        }
      }
    }
  }

  // Check per-role WIP limit
  const roleLimit = input.policy.wip_limit_per_role[input.role]
  if (roleLimit !== undefined) {
    const roleCount = (db.prepare(
      "SELECT COUNT(*) as c FROM agent_runs WHERE workspace_id = ? AND role = ? AND status = 'running'"
    ).get(input.workspace_id, input.role) as { c: number }).c
    if (roleCount >= roleLimit) {
      return { allowed: false, reason: 'wip_limit_exceeded', current_wip: roleCount, limit: roleLimit }
    }
  }

  // Check global WIP limit
  const globalCount = (db.prepare(
    "SELECT COUNT(*) as c FROM agent_runs WHERE workspace_id = ? AND status = 'running'"
  ).get(input.workspace_id) as { c: number }).c
  if (globalCount >= input.policy.wip_limit) {
    return { allowed: false, reason: 'wip_limit_exceeded', current_wip: globalCount, limit: input.policy.wip_limit }
  }

  return { allowed: true }
}
```

- [ ] **Step 4: Run policy tests**

```bash
cd packages/core && pnpm test -- src/tests/policy.test.ts
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/policy.ts packages/core/src/tests/policy.test.ts
git commit -m "feat(core): policy engine — WIP limits, per-role limits, dependency checks"
```

---

## Task 9: Janitor

**Files:**
- Create: `packages/core/src/janitor.ts`
- Create: `packages/core/src/tests/janitor.test.ts`

- [ ] **Step 1: Write failing janitor tests**

Create `packages/core/src/tests/janitor.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { createTask } from '../tasks.js'
import { startAgentRun, blockAgentRun } from '../runs.js'
import { runJanitorCycle } from '../janitor.js'
import type { PolicyConfig } from '../types.js'

beforeEach(() => createTestDb())
afterEach(() => resetTestDb())

const policy: PolicyConfig = {
  wip_limit: 10,
  wip_limit_per_role: {},
  heartbeat_timeout_minutes: 0, // 0 = mark stale immediately in tests
  escalation_timeout_minutes: 0, // 0 = escalate immediately in tests
}

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces VALUES ('ws_1','test',datetime('now'))").run()
  db.prepare("INSERT INTO projects VALUES ('proj_1','ws_1','test',datetime('now'))").run()
}

describe('runJanitorCycle', () => {
  it('marks running runs stale when heartbeat timeout exceeded', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    const run = await startAgentRun({ task_id: t.task_id, workspace_id: 'ws_1', role: 'implementer' })

    // Backdating updated_at to simulate timeout
    const db = getDb()
    db.prepare("UPDATE agent_runs SET updated_at = datetime('now', '-60 minutes') WHERE run_id = ?").run(run.run_id)

    await runJanitorCycle({ workspace_id: 'ws_1', policy })

    const updated = db.prepare('SELECT status FROM agent_runs WHERE run_id = ?').get(run.run_id) as { status: string }
    expect(updated.status).toBe('stale')
  })

  it('auto-escalates blocked runs past escalation timeout', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    const run = await startAgentRun({ task_id: t.task_id, workspace_id: 'ws_1', role: 'implementer' })
    await blockAgentRun({ run_id: run.run_id, reason: 'stuck' })

    const db = getDb()
    db.prepare("UPDATE agent_runs SET updated_at = datetime('now', '-120 minutes') WHERE run_id = ?").run(run.run_id)

    await runJanitorCycle({ workspace_id: 'ws_1', policy })

    const updated = db.prepare('SELECT status FROM agent_runs WHERE run_id = ?').get(run.run_id) as { status: string }
    expect(updated.status).toBe('escalated')

    // Should have created a CoS task
    const cosTasks = db.prepare("SELECT * FROM tasks WHERE assigned_to = 'chief_of_staff'").all()
    expect(cosTasks.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd packages/core && pnpm test -- src/tests/janitor.test.ts
```

Expected: FAIL — `Cannot find module '../janitor.js'`

- [ ] **Step 3: Create `packages/core/src/janitor.ts`**

```typescript
import { getDb } from './db/client.js'
import { escalateRun } from './runs.js'
import type { PolicyConfig } from './types.js'

interface JanitorCycleInput {
  workspace_id: string
  policy: PolicyConfig
}

export async function runJanitorCycle(input: JanitorCycleInput): Promise<void> {
  const db = getDb()
  const { heartbeat_timeout_minutes, escalation_timeout_minutes } = input.policy

  // Mark running runs stale when no heartbeat received within timeout
  db.prepare(`
    UPDATE agent_runs
    SET status = 'stale', updated_at = datetime('now')
    WHERE workspace_id = ?
      AND status = 'running'
      AND updated_at <= datetime('now', ? || ' minutes')
  `).run(input.workspace_id, `-${heartbeat_timeout_minutes}`)

  // Auto-escalate blocked runs past escalation timeout
  const overdueBlocked = db.prepare(`
    SELECT run_id FROM agent_runs
    WHERE workspace_id = ?
      AND status = 'blocked'
      AND updated_at <= datetime('now', ? || ' minutes')
  `).all(input.workspace_id, `-${escalation_timeout_minutes}`) as { run_id: string }[]

  for (const { run_id } of overdueBlocked) {
    await escalateRun({
      run_id,
      escalation_reason: `Auto-escalated by janitor: blocked for more than ${escalation_timeout_minutes} minutes`,
    })
  }
}

/** Start a background janitor loop. Returns a stop function. */
export function startJanitor(workspace_id: string, policy: PolicyConfig, intervalMs = 60_000): () => void {
  const timer = setInterval(() => {
    void runJanitorCycle({ workspace_id, policy }).catch(console.error)
  }, intervalMs)
  return () => clearInterval(timer)
}
```

- [ ] **Step 4: Run janitor tests**

```bash
cd packages/core && pnpm test -- src/tests/janitor.test.ts
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/janitor.ts packages/core/src/tests/janitor.test.ts
git commit -m "feat(core): janitor — stale run detection, auto-escalation, background loop"
```

---

## Task 10: Memory functions

**Files:**
- Create: `packages/core/src/memory.ts`
- Create: `packages/core/src/tests/memory.test.ts`

- [ ] **Step 1: Write failing memory tests**

Create `packages/core/src/tests/memory.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { writeMemory, recallMemory } from '../memory.js'

beforeEach(() => createTestDb())
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces VALUES ('ws_1','test',datetime('now'))").run()
  db.prepare("INSERT INTO projects VALUES ('proj_1','ws_1','test',datetime('now'))").run()
}

describe('writeMemory', () => {
  it('persists a memory and returns it', async () => {
    seed()
    const m = await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      content: 'We chose SQLite over Postgres because local-first is the priority',
      tags: ['architecture', 'database'],
    })
    expect(m.memory_id).toMatch(/^[0-9A-Z]{26}$/)
    expect(m.content).toBe('We chose SQLite over Postgres because local-first is the priority')
    expect(m.tags).toEqual(['architecture', 'database'])
    expect(m.confidence).toBe(1.0)
    expect(m.access_count).toBe(0)
  })

  it('deduplicates: updates existing memory when content is near-identical', async () => {
    seed()
    await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      content: 'SQLite is used for local-first storage',
    })
    await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      content: 'SQLite is used for local-first storage', // exact duplicate
    })
    const db = getDb()
    const count = (db.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }).c
    expect(count).toBe(1) // should deduplicate
  })
})

describe('recallMemory', () => {
  it('returns memories matching a query via FTS5', async () => {
    seed()
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'SQLite is the database' })
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'pnpm manages the workspace' })
    const results = await recallMemory({ workspace_id: 'ws_1', project_id: 'proj_1', query: 'database', limit: 5 })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].content).toContain('SQLite')
  })

  it('increments access_count on recall', async () => {
    seed()
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'important decision' })
    await recallMemory({ workspace_id: 'ws_1', project_id: 'proj_1', query: 'important', limit: 5 })
    const db = getDb()
    const m = db.prepare('SELECT access_count FROM memories').get() as { access_count: number }
    expect(m.access_count).toBe(1)
  })

  it('returns empty array for no matches', async () => {
    seed()
    const results = await recallMemory({ workspace_id: 'ws_1', project_id: 'proj_1', query: 'zzznomatch', limit: 5 })
    expect(results).toEqual([])
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd packages/core && pnpm test -- src/tests/memory.test.ts
```

Expected: FAIL — `Cannot find module '../memory.js'`

- [ ] **Step 3: Create `packages/core/src/memory.ts`**

```typescript
import { ulid } from 'ulid'
import { getDb } from './db/client.js'
import type { Memory } from './types.js'

interface WriteMemoryInput {
  workspace_id: string
  project_id: string
  content: string
  tags?: string[]
  confidence?: number
  embedding?: Float32Array
}

interface RecallMemoryInput {
  workspace_id: string
  project_id: string
  query: string
  limit?: number
}

function rowToMemory(row: Record<string, unknown>): Memory {
  return {
    memory_id: row.memory_id as string,
    workspace_id: row.workspace_id as string,
    project_id: row.project_id as string,
    content: row.content as string,
    tags: JSON.parse(row.tags as string) as string[],
    confidence: row.confidence as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    last_accessed_at: row.last_accessed_at as string,
    access_count: row.access_count as number,
  }
}

/** Cosine similarity between two Float32Arrays */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

export async function writeMemory(input: WriteMemoryInput): Promise<Memory> {
  const db = getDb()
  const now = new Date().toISOString()

  // Deduplication: check exact content match first (fast path)
  if (!input.embedding) {
    const existing = db.prepare(
      'SELECT * FROM memories WHERE workspace_id = ? AND project_id = ? AND content = ?'
    ).get(input.workspace_id, input.project_id, input.content) as Record<string, unknown> | undefined

    if (existing) {
      db.prepare(
        'UPDATE memories SET confidence = ?, updated_at = ?, access_count = access_count + 1 WHERE memory_id = ?'
      ).run(input.confidence ?? 1.0, now, existing.memory_id)
      return rowToMemory(
        db.prepare('SELECT * FROM memories WHERE memory_id = ?').get(existing.memory_id) as Record<string, unknown>
      )
    }
  }

  // Embedding-based deduplication (when embedding provided)
  if (input.embedding) {
    const candidates = db.prepare(
      'SELECT *, embedding FROM memories WHERE workspace_id = ? AND project_id = ? AND embedding IS NOT NULL'
    ).all(input.workspace_id, input.project_id) as (Record<string, unknown> & { embedding: Buffer })[]

    for (const candidate of candidates) {
      const existing = new Float32Array(candidate.embedding.buffer, candidate.embedding.byteOffset, candidate.embedding.byteLength / 4)
      if (cosineSimilarity(input.embedding, existing) > 0.9) {
        db.prepare(
          'UPDATE memories SET content = ?, confidence = ?, embedding = ?, updated_at = ? WHERE memory_id = ?'
        ).run(input.content, input.confidence ?? 1.0, Buffer.from(input.embedding.buffer), now, candidate.memory_id)
        return rowToMemory(
          db.prepare('SELECT * FROM memories WHERE memory_id = ?').get(candidate.memory_id) as Record<string, unknown>
        )
      }
    }
  }

  // Insert new memory
  const memory_id = ulid()
  const embeddingBuffer = input.embedding ? Buffer.from(input.embedding.buffer) : null
  db.prepare(`
    INSERT INTO memories
      (memory_id, workspace_id, project_id, content, tags, confidence, embedding, created_at, updated_at, last_accessed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    memory_id,
    input.workspace_id,
    input.project_id,
    input.content,
    JSON.stringify(input.tags ?? []),
    input.confidence ?? 1.0,
    embeddingBuffer,
    now, now, now
  )
  return rowToMemory(db.prepare('SELECT * FROM memories WHERE memory_id = ?').get(memory_id) as Record<string, unknown>)
}

export async function recallMemory(input: RecallMemoryInput): Promise<Memory[]> {
  const db = getDb()
  const limit = input.limit ?? 5

  // FTS5 search
  let ftsRows: { rowid: number; rank: number }[] = []
  try {
    ftsRows = db.prepare(
      'SELECT rowid, rank FROM memories_fts WHERE content MATCH ? ORDER BY rank LIMIT ?'
    ).all(input.query, limit * 3) as { rowid: number; rank: number }[]
  } catch {
    // FTS5 query syntax error — fall back to LIKE
    const likeRows = db.prepare(
      'SELECT rowid FROM memories WHERE workspace_id = ? AND project_id = ? AND content LIKE ? LIMIT ?'
    ).all(input.workspace_id, input.project_id, `%${input.query}%`, limit) as { rowid: number }[]
    ftsRows = likeRows.map(r => ({ rowid: r.rowid, rank: 0 }))
  }

  if (ftsRows.length === 0) return []

  const rowids = ftsRows.map(r => r.rowid)
  const placeholders = rowids.map(() => '?').join(',')
  const rows = db.prepare(
    `SELECT * FROM memories WHERE rowid IN (${placeholders}) AND workspace_id = ? AND project_id = ?`
  ).all(...rowids, input.workspace_id, input.project_id) as Record<string, unknown>[]

  if (rows.length === 0) return []

  // Update access tracking
  const now = new Date().toISOString()
  const idPlaceholders = rows.map(() => '?').join(',')
  db.prepare(
    `UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE memory_id IN (${idPlaceholders})`
  ).run(now, ...rows.map(r => r.memory_id))

  return rows.slice(0, limit).map(rowToMemory)
}
```

- [ ] **Step 4: Run memory tests**

```bash
cd packages/core && pnpm test -- src/tests/memory.test.ts
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/memory.ts packages/core/src/tests/memory.test.ts
git commit -m "feat(core): writeMemory with dedup, recallMemory with FTS5 + access tracking"
```

---

## Task 11: Embedding provider + local Qwen3

**Files:**
- Create: `packages/core/src/embedding/types.ts`
- Create: `packages/core/src/embedding/local.ts`
- Create: `packages/core/src/embedding/reranker.ts`
- Create: `packages/core/src/embedding/registry.ts`

- [ ] **Step 1: Create `packages/core/src/embedding/types.ts`**

```typescript
export interface EmbeddingProvider {
  embed(text: string): Promise<Float32Array>
  embedBatch(texts: string[]): Promise<Float32Array[]>
  dimensions: number
  warmUp(): Promise<void>
}

export interface RerankerProvider {
  rerank(query: string, passages: string[]): Promise<number[]>
  warmUp(): Promise<void>
}
```

- [ ] **Step 2: Write embedding provider test**

Create `packages/core/src/tests/embedding.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { LocalEmbeddingProvider } from '../embedding/local.js'

// NOTE: this test downloads a model on first run (~300MB). It is skipped in CI
// unless FULCRUM_EMBEDDING_TESTS=1 is set.
const RUN = process.env.FULCRUM_EMBEDDING_TESTS === '1'

describe.skipIf(!RUN)('LocalEmbeddingProvider', () => {
  it('returns a Float32Array of correct dimensions', async () => {
    const provider = new LocalEmbeddingProvider({
      provider: 'local',
      model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
      dimensions: 1024,
    })
    await provider.warmUp()
    const embedding = await provider.embed('hello world')
    expect(embedding).toBeInstanceOf(Float32Array)
    expect(embedding.length).toBe(1024)
  }, 60_000)

  it('similar texts have higher cosine similarity than dissimilar', async () => {
    const provider = new LocalEmbeddingProvider({
      provider: 'local',
      model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
      dimensions: 1024,
    })
    await provider.warmUp()
    const a = await provider.embed('the dog sat on the mat')
    const b = await provider.embed('a canine rested on a rug')
    const c = await provider.embed('quantum entanglement in superconductors')
    const simAB = cosineSim(a, b)
    const simAC = cosineSim(a, c)
    expect(simAB).toBeGreaterThan(simAC)
  }, 60_000)
})

function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i] }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}
```

- [ ] **Step 3: Create `packages/core/src/embedding/local.ts`**

```typescript
import type { EmbeddingProvider } from './types.js'
import type { EmbeddingProviderConfig } from '../types.js'

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number
  private model: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pipeline: any = null

  constructor(config: EmbeddingProviderConfig) {
    this.model = config.model
    this.dimensions = config.dimensions ?? 1024
  }

  async warmUp(): Promise<void> {
    if (this.pipeline) return
    const { pipeline, env } = await import('@huggingface/transformers')
    env.cacheDir = './.fulcrum/models'
    this.pipeline = await pipeline('feature-extraction', this.model, { dtype: 'q8' })
  }

  async embed(text: string): Promise<Float32Array> {
    await this.warmUp()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const output = await this.pipeline(text, { normalize: true, pooling: 'mean' }) as { data: Float32Array }
    return output.data
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map(t => this.embed(t)))
  }
}
```

- [ ] **Step 4: Create `packages/core/src/embedding/reranker.ts`**

```typescript
import type { RerankerProvider } from './types.js'
import type { EmbeddingProviderConfig } from '../types.js'

export class LocalRerankerProvider implements RerankerProvider {
  private model: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tokenizer: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rankerModel: any = null

  constructor(config: EmbeddingProviderConfig) {
    this.model = config.model
  }

  async warmUp(): Promise<void> {
    if (this.tokenizer) return
    const { AutoTokenizer, AutoModelForSequenceClassification, env } = await import('@huggingface/transformers')
    env.cacheDir = './.fulcrum/models'
    this.tokenizer = await AutoTokenizer.from_pretrained(this.model)
    this.rankerModel = await AutoModelForSequenceClassification.from_pretrained(this.model, { dtype: 'q8' })
  }

  async rerank(query: string, passages: string[]): Promise<number[]> {
    await this.warmUp()
    const pairs = passages.map(p => [query, p])
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const inputs = await this.tokenizer(pairs, { padding: true, truncation: true, return_tensors: 'pt' })
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const { logits } = await this.rankerModel(inputs) as { logits: { data: Float32Array } }
    return Array.from(logits.data)
  }
}
```

- [ ] **Step 5: Create `packages/core/src/embedding/registry.ts`**

```typescript
import type { EmbeddingProvider, RerankerProvider } from './types.js'
import { LocalEmbeddingProvider } from './local.js'
import { LocalRerankerProvider } from './reranker.js'
import type { FulcrumConfig } from '../types.js'

let textProvider: EmbeddingProvider | null = null
let codeProvider: EmbeddingProvider | null = null
let rerankerProvider: RerankerProvider | null = null

export async function initEmbedding(config: FulcrumConfig): Promise<void> {
  if (config.embedding.text.provider === 'local') {
    textProvider = new LocalEmbeddingProvider(config.embedding.text)
  }
  if (config.embedding.code && config.embedding.code.provider === 'local') {
    codeProvider = new LocalEmbeddingProvider(config.embedding.code)
  }
  if (config.reranker.provider === 'local') {
    rerankerProvider = new LocalRerankerProvider(config.reranker)
  }
  // Warm up in parallel (downloads models if not cached)
  await Promise.all([
    textProvider?.warmUp(),
    codeProvider?.warmUp(),
    rerankerProvider?.warmUp(),
  ])
}

export function getTextEmbedder(): EmbeddingProvider | null { return textProvider }
export function getCodeEmbedder(): EmbeddingProvider | null { return codeProvider ?? textProvider }
export function getReranker(): RerankerProvider | null { return rerankerProvider }

/** For tests — reset providers */
export function resetProviders(): void {
  textProvider = null; codeProvider = null; rerankerProvider = null
}
```

- [ ] **Step 6: Run embedding tests (local model tests skipped by default)**

```bash
cd packages/core && pnpm test -- src/tests/embedding.test.ts
```

Expected: 0 failing (tests skipped unless `FULCRUM_EMBEDDING_TESTS=1`).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/embedding/
git commit -m "feat(core): embedding providers — Qwen3 local embedder, bge reranker, registry"
```

---

## Task 12: Hybrid recall + status functions

**Files:**
- Modify: `packages/core/src/memory.ts`
- Create: `packages/core/src/status.ts`
- Create: `packages/core/src/tests/status.test.ts`

- [ ] **Step 1: Add vector + rerank path to `recallMemory` in `packages/core/src/memory.ts`**

Add this import at the top of `memory.ts`:

```typescript
import { getTextEmbedder, getReranker } from './embedding/registry.js'
```

Replace the `recallMemory` function body with:

```typescript
export async function recallMemory(input: RecallMemoryInput): Promise<Memory[]> {
  const db = getDb()
  const limit = input.limit ?? 5
  const candidates = new Map<string, { memory: Memory; score: number }>()

  // --- FTS5 lexical search ---
  let ftsRows: { rowid: number; rank: number }[] = []
  try {
    ftsRows = db.prepare(
      'SELECT rowid, rank FROM memories_fts WHERE content MATCH ? ORDER BY rank LIMIT ?'
    ).all(input.query, limit * 3) as { rowid: number; rank: number }[]
  } catch {
    const likeRows = db.prepare(
      'SELECT rowid FROM memories WHERE workspace_id = ? AND project_id = ? AND content LIKE ? LIMIT ?'
    ).all(input.workspace_id, input.project_id, `%${input.query}%`, limit) as { rowid: number }[]
    ftsRows = likeRows.map(r => ({ rowid: r.rowid, rank: 0 }))
  }

  if (ftsRows.length > 0) {
    const rowids = ftsRows.map(r => r.rowid)
    const placeholders = rowids.map(() => '?').join(',')
    const rows = db.prepare(
      `SELECT * FROM memories WHERE rowid IN (${placeholders}) AND workspace_id = ? AND project_id = ?`
    ).all(...rowids, input.workspace_id, input.project_id) as Record<string, unknown>[]
    for (const row of rows) {
      const fts = ftsRows.find(f => f.rowid === (row as { rowid: number }).rowid)
      candidates.set(row.memory_id as string, { memory: rowToMemory(row), score: fts ? Math.abs(fts.rank) : 0 })
    }
  }

  // --- Vector ANN search (when embedding available) ---
  const embedder = getTextEmbedder()
  if (embedder) {
    try {
      const queryVec = await embedder.embed(input.query)
      const vecRows = db.prepare(
        'SELECT rowid, distance FROM vec_memories WHERE embedding MATCH ? ORDER BY distance LIMIT ?'
      ).all(Buffer.from(queryVec.buffer), limit * 3) as { rowid: number; distance: number }[]

      if (vecRows.length > 0) {
        const rowids = vecRows.map(r => r.rowid)
        const placeholders = rowids.map(() => '?').join(',')
        const rows = db.prepare(
          `SELECT * FROM memories WHERE rowid IN (${placeholders}) AND workspace_id = ? AND project_id = ?`
        ).all(...rowids, input.workspace_id, input.project_id) as Record<string, unknown>[]
        for (const row of rows) {
          const vec = vecRows.find(v => v.rowid === (row as { rowid: number }).rowid)
          const vecScore = vec ? 1 / (1 + vec.distance) : 0
          const existing = candidates.get(row.memory_id as string)
          if (existing) {
            existing.score = (existing.score + vecScore) / 2
          } else {
            candidates.set(row.memory_id as string, { memory: rowToMemory(row), score: vecScore })
          }
        }
      }
    } catch {
      // vec_memories table not available — FTS5 results only
    }
  }

  if (candidates.size === 0) return []

  // Sort by merged score, take top N * 2 for reranking
  let sorted = [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, limit * 2)

  // --- Reranker ---
  const reranker = getReranker()
  if (reranker && sorted.length > 1) {
    try {
      const passages = sorted.map(c => c.memory.content)
      const scores = await reranker.rerank(input.query, passages)
      sorted = sorted.map((c, i) => ({ ...c, score: scores[i] ?? c.score }))
        .sort((a, b) => b.score - a.score)
    } catch {
      // Reranker unavailable — use merged scores
    }
  }

  const top = sorted.slice(0, limit).map(c => c.memory)

  // Update access tracking
  const now = new Date().toISOString()
  const ids = top.map(m => m.memory_id)
  const idPlaceholders = ids.map(() => '?').join(',')
  db.prepare(
    `UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE memory_id IN (${idPlaceholders})`
  ).run(now, ...ids)

  return top
}
```

- [ ] **Step 2: Run memory tests to ensure FTS5 path still passes**

```bash
cd packages/core && pnpm test -- src/tests/memory.test.ts
```

Expected: 5 passing.

- [ ] **Step 3: Write failing status tests**

Create `packages/core/src/tests/status.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { createTask } from '../tasks.js'
import { startAgentRun, completeAgentRun, blockAgentRun } from '../runs.js'
import { getWorkspaceStatus, buildCosContext, listAgentProfiles } from '../status.js'

beforeEach(() => createTestDb())
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces VALUES ('ws_1','test',datetime('now'))").run()
  db.prepare("INSERT INTO projects VALUES ('proj_1','ws_1','test',datetime('now'))").run()
}

describe('getWorkspaceStatus', () => {
  it('returns correct counts', async () => {
    seed()
    const t1 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T1' })
    const t2 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T2' })
    await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T3' })
    const run1 = await startAgentRun({ task_id: t1.task_id, workspace_id: 'ws_1', role: 'implementer' })
    const run2 = await startAgentRun({ task_id: t2.task_id, workspace_id: 'ws_1', role: 'tester' })
    await blockAgentRun({ run_id: run2.run_id, reason: 'waiting' })

    const status = await getWorkspaceStatus({ workspace_id: 'ws_1' })
    expect(status.running_runs).toHaveLength(1)
    expect(status.blocked_runs).toHaveLength(1)
    expect(status.wip_count).toBe(1)
    expect(status.queued_tasks).toBe(2) // T2 and T3 (T1 has a running run)
  })
})

describe('buildCosContext', () => {
  it('returns a non-empty markdown string', async () => {
    seed()
    const context = await buildCosContext({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(typeof context).toBe('string')
    expect(context.length).toBeGreaterThan(0)
  })

  it('respects max_tokens budget (approximate)', async () => {
    seed()
    const context = await buildCosContext({ workspace_id: 'ws_1', project_id: 'proj_1', max_tokens: 100 })
    // ~4 chars per token — should be under 400 chars + some slack
    expect(context.length).toBeLessThan(600)
  })
})

describe('listAgentProfiles', () => {
  it('returns all 6 roles', async () => {
    const profiles = await listAgentProfiles()
    expect(profiles).toHaveLength(6)
    const roles = profiles.map(p => p.role)
    expect(roles).toContain('chief_of_staff')
    expect(roles).toContain('implementer')
    expect(roles).toContain('tester')
  })

  it('only chief_of_staff can create teams', async () => {
    const profiles = await listAgentProfiles()
    const cos = profiles.find(p => p.role === 'chief_of_staff')!
    const impl = profiles.find(p => p.role === 'implementer')!
    expect(cos.can_create_teams).toBe(true)
    expect(impl.can_create_teams).toBe(false)
  })
})
```

- [ ] **Step 4: Run to confirm failure**

```bash
cd packages/core && pnpm test -- src/tests/status.test.ts
```

Expected: FAIL — `Cannot find module '../status.js'`

- [ ] **Step 5: Create `packages/core/src/status.ts`**

```typescript
import { getDb } from './db/client.js'
import type { AgentProfile, AgentRole, WorkspaceStatus } from './types.js'

interface GetWorkspaceStatusInput { workspace_id: string }
interface BuildCosContextInput { workspace_id: string; project_id: string; max_tokens?: number }

const AGENT_PROFILES: AgentProfile[] = [
  { role: 'chief_of_staff', description: 'Plans work, creates teams, dispatches agents, reviews CoS context', can_create_teams: true, can_dispatch_agents: true },
  { role: 'implementer', description: 'Writes code and implements features', can_create_teams: false, can_dispatch_agents: false },
  { role: 'tester', description: 'Writes and runs tests, validates implementations', can_create_teams: false, can_dispatch_agents: false },
  { role: 'reviewer', description: 'Reviews code and provides feedback', can_create_teams: false, can_dispatch_agents: false },
  { role: 'researcher', description: 'Investigates unknowns, gathers information', can_create_teams: false, can_dispatch_agents: false },
  { role: 'planner', description: 'Breaks down epics into tasks and defines acceptance criteria', can_create_teams: false, can_dispatch_agents: false },
]

export async function getWorkspaceStatus(input: GetWorkspaceStatusInput): Promise<WorkspaceStatus> {
  const db = getDb()

  const running = db.prepare(
    "SELECT * FROM agent_runs WHERE workspace_id = ? AND status = 'running' ORDER BY started_at DESC"
  ).all(input.workspace_id)

  const blocked = db.prepare(
    "SELECT * FROM agent_runs WHERE workspace_id = ? AND status = 'blocked' ORDER BY updated_at ASC"
  ).all(input.workspace_id)

  const stale = db.prepare(
    "SELECT * FROM agent_runs WHERE workspace_id = ? AND status = 'stale' ORDER BY updated_at ASC"
  ).all(input.workspace_id)

  const queued = (db.prepare(
    "SELECT COUNT(*) as c FROM tasks WHERE workspace_id = ? AND status = 'queued'"
  ).get(input.workspace_id) as { c: number }).c

  const today = new Date().toISOString().slice(0, 10)
  const completedToday = (db.prepare(
    "SELECT COUNT(*) as c FROM agent_runs WHERE workspace_id = ? AND status = 'completed' AND date(completed_at) = ?"
  ).get(input.workspace_id, today) as { c: number }).c

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toRun = (row: any) => ({
    ...row,
    artifacts: row.artifacts ? JSON.parse(row.artifacts as string) : null,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  })

  return {
    workspace_id: input.workspace_id,
    running_runs: (running as object[]).map(toRun),
    blocked_runs: (blocked as object[]).map(toRun),
    stale_runs: (stale as object[]).map(toRun),
    wip_count: running.length,
    queued_tasks: queued,
    completed_tasks_today: completedToday,
  }
}

export async function buildCosContext(input: BuildCosContextInput): Promise<string> {
  const db = getDb()
  const maxChars = (input.max_tokens ?? 4000) * 4 // ~4 chars per token
  const parts: string[] = []

  const status = await getWorkspaceStatus({ workspace_id: input.workspace_id })

  parts.push(`# Workspace Status — ${input.workspace_id}\n`)
  parts.push(`**WIP:** ${status.wip_count}  **Queued:** ${status.queued_tasks}  **Completed today:** ${status.completed_tasks_today}\n`)

  if (status.running_runs.length > 0) {
    parts.push('\n## Running\n')
    for (const r of status.running_runs) {
      parts.push(`- **${r.role as AgentRole}** (${r.run_id as string}) — ${r.current_step as string ?? 'in progress'} (${r.progress_pct as number}%)\n`)
    }
  }

  if (status.blocked_runs.length > 0) {
    parts.push('\n## Blocked\n')
    for (const r of status.blocked_runs) {
      parts.push(`- **${r.role as AgentRole}** (${r.run_id as string}) — ${r.output_summary as string ?? 'no reason given'}\n`)
    }
  }

  // Recent memories — trim to fit token budget
  const remaining = maxChars - parts.join('').length
  if (remaining > 200) {
    const memories = db.prepare(
      'SELECT content FROM memories WHERE workspace_id = ? AND project_id = ? ORDER BY last_accessed_at DESC LIMIT 10'
    ).all(input.workspace_id, input.project_id) as { content: string }[]

    if (memories.length > 0) {
      parts.push('\n## Recent Memory\n')
      let memChars = 0
      for (const m of memories) {
        const entry = `- ${m.content}\n`
        if (memChars + entry.length > remaining - 100) break
        parts.push(entry)
        memChars += entry.length
      }
    }
  }

  return parts.join('').slice(0, maxChars)
}

export async function listAgentProfiles(): Promise<AgentProfile[]> {
  return AGENT_PROFILES
}
```

- [ ] **Step 6: Run status tests**

```bash
cd packages/core && pnpm test -- src/tests/status.test.ts
```

Expected: 5 passing.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/memory.ts packages/core/src/status.ts packages/core/src/tests/status.test.ts
git commit -m "feat(core): hybrid recall (FTS5+vector+rerank), getWorkspaceStatus, buildCosContext, listAgentProfiles"
```

---

## Task 13: Wire exports + full test run

**Files:**
- Create: `packages/core/src/index.ts`

- [ ] **Step 1: Create `packages/core/src/index.ts`**

```typescript
// Types
export type {
  Task, TaskStatus, AgentRun, RunStatus, RunArtifacts, AgentRole,
  Memory, AgentProfile, WorkspaceStatus, PolicyConfig,
  EmbeddingProviderConfig, FulcrumConfig, PolicyCheckResult,
} from './types.js'
export { FulcrumError } from './types.js'

// Config
export { loadConfig, defaultConfig } from './config.js'

// DB
export { getDb, setDb, closeDb, _configureDb } from './db/client.js'
export { runMigrations } from './db/migrations.js'

// Tasks
export { listTasks, createTask, updateTask } from './tasks.js'

// Runs
export {
  startAgentRun,
  heartbeatAgentRun,
  getAgentRunStatus,
  completeAgentRun,
  blockAgentRun,
  escalateRun,
} from './runs.js'

// Policy
export { checkPolicy } from './policy.js'

// Janitor
export { runJanitorCycle, startJanitor } from './janitor.js'

// Memory
export { writeMemory, recallMemory } from './memory.js'

// Embedding
export { initEmbedding, getTextEmbedder, getCodeEmbedder, getReranker, resetProviders } from './embedding/registry.js'

// Status
export { getWorkspaceStatus, buildCosContext, listAgentProfiles } from './status.js'
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd packages/core && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run the full test suite**

```bash
cd packages/core && pnpm test
```

Expected: all tests passing. Count should be 30+. Zero failures.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): wire public API exports — @fulcrum/core complete"
```

- [ ] **Step 5: Run tests from workspace root**

```bash
cd /home/mkh/workspace/pi-stack-plan && pnpm test
```

Expected: same results from workspace root.

---

## Self-review checklist

- [x] Spec Section 2 (monorepo structure) — Task 1 ✓
- [x] Spec Section 3.1 (hexagonal core) — all tasks export pure functions, zero transport ✓
- [x] Spec Section 3.3 (SQLite schema) — Task 4 covers all columns including phase-2 slots ✓
- [x] Spec Section 3.4 (embedding + dedup) — Tasks 11–12 ✓
- [x] Spec Section 4 (14 tools) — Tasks 6–12 implement all 14 ✓
- [x] Spec Section 5.1 (heartbeat janitor) — Task 9 ✓
- [x] Spec Section 5.2 (WIP limits) — Task 8 ✓
- [x] Spec Section 5.3 (optimistic locking) — Task 6 ✓
- [x] Spec Section 5.4 (task dependencies) — Task 6 (`depends_on`) + Task 8 (policy check) ✓
- [x] Spec Section 5.5 (health endpoint) — NOT in Plan A. This is in Plan B (server). ✓ correct scope.
- [x] Spec Section 5.6 (advisory locks schema slot) — Task 4 (`advisory_locks` table) ✓
- [x] Spec Section 9.3 (config schema) — Task 5 ✓
