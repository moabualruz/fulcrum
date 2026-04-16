# @moabualruz/fulcrum-worktrees Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `@moabualruz/fulcrum-worktrees` package — git worktree lifecycle management (allocate → dirty → ready_for_merge → merged/discarded), artifact and review records, handoffs, artifact contracts, and a policy-gated merge queue for integration workers.

**Architecture:** New `packages/worktrees/` package depends on `@moabualruz/fulcrum-core` for DB access (`getDb()`/`setDb()`). All tables are created in MIGRATION_007 which is added to `runMigrations()` in `@moabualruz/fulcrum-core`. The merge queue is FIFO by `created_at` and is gated by a `callerRole` check — only `integration_worker` may call `processMergeQueue`. Tests use an in-memory SQLite database via `setDb(db)`.

**Tech Stack:** TypeScript ESM, better-sqlite3, ulidx, vitest (pool: 'forks')

---

## File Structure

```
packages/worktrees/
  package.json                     — name: @moabualruz/fulcrum-worktrees, dep: @moabualruz/fulcrum-core
  tsconfig.json                    — mirrors packages/core/tsconfig.json
  vitest.config.ts                 — pool: forks
  src/
    types.ts                       — all interfaces and types
    schema.ts                      — runMigration007(db)
    worktrees.ts                   — all public functions
    index.ts                       — re-exports everything public
    tests/
      worktrees.test.ts            — 8 test cases
```

---

## Task 1: Scaffold package

**Files:**
- Create: `packages/worktrees/package.json`
- Create: `packages/worktrees/tsconfig.json`
- Create: `packages/worktrees/vitest.config.ts`
- Create: `packages/worktrees/src/index.ts` (empty placeholder)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@moabualruz/fulcrum-worktrees",
  "version": "0.0.1",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@moabualruz/fulcrum-core": "workspace:*",
    "ulidx": "^2.3.0"
  },
  "devDependencies": {
    "better-sqlite3": "^12.0.0",
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  }
}
```

Save to `packages/worktrees/package.json`.

- [ ] **Step 2: Create tsconfig.json**

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

Save to `packages/worktrees/tsconfig.json`.

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    pool: 'forks', // required: better-sqlite3 native addon is not thread-safe
  },
})
```

Save to `packages/worktrees/vitest.config.ts`.

- [ ] **Step 4: Create empty src/index.ts**

```typescript
// exports added as each module is implemented
```

Save to `packages/worktrees/src/index.ts`.

- [ ] **Step 5: Install dependencies**

```bash
cd /home/mkh/workspace/pi-stack-plan
pnpm install
```

Expected: `@moabualruz/fulcrum-worktrees` appears in workspace. No errors.

- [ ] **Step 6: Commit**

```bash
git add packages/worktrees/package.json packages/worktrees/tsconfig.json packages/worktrees/vitest.config.ts packages/worktrees/src/index.ts
git commit -m "chore(worktrees): scaffold @moabualruz/fulcrum-worktrees package"
```

---

## Task 2: Types

**Files:**
- Create: `packages/worktrees/src/types.ts`

- [ ] **Step 1: Write types.ts**

```typescript
// packages/worktrees/src/types.ts

export type ArtifactType =
  | 'prd' | 'plan' | 'review' | 'test_report' | 'code_diff'
  | 'log' | 'spec' | 'diagram' | 'document' | 'config'

export type ArtifactStatus = 'draft' | 'final' | 'archived'
export type ReviewStatus = 'pending' | 'changes_requested' | 'approved' | 'rejected'
export type ReviewTargetType = 'task' | 'artifact' | 'worktree'
export type WorktreeStatus = 'allocated' | 'dirty' | 'ready_for_merge' | 'merged' | 'discarded'
export type HandoffMode = 'artifact_first_brief' | 'context_first' | 'goal_first' | 'resource_first'

export interface Artifact {
  artifact_id: string
  workspace_id: string
  project_id: string
  display_id: string
  artifact_type: ArtifactType
  title: string
  file_path: string
  owner_type: string
  owner_id: string
  status: ArtifactStatus
  content_hash?: string
  created_at: string
  updated_at: string
}

export interface Review {
  review_id: string
  workspace_id: string
  project_id: string
  display_id: string
  target_type: ReviewTargetType
  target_id: string
  status: ReviewStatus
  reviewer_agent_id?: string
  summary?: string
  file_path?: string
  created_at: string
  updated_at: string
}

export interface Worktree {
  worktree_id: string
  workspace_id: string
  project_id: string
  status: WorktreeStatus
  branch_name: string
  path: string
  task_id?: string
  run_id?: string
  created_at: string
  updated_at: string
  merged_at?: string
  discarded_at?: string
}

export interface MergeResult {
  worktree_id: string
  branch_name: string
  success: boolean
  error?: string
  merged_at?: string
}

export interface AllocateWorktreeInput {
  workspace_id: string
  project_id: string
  branch_name: string
  path: string
  task_id?: string
  run_id?: string
}

export interface MarkDirtyInput {
  worktree_id: string
}

export interface MarkReadyInput {
  worktree_id: string
}

export interface EnqueueMergeInput {
  worktree_id: string
  priority?: number
}

export interface DiscardWorktreeInput {
  worktree_id: string
  reason?: string
}

export interface MergeReadinessCheck {
  worktree_id: string
  passed: boolean
  failures: string[]
}

export interface Handoff {
  handoff_id: string
  workspace_id: string
  project_id: string
  from_agent_id: string
  to_agent_id: string
  task_id?: string
  issue_id?: string
  goal: string
  task_type?: string
  priority: string
  scope: string
  inputs: Record<string, unknown>
  constraints: string[]
  done_criteria: string[]
  artifact_contract_id?: string
  handoff_mode: HandoffMode
  created_at: string
}

export interface ArtifactContract {
  contract_id: string
  task_id?: string
  required_artifacts: string[]
  optional_artifacts: string[]
  final_summary_artifact?: string
  review_inputs: string[]
  merge_readiness_rules: string[]
  created_at: string
  updated_at: string
}
```

Save to `packages/worktrees/src/types.ts`.

- [ ] **Step 2: Commit**

```bash
git add packages/worktrees/src/types.ts
git commit -m "feat(worktrees): add types"
```

---

## Task 3: MIGRATION_007 schema

**Files:**
- Create: `packages/worktrees/src/schema.ts`

> **Note:** `runMigration007(db)` must also be called inside `runMigrations()` in `packages/core/src/db/migrations.ts`. Add a call there after MIGRATION_006 (or MIGRATION_005 if 006 doesn't exist yet). The function is imported from this package.

- [ ] **Step 1: Write schema.ts**

```typescript
// packages/worktrees/src/schema.ts
import type Database from 'better-sqlite3'

export function runMigration007(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      artifact_id   TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id    TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      display_id    TEXT NOT NULL,
      artifact_type TEXT NOT NULL,
      title         TEXT NOT NULL,
      file_path     TEXT NOT NULL,
      owner_type    TEXT NOT NULL,
      owner_id      TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'draft'
        CHECK(status IN ('draft','final','archived')),
      content_hash  TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS artifacts_fts
      USING fts5(title, content='artifacts', content_rowid='rowid',
                 tokenize='porter unicode61');

    CREATE TABLE IF NOT EXISTS reviews (
      review_id          TEXT PRIMARY KEY,
      workspace_id       TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id         TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      display_id         TEXT NOT NULL,
      target_type        TEXT NOT NULL CHECK(target_type IN ('task','artifact','worktree')),
      target_id          TEXT NOT NULL,
      status             TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','changes_requested','approved','rejected')),
      reviewer_agent_id  TEXT,
      summary            TEXT,
      file_path          TEXT,
      created_at         TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS worktrees (
      worktree_id  TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      project_id   TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      status       TEXT NOT NULL DEFAULT 'allocated'
        CHECK(status IN ('allocated','dirty','ready_for_merge','merged','discarded')),
      branch_name  TEXT NOT NULL,
      path         TEXT NOT NULL,
      task_id      TEXT REFERENCES tasks(task_id),
      run_id       TEXT REFERENCES agent_runs(run_id),
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      merged_at    TEXT,
      discarded_at TEXT
    );

    CREATE TABLE IF NOT EXISTS handoffs (
      handoff_id           TEXT PRIMARY KEY,
      workspace_id         TEXT NOT NULL,
      project_id           TEXT NOT NULL,
      from_agent_id        TEXT NOT NULL,
      to_agent_id          TEXT NOT NULL,
      task_id              TEXT REFERENCES tasks(task_id),
      issue_id             TEXT REFERENCES issues(issue_id),
      goal                 TEXT NOT NULL,
      task_type            TEXT,
      priority             TEXT NOT NULL DEFAULT 'medium',
      scope                TEXT NOT NULL,
      inputs               TEXT NOT NULL DEFAULT '{}',
      constraints          TEXT NOT NULL DEFAULT '[]',
      done_criteria        TEXT NOT NULL DEFAULT '[]',
      artifact_contract_id TEXT REFERENCES artifact_contracts(contract_id),
      handoff_mode         TEXT NOT NULL DEFAULT 'artifact_first_brief'
        CHECK(handoff_mode IN ('artifact_first_brief','context_first','goal_first','resource_first')),
      created_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS artifact_contracts (
      contract_id            TEXT PRIMARY KEY,
      task_id                TEXT REFERENCES tasks(task_id),
      required_artifacts     TEXT NOT NULL DEFAULT '[]',
      optional_artifacts     TEXT NOT NULL DEFAULT '[]',
      final_summary_artifact TEXT,
      review_inputs          TEXT NOT NULL DEFAULT '[]',
      merge_readiness_rules  TEXT NOT NULL DEFAULT '[]',
      created_at             TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agentrun_artifacts (
      run_id      TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
      artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
      PRIMARY KEY (run_id, artifact_id)
    );

    CREATE TABLE IF NOT EXISTS review_targets (
      review_id   TEXT NOT NULL REFERENCES reviews(review_id) ON DELETE CASCADE,
      artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
      PRIMARY KEY (review_id, artifact_id)
    );

    CREATE TABLE IF NOT EXISTS task_memory_links (
      task_id   TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
      memory_id TEXT NOT NULL REFERENCES memories(memory_id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, memory_id)
    );

    CREATE TABLE IF NOT EXISTS artifact_memory_links (
      artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
      memory_id   TEXT NOT NULL REFERENCES memories(memory_id) ON DELETE CASCADE,
      PRIMARY KEY (artifact_id, memory_id)
    );
  `)
}
```

Save to `packages/worktrees/src/schema.ts`.

- [ ] **Step 2: Commit**

```bash
git add packages/worktrees/src/schema.ts
git commit -m "feat(worktrees): add MIGRATION_007 schema"
```

---

## Task 4: Write failing tests

**Files:**
- Create: `packages/worktrees/src/tests/worktrees.test.ts`

- [ ] **Step 1: Write worktrees.test.ts**

```typescript
// packages/worktrees/src/tests/worktrees.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb } from '@moabualruz/fulcrum-core'
import { runMigration007 } from '../schema.js'
import {
  allocateWorktree,
  markDirty,
  markReadyForMerge,
  enqueueMerge,
  processMergeQueue,
  discardWorktree,
  listMergeQueue,
} from '../worktrees.js'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Minimal prerequisite tables so foreign keys don't block worktrees migration
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      workspace_id TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS projects (
      project_id   TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      task_id      TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id   TEXT NOT NULL,
      title        TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'queued',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS agent_runs (
      run_id       TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id   TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'created',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS issues (
      issue_id     TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id   TEXT NOT NULL,
      title        TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'backlog',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS memories (
      memory_id    TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      content      TEXT NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  runMigration007(db)

  // Seed workspace and project for FK satisfaction
  db.prepare(`INSERT INTO workspaces (workspace_id, name) VALUES ('ws_test', 'Test Workspace')`).run()
  db.prepare(`INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_test', 'ws_test', 'Test Project')`).run()

  return db
}

let db: Database.Database

beforeEach(() => {
  db = createTestDb()
  setDb(db)
})

describe('allocateWorktree', () => {
  it('creates a worktree with status allocated', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/my-branch',
      path: '/tmp/worktrees/my-branch',
    })

    expect(wt.worktree_id).toMatch(/^wt_/)
    expect(wt.workspace_id).toBe('ws_test')
    expect(wt.project_id).toBe('proj_test')
    expect(wt.branch_name).toBe('feature/my-branch')
    expect(wt.path).toBe('/tmp/worktrees/my-branch')
    expect(wt.status).toBe('allocated')
    expect(wt.task_id).toBeUndefined()
    expect(wt.run_id).toBeUndefined()
    expect(wt.merged_at).toBeUndefined()
    expect(wt.discarded_at).toBeUndefined()
  })
})

describe('markDirty', () => {
  it('transitions status from allocated to dirty', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/dirty-branch',
      path: '/tmp/worktrees/dirty',
    })

    const updated = await markDirty({ worktree_id: wt.worktree_id })

    expect(updated.worktree_id).toBe(wt.worktree_id)
    expect(updated.status).toBe('dirty')
    expect(updated.updated_at).toBeDefined()
  })
})

describe('markReadyForMerge', () => {
  it('transitions status from dirty to ready_for_merge', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/ready-branch',
      path: '/tmp/worktrees/ready',
    })
    await markDirty({ worktree_id: wt.worktree_id })
    const updated = await markReadyForMerge({ worktree_id: wt.worktree_id })

    expect(updated.status).toBe('ready_for_merge')
  })
})

describe('enqueueMerge + listMergeQueue', () => {
  it('enqueued worktree appears in the merge queue', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/enqueue-branch',
      path: '/tmp/worktrees/enqueue',
    })
    await markDirty({ worktree_id: wt.worktree_id })
    await markReadyForMerge({ worktree_id: wt.worktree_id })
    await enqueueMerge({ worktree_id: wt.worktree_id })

    const queue = await listMergeQueue('proj_test')
    const found = queue.find((w) => w.worktree_id === wt.worktree_id)

    expect(found).toBeDefined()
    expect(found!.status).toBe('ready_for_merge')
  })
})

describe('processMergeQueue', () => {
  it('processes queue and marks worktrees as merged for integration_worker', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/merge-branch',
      path: '/tmp/worktrees/merge',
    })
    await markDirty({ worktree_id: wt.worktree_id })
    await markReadyForMerge({ worktree_id: wt.worktree_id })
    await enqueueMerge({ worktree_id: wt.worktree_id })

    const results = await processMergeQueue('proj_test', 'integration_worker')

    expect(results).toHaveLength(1)
    expect(results[0].worktree_id).toBe(wt.worktree_id)
    expect(results[0].success).toBe(true)
    expect(results[0].merged_at).toBeDefined()

    // Verify DB row is updated
    const queue = await listMergeQueue('proj_test')
    expect(queue.find((w) => w.worktree_id === wt.worktree_id)).toBeUndefined()
  })

  it('throws POLICY_DENIED for non-integration_worker callers', async () => {
    await expect(
      processMergeQueue('proj_test', 'implementer')
    ).rejects.toThrow('POLICY_DENIED: only integration_worker may process merge queue')
  })
})

describe('discardWorktree', () => {
  it('transitions status to discarded and sets discarded_at', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/discard-branch',
      path: '/tmp/worktrees/discard',
    })

    await discardWorktree({ worktree_id: wt.worktree_id, reason: 'stale branch' })

    const row = db
      .prepare('SELECT * FROM worktrees WHERE worktree_id = ?')
      .get(wt.worktree_id) as { status: string; discarded_at: string | null }

    expect(row.status).toBe('discarded')
    expect(row.discarded_at).not.toBeNull()
  })
})

describe('listMergeQueue', () => {
  it('only returns ready_for_merge worktrees ordered by created_at ASC (FIFO)', async () => {
    // Create three worktrees; put two in ready_for_merge, one stays dirty
    const wt1 = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/fifo-1',
      path: '/tmp/worktrees/fifo-1',
    })
    const wt2 = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/fifo-2',
      path: '/tmp/worktrees/fifo-2',
    })
    const wt3 = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/fifo-3',
      path: '/tmp/worktrees/fifo-3',
    })

    await markDirty({ worktree_id: wt1.worktree_id })
    await markReadyForMerge({ worktree_id: wt1.worktree_id })
    await markDirty({ worktree_id: wt2.worktree_id })
    // wt2 stays dirty — not yet ready
    await markDirty({ worktree_id: wt3.worktree_id })
    await markReadyForMerge({ worktree_id: wt3.worktree_id })

    const queue = await listMergeQueue('proj_test')
    const ids = queue.map((w) => w.worktree_id)

    // Only wt1 and wt3 are ready_for_merge; wt2 is excluded
    expect(ids).toContain(wt1.worktree_id)
    expect(ids).toContain(wt3.worktree_id)
    expect(ids).not.toContain(wt2.worktree_id)

    // FIFO: wt1 was created first
    expect(ids.indexOf(wt1.worktree_id)).toBeLessThan(ids.indexOf(wt3.worktree_id))

    // All returned entries have correct status
    queue.forEach((w) => expect(w.status).toBe('ready_for_merge'))
  })
})
```

Save to `packages/worktrees/src/tests/worktrees.test.ts`.

- [ ] **Step 2: Run tests — expect failures (worktrees.ts not yet created)**

```bash
cd /home/mkh/workspace/pi-stack-plan/packages/worktrees
pnpm test 2>&1 | tail -20
```

Expected: import errors or "cannot find module" — tests not yet green.

- [ ] **Step 3: Commit failing tests**

```bash
git add packages/worktrees/src/tests/worktrees.test.ts
git commit -m "test(worktrees): add failing tests for worktree lifecycle"
```

---

## Task 5: Implement worktrees.ts

**Files:**
- Create: `packages/worktrees/src/worktrees.ts`

- [ ] **Step 1: Write worktrees.ts**

```typescript
// packages/worktrees/src/worktrees.ts
import { ulid } from 'ulidx'
import { getDb } from '@moabualruz/fulcrum-core'
import type {
  Worktree,
  MergeResult,
  AllocateWorktreeInput,
  MarkDirtyInput,
  MarkReadyInput,
  EnqueueMergeInput,
  DiscardWorktreeInput,
} from './types.js'

function rowToWorktree(row: Record<string, unknown>): Worktree {
  return {
    worktree_id: row.worktree_id as string,
    workspace_id: row.workspace_id as string,
    project_id: row.project_id as string,
    status: row.status as Worktree['status'],
    branch_name: row.branch_name as string,
    path: row.path as string,
    task_id: (row.task_id as string | null) ?? undefined,
    run_id: (row.run_id as string | null) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    merged_at: (row.merged_at as string | null) ?? undefined,
    discarded_at: (row.discarded_at as string | null) ?? undefined,
  }
}

export async function allocateWorktree(input: AllocateWorktreeInput): Promise<Worktree> {
  const db = getDb()
  const worktree_id = `wt_${ulid()}`
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO worktrees
      (worktree_id, workspace_id, project_id, status, branch_name, path, task_id, run_id, created_at, updated_at)
    VALUES
      (?, ?, ?, 'allocated', ?, ?, ?, ?, ?, ?)
  `).run(
    worktree_id,
    input.workspace_id,
    input.project_id,
    input.branch_name,
    input.path,
    input.task_id ?? null,
    input.run_id ?? null,
    now,
    now,
  )

  const row = db
    .prepare('SELECT * FROM worktrees WHERE worktree_id = ?')
    .get(worktree_id) as Record<string, unknown>

  return rowToWorktree(row)
}

export async function markDirty(input: MarkDirtyInput): Promise<Worktree> {
  const db = getDb()
  const now = new Date().toISOString()

  db.prepare(`
    UPDATE worktrees SET status = 'dirty', updated_at = ? WHERE worktree_id = ?
  `).run(now, input.worktree_id)

  const row = db
    .prepare('SELECT * FROM worktrees WHERE worktree_id = ?')
    .get(input.worktree_id) as Record<string, unknown>

  if (!row) throw new Error(`Worktree not found: ${input.worktree_id}`)
  return rowToWorktree(row)
}

export async function markReadyForMerge(input: MarkReadyInput): Promise<Worktree> {
  const db = getDb()
  const now = new Date().toISOString()

  db.prepare(`
    UPDATE worktrees SET status = 'ready_for_merge', updated_at = ? WHERE worktree_id = ?
  `).run(now, input.worktree_id)

  const row = db
    .prepare('SELECT * FROM worktrees WHERE worktree_id = ?')
    .get(input.worktree_id) as Record<string, unknown>

  if (!row) throw new Error(`Worktree not found: ${input.worktree_id}`)
  return rowToWorktree(row)
}

export async function enqueueMerge(input: EnqueueMergeInput): Promise<void> {
  // enqueueMerge is a no-op at the DB level — the worktree is already marked
  // ready_for_merge. This function exists so callers can set a priority hint
  // in the future. For now it validates the worktree exists and is in the
  // correct state before returning.
  const db = getDb()
  const row = db
    .prepare(`SELECT status FROM worktrees WHERE worktree_id = ?`)
    .get(input.worktree_id) as { status: string } | undefined

  if (!row) throw new Error(`Worktree not found: ${input.worktree_id}`)
  if (row.status !== 'ready_for_merge') {
    throw new Error(
      `Cannot enqueue worktree ${input.worktree_id}: status is '${row.status}', expected 'ready_for_merge'`
    )
  }
}

export async function processMergeQueue(
  projectId: string,
  callerRole: string
): Promise<MergeResult[]> {
  if (callerRole !== 'integration_worker') {
    throw new Error('POLICY_DENIED: only integration_worker may process merge queue')
  }

  const db = getDb()
  const queue = db
    .prepare(`
      SELECT * FROM worktrees
      WHERE project_id = ? AND status = 'ready_for_merge'
      ORDER BY created_at ASC
    `)
    .all(projectId) as Array<Record<string, unknown>>

  const results: MergeResult[] = []
  const now = new Date().toISOString()

  for (const row of queue) {
    const worktree_id = row.worktree_id as string
    const branch_name = row.branch_name as string

    try {
      db.prepare(`
        UPDATE worktrees
        SET status = 'merged', merged_at = ?, updated_at = ?
        WHERE worktree_id = ?
      `).run(now, now, worktree_id)

      results.push({ worktree_id, branch_name, success: true, merged_at: now })
    } catch (err) {
      results.push({
        worktree_id,
        branch_name,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}

export async function discardWorktree(input: DiscardWorktreeInput): Promise<void> {
  const db = getDb()
  const now = new Date().toISOString()

  db.prepare(`
    UPDATE worktrees
    SET status = 'discarded', discarded_at = ?, updated_at = ?
    WHERE worktree_id = ?
  `).run(now, now, input.worktree_id)
}

export async function listMergeQueue(projectId: string): Promise<Worktree[]> {
  const db = getDb()
  const rows = db
    .prepare(`
      SELECT * FROM worktrees
      WHERE project_id = ? AND status = 'ready_for_merge'
      ORDER BY created_at ASC
    `)
    .all(projectId) as Array<Record<string, unknown>>

  return rows.map(rowToWorktree)
}
```

Save to `packages/worktrees/src/worktrees.ts`.

- [ ] **Step 2: Run tests — expect green**

```bash
cd /home/mkh/workspace/pi-stack-plan/packages/worktrees
pnpm test 2>&1 | tail -20
```

Expected: 8 tests pass, 0 failures.

- [ ] **Step 3: Commit**

```bash
git add packages/worktrees/src/worktrees.ts
git commit -m "feat(worktrees): implement worktree lifecycle functions"
```

---

## Task 6: Wire up index.ts

**Files:**
- Edit: `packages/worktrees/src/index.ts`

- [ ] **Step 1: Populate index.ts**

```typescript
// packages/worktrees/src/index.ts
export * from './types.js'
export * from './schema.js'
export * from './worktrees.js'
```

Save to `packages/worktrees/src/index.ts`.

- [ ] **Step 2: Run full test suite one more time**

```bash
cd /home/mkh/workspace/pi-stack-plan/packages/worktrees
pnpm test
```

Expected: all 8 tests green.

- [ ] **Step 3: Commit**

```bash
git add packages/worktrees/src/index.ts
git commit -m "feat(worktrees): wire up index.ts exports"
```

---

## Task 7: Final integration check

- [ ] **Step 1: Run all workspace tests to confirm no regressions**

```bash
cd /home/mkh/workspace/pi-stack-plan
pnpm -r test 2>&1 | tail -30
```

Expected: all packages pass. `@moabualruz/fulcrum-worktrees` shows 8 passing tests.

- [ ] **Step 2: Final commit (if any cleanup needed)**

```bash
git add -p
git commit -m "chore(worktrees): post-integration cleanup"
```

---

## Checklist summary

| # | Test | Covers |
|---|------|--------|
| 1 | allocateWorktree — creates with status 'allocated' | happy path, prefix `wt_` |
| 2 | markDirty — transitions to 'dirty' | status transition |
| 3 | markReadyForMerge — transitions to 'ready_for_merge' | status transition |
| 4 | enqueueMerge + listMergeQueue — queued item appears | enqueue + list |
| 5 | processMergeQueue — succeeds for integration_worker | merge, sets merged_at |
| 6 | processMergeQueue — throws POLICY_DENIED | role gate |
| 7 | discardWorktree — sets status + discarded_at | discard lifecycle |
| 8 | listMergeQueue — only ready_for_merge, FIFO order | filtering + ordering |
