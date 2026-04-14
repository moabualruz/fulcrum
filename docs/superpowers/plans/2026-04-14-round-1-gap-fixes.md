# Round 1 Gap Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 16 validated CRITICAL and IMPORTANT gaps (G-1..G-16) found in Phase 1 of the Python-vs-TypeScript gap analysis at `docs/gap-analysis/phase-1-validated.md`.

**Architecture:** Each task is scoped to a single concern and confined to one or two files so fresh subagents can implement them independently. Tasks that touch the same file (migrations, index exports) are sequenced to avoid conflicts. Every task follows TDD: write failing test → implement → run test → commit.

**Tech Stack:** TypeScript, better-sqlite3, vitest, Hono, Node.js, pnpm monorepo workspaces.

---

## Scope check

This plan addresses G-1 through G-16 from `docs/gap-analysis/phase-1-validated.md`. It deliberately **defers** D-1 through D-7 (workflow runner, artifact storage, first-class Comment/BoardView/Cycle/Milestone, integration worker, DB-backed policy rules, full CLI coverage, secret guard). Each of those needs its own plan.

## File structure

### New files

| File | Responsibility |
|------|----------------|
| `packages/core/src/workspaces.ts` | CRUD for workspaces + validation |
| `packages/core/src/projects.ts` | CRUD for projects + type/status enum validation |
| `packages/core/src/constants.ts` | Named constants (timeouts, limits, ports, dims) |
| `packages/core/src/locks.ts` | `acquireLock` / `releaseLock` / `listLocks` / `cleanupExpiredLocks` |
| `packages/core/src/telemetry/spans.ts` | `startSpan` / `endSpan` / `getTrace` scaffold |
| `packages/core/src/tests/workspaces.test.ts` | Workspace CRUD tests |
| `packages/core/src/tests/projects.test.ts` | Project CRUD + schema tests |
| `packages/core/src/tests/locks.test.ts` | Advisory lock tests |
| `packages/core/src/tests/telemetry.test.ts` | Spans tests |
| `agent-integration/roles/chief_of_staff.md` | Role prompt for CoS |
| `agent-integration/roles/software_engineer.md` | Role prompt |
| `agent-integration/roles/integration_worker.md` | Role prompt |
| `agent-integration/roles/code_reviewer.md` | Role prompt |
| `agent-integration/roles/security_reviewer.md` | Role prompt |
| `agent-integration/roles/tech_lead.md` | Role prompt |
| `agent-integration/roles/README.md` | Index + conventions |

### Modified files

| File | Change |
|------|--------|
| `packages/core/src/db/migrations.ts` | New migration version: project columns, `memories.task_id`, `advisory_locks` already exists, `trace_events` table |
| `packages/core/src/types.ts` | `MemoryScope` adds `'task'`; `HandoffMode` enum; tighten `HandoffPacket.done_criteria` to `string[]`; new `TelemetrySpan` type |
| `packages/core/src/index.ts` | Re-export new modules |
| `packages/core/src/ids.ts` | Add `subtask / cycle / milestone / comment / status_event / lock / span` prefixes |
| `packages/core/src/memory.ts` | `project_id` becomes optional; add `'task'` scope support; §10.7 weighted ranking |
| `packages/core/src/runs.ts` | Append to `events` JSON column on every lifecycle transition |
| `packages/core/src/status.ts` | `listAgentProfiles` reads from `agent-integration/roles/<role>.md` |
| `packages/core/src/janitor.ts` | Call `cleanupExpiredLocks` in the janitor cycle |
| `packages/policy/src/engine.ts` | Add `chief_of_staff_no_direct_writes` invariant |
| `packages/monitor/src/server.ts` | `project_id` optional in POST /memory/recall; use `workspaces.ts` / `projects.ts` CRUD instead of raw SQL |
| `packages/cli/src/index.ts` | `runWorkspaces` / `runProjects` call `workspaces.ts` / `projects.ts`; `runServeMcp` / `runServeMonitor` await `initEmbedding()` at startup |

---

## Task 1: Named constants module

**Files:**
- Create: `packages/core/src/constants.ts`
- Modify: `packages/core/src/index.ts` — add `export * from './constants.js'`
- Modify: `packages/core/src/janitor.ts` — replace magic `600`/`1800`
- Modify: `packages/core/src/config.ts` — import `DEFAULT_MONITOR_PORT`
- Test: `packages/core/src/tests/constants.test.ts`

This goes first because it's referenced by later tasks.

- [ ] **Step 1.1: Create the constants file**

```typescript
// packages/core/src/constants.ts
// Named constants used across the Fulcrum control plane.
// Single source of truth — update here, ripple through callers.

/** Default heartbeat freshness window. Runs older than this are marked stale. */
export const DEFAULT_HEARTBEAT_TIMEOUT_SEC = 600 // 10 minutes

/** Default escalation window. Blocked runs older than this escalate to CoS. */
export const DEFAULT_ESCALATION_TIMEOUT_SEC = 1800 // 30 minutes

/** Default WIP limit per role for a workspace. */
export const DEFAULT_WIP_LIMIT = 3

/** Default HTTP port for the monitor + control API server. */
export const DEFAULT_MONITOR_PORT = 4721

/** Default text embedding dimension (Qwen3 / bge-m3 / all-MiniLM). */
export const DEFAULT_EMBED_DIM = 1024

/** Default advisory lock TTL in seconds. */
export const DEFAULT_LOCK_TTL_SEC = 900 // 15 minutes

/** Janitor cycle interval — how often stale/expired state is reaped. */
export const JANITOR_INTERVAL_SEC = 60

/** §10.7 hybrid memory ranking weights (must sum to 1.0). */
export const MEMORY_RANK_WEIGHTS = {
  semantic: 0.4,
  lexical: 0.3,
  recency: 0.2,
  confidence: 0.1,
} as const
```

- [ ] **Step 1.2: Write the failing test**

```typescript
// packages/core/src/tests/constants.test.ts
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_HEARTBEAT_TIMEOUT_SEC,
  DEFAULT_ESCALATION_TIMEOUT_SEC,
  DEFAULT_WIP_LIMIT,
  DEFAULT_MONITOR_PORT,
  DEFAULT_EMBED_DIM,
  DEFAULT_LOCK_TTL_SEC,
  JANITOR_INTERVAL_SEC,
  MEMORY_RANK_WEIGHTS,
} from '../constants.js'

describe('constants', () => {
  it('heartbeat timeout is 10 minutes', () => {
    expect(DEFAULT_HEARTBEAT_TIMEOUT_SEC).toBe(600)
  })
  it('escalation timeout is 30 minutes', () => {
    expect(DEFAULT_ESCALATION_TIMEOUT_SEC).toBe(1800)
  })
  it('default WIP is 3', () => {
    expect(DEFAULT_WIP_LIMIT).toBe(3)
  })
  it('monitor port is 4721', () => {
    expect(DEFAULT_MONITOR_PORT).toBe(4721)
  })
  it('embedding dim is 1024', () => {
    expect(DEFAULT_EMBED_DIM).toBe(1024)
  })
  it('lock TTL is 15 minutes', () => {
    expect(DEFAULT_LOCK_TTL_SEC).toBe(900)
  })
  it('janitor interval is 60s', () => {
    expect(JANITOR_INTERVAL_SEC).toBe(60)
  })
  it('ranking weights sum to 1.0', () => {
    const sum = MEMORY_RANK_WEIGHTS.semantic + MEMORY_RANK_WEIGHTS.lexical +
                MEMORY_RANK_WEIGHTS.recency + MEMORY_RANK_WEIGHTS.confidence
    expect(sum).toBeCloseTo(1.0, 6)
  })
})
```

- [ ] **Step 1.3: Run test — should PASS**

```
pnpm --filter @fulcrum/core test constants
```

- [ ] **Step 1.4: Re-export from core index**

In `packages/core/src/index.ts`, add at end of file:
```typescript
// Constants
export * from './constants.js'
```

- [ ] **Step 1.5: Replace magic numbers at known call sites**

Grep for `600`, `1800`, `4721` and replace with imports where semantically correct:
```
grep -rn "600\|1800" packages/core/src/janitor.ts packages/core/src/policy.ts
```
For each match that represents heartbeat/escalation, replace with the imported constant.

- [ ] **Step 1.6: Commit**

```bash
git add packages/core/src/constants.ts packages/core/src/tests/constants.test.ts packages/core/src/index.ts packages/core/src/janitor.ts
git commit -m "feat(core): add named constants module (G-9)"
```

---

## Task 2: Migration — project columns, memories.task_id, trace_events

**Files:**
- Modify: `packages/core/src/db/migrations.ts` — add new migration version
- Test: `packages/core/src/tests/migrations.test.ts` (extend existing)

This runs before Tasks 3, 4, 5 because they depend on new columns/tables.

- [ ] **Step 2.1: Read current migration state**

```bash
grep -n "CURRENT_VERSION\|migrate_v" packages/core/src/db/migrations.ts
```
Note the current `CURRENT_VERSION` (likely 2 or 3).

- [ ] **Step 2.2: Write failing tests**

In `packages/core/src/tests/migrations.test.ts`, add:

```typescript
describe('round 1 migration', () => {
  it('projects table has type/status/write_mode/git_url/parent_project_id', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    const cols = db.prepare(`PRAGMA table_info(projects)`).all() as { name: string }[]
    const names = cols.map(c => c.name)
    expect(names).toContain('type')
    expect(names).toContain('status')
    expect(names).toContain('write_mode')
    expect(names).toContain('git_url')
    expect(names).toContain('parent_project_id')
  })

  it('projects.type has CHECK constraint for git/non_git/submodule/logical', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1', 'w', 'active', '2026-04-14T00:00:00Z')`).run()
    // Valid value succeeds
    expect(() => db.prepare(
      `INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at)
       VALUES ('proj_1', 'ws_1', 'p', 'git', 'active', 'worktree', '2026-04-14T00:00:00Z')`
    ).run()).not.toThrow()
    // Invalid value fails
    expect(() => db.prepare(
      `INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at)
       VALUES ('proj_2', 'ws_1', 'p2', 'not_a_type', 'active', 'worktree', '2026-04-14T00:00:00Z')`
    ).run()).toThrow()
  })

  it('memories.task_id column exists and is nullable', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    const cols = db.prepare(`PRAGMA table_info(memories)`).all() as { name: string; notnull: number }[]
    const taskCol = cols.find(c => c.name === 'task_id')
    expect(taskCol).toBeDefined()
    expect(taskCol!.notnull).toBe(0)
  })

  it('trace_events table exists with expected columns', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    const cols = db.prepare(`PRAGMA table_info(trace_events)`).all() as { name: string }[]
    const names = cols.map(c => c.name)
    expect(names).toContain('span_id')
    expect(names).toContain('trace_id')
    expect(names).toContain('parent_span_id')
    expect(names).toContain('name')
    expect(names).toContain('status')
    expect(names).toContain('started_at')
    expect(names).toContain('ended_at')
    expect(names).toContain('payload')
  })
})
```

- [ ] **Step 2.3: Run tests — should FAIL**

```
pnpm --filter @fulcrum/core test migrations
```

- [ ] **Step 2.4: Add the migration**

Bump `CURRENT_VERSION` by one. Add a new `migrate_v<N>` function:

```typescript
function migrate_v<N>(db: Database.Database): void {
  db.exec(`
    -- Project schema extensions (G-2)
    ALTER TABLE projects ADD COLUMN type TEXT NOT NULL DEFAULT 'git'
      CHECK(type IN ('git','non_git','submodule','logical'));
    ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
      CHECK(status IN ('active','archived','paused'));
    ALTER TABLE projects ADD COLUMN write_mode TEXT NOT NULL DEFAULT 'worktree'
      CHECK(write_mode IN ('worktree','in_place','sequential'));
    ALTER TABLE projects ADD COLUMN git_url TEXT;
    ALTER TABLE projects ADD COLUMN parent_project_id TEXT
      REFERENCES projects(project_id) ON DELETE SET NULL;

    -- Memory task scope (G-4)
    ALTER TABLE memories ADD COLUMN task_id TEXT
      REFERENCES tasks(task_id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_memories_task ON memories(task_id);

    -- Telemetry spans (G-12)
    CREATE TABLE IF NOT EXISTS trace_events (
      span_id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      parent_span_id TEXT,
      name TEXT NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      run_id TEXT,
      status TEXT NOT NULL DEFAULT 'started' CHECK(status IN ('started','ok','error')),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      payload TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trace_events_trace ON trace_events(trace_id);
    CREATE INDEX IF NOT EXISTS idx_trace_events_workspace ON trace_events(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_trace_events_run ON trace_events(run_id);
  `)
}
```

Wire it into the migration runner list: `if (currentVersion < <N>) { migrate_v<N>(db); recordVersion(<N>) }`.

ALTER TABLE on projects adds `CHECK` constraints — SQLite supports that. For ALTER TABLE that doesn't support CHECK, fall back to the `CREATE TABLE _new + INSERT SELECT + DROP + RENAME` pattern used elsewhere in this file.

- [ ] **Step 2.5: Run tests — should PASS**

- [ ] **Step 2.6: Commit**

```bash
git add packages/core/src/db/migrations.ts packages/core/src/tests/migrations.test.ts
git commit -m "feat(core): migration adds project columns, memories.task_id, trace_events (G-2, G-4, G-12 schema)"
```

---

## Task 3: ID prefixes

**Files:**
- Modify: `packages/core/src/ids.ts`
- Test: `packages/core/src/tests/ids.test.ts` (extend or create)

- [ ] **Step 3.1: Write failing tests**

```typescript
// packages/core/src/tests/ids.test.ts
import { describe, it, expect } from 'vitest'
import { newId } from '../ids.js'

describe('newId prefixes', () => {
  const cases: Array<[string, string]> = [
    ['subtask', 'subtask_'],
    ['cycle', 'cycle_'],
    ['milestone', 'mile_'],
    ['comment', 'cmt_'],
    ['status_event', 'sev_'],
    ['lock', 'lock_'],
    ['span', 'span_'],
  ]
  for (const [kind, prefix] of cases) {
    it(`${kind} → ${prefix}...`, () => {
      expect(newId(kind)).toMatch(new RegExp(`^${prefix}[0-9A-Z]{26}$`))
    })
  }
})
```

- [ ] **Step 3.2: Run — should FAIL**

- [ ] **Step 3.3: Add to the PREFIXES map in `ids.ts`**

```typescript
const PREFIXES: Record<string, string> = {
  // ...existing entries...
  subtask: 'subtask_',
  cycle: 'cycle_',
  milestone: 'mile_',
  comment: 'cmt_',
  status_event: 'sev_',
  lock: 'lock_',
  span: 'span_',
}
```

Also add display prefixes where applicable (`SUBTASK`, `CYC`, `MILE`, `CMT`).

- [ ] **Step 3.4: Run — should PASS**

- [ ] **Step 3.5: Commit**

```bash
git add packages/core/src/ids.ts packages/core/src/tests/ids.test.ts
git commit -m "feat(core): add subtask/cycle/milestone/comment/status_event/lock/span ID prefixes (G-15)"
```

---

## Task 4: Workspaces CRUD module

**Files:**
- Create: `packages/core/src/workspaces.ts`
- Create: `packages/core/src/tests/workspaces.test.ts`
- Modify: `packages/core/src/index.ts` (re-export)

- [ ] **Step 4.1: Write failing tests**

```typescript
// packages/core/src/tests/workspaces.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb, closeDb } from '../db/client.js'
import { runMigrations } from '../db/migrations.js'
import { createWorkspace, getWorkspace, listWorkspaces, updateWorkspace } from '../workspaces.js'
import { FulcrumError } from '../types.js'

describe('workspaces CRUD', () => {
  beforeEach(() => {
    closeDb()
    const db = new Database(':memory:')
    runMigrations(db)
    setDb(db)
  })

  it('createWorkspace inserts a row and returns it', async () => {
    const ws = await createWorkspace({ name: 'alpha' })
    expect(ws.workspace_id).toMatch(/^ws_[0-9A-Z]{26}$/)
    expect(ws.name).toBe('alpha')
    expect(ws.status).toBe('active')
    expect(ws.created_at).toBeTruthy()
  })

  it('accepts a caller-supplied workspace_id', async () => {
    const ws = await createWorkspace({ workspace_id: 'ws_explicit', name: 'beta' })
    expect(ws.workspace_id).toBe('ws_explicit')
  })

  it('rejects empty name', async () => {
    await expect(createWorkspace({ name: '' })).rejects.toThrow(FulcrumError)
  })

  it('is idempotent on the same workspace_id (INSERT OR IGNORE)', async () => {
    await createWorkspace({ workspace_id: 'ws_x', name: 'x' })
    const again = await createWorkspace({ workspace_id: 'ws_x', name: 'x' })
    expect(again.workspace_id).toBe('ws_x')
  })

  it('getWorkspace returns the row or null', async () => {
    const created = await createWorkspace({ name: 'alpha' })
    const got = await getWorkspace(created.workspace_id)
    expect(got?.name).toBe('alpha')
    expect(await getWorkspace('ws_missing')).toBeNull()
  })

  it('listWorkspaces returns all rows ordered by created_at DESC', async () => {
    await createWorkspace({ workspace_id: 'ws_1', name: 'one' })
    await createWorkspace({ workspace_id: 'ws_2', name: 'two' })
    const all = await listWorkspaces()
    expect(all.length).toBe(2)
    expect(all[0].workspace_id).toBe('ws_2') // newest first
  })

  it('updateWorkspace changes name and status', async () => {
    const ws = await createWorkspace({ name: 'original' })
    const updated = await updateWorkspace({ workspace_id: ws.workspace_id, name: 'renamed', status: 'archived' })
    expect(updated.name).toBe('renamed')
    expect(updated.status).toBe('archived')
  })

  it('updateWorkspace throws on missing workspace_id', async () => {
    await expect(updateWorkspace({ workspace_id: 'ws_missing', name: 'x' })).rejects.toThrow(FulcrumError)
  })
})
```

- [ ] **Step 4.2: Run — should FAIL**

- [ ] **Step 4.3: Implement**

```typescript
// packages/core/src/workspaces.ts
import { getDb } from './db/client.js'
import { newId } from './ids.js'
import { FulcrumError, type Workspace } from './types.js'

export interface CreateWorkspaceInput {
  name: string
  workspace_id?: string
}

export interface UpdateWorkspaceInput {
  workspace_id: string
  name?: string
  status?: 'active' | 'archived'
}

function rowToWorkspace(row: Record<string, unknown>): Workspace {
  return {
    workspace_id: row['workspace_id'] as string,
    name: row['name'] as string,
    status: row['status'] as 'active' | 'archived',
    created_at: row['created_at'] as string,
  }
}

export async function createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
  if (!input.name || !input.name.trim()) {
    throw new FulcrumError('name must not be empty', 'invalid_input')
  }
  const db = getDb()
  const workspace_id = input.workspace_id ?? newId('workspace')
  const now = new Date().toISOString()
  db.prepare(
    `INSERT OR IGNORE INTO workspaces (workspace_id, name, status, created_at)
     VALUES (?, ?, 'active', ?)`
  ).run(workspace_id, input.name, now)
  const row = db.prepare(`SELECT * FROM workspaces WHERE workspace_id = ?`).get(workspace_id) as Record<string, unknown>
  return rowToWorkspace(row)
}

export async function getWorkspace(workspace_id: string): Promise<Workspace | null> {
  const db = getDb()
  const row = db.prepare(`SELECT * FROM workspaces WHERE workspace_id = ?`).get(workspace_id) as Record<string, unknown> | undefined
  return row ? rowToWorkspace(row) : null
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const db = getDb()
  const rows = db.prepare(
    `SELECT * FROM workspaces ORDER BY created_at DESC LIMIT 500`
  ).all() as Record<string, unknown>[]
  return rows.map(rowToWorkspace)
}

export async function updateWorkspace(input: UpdateWorkspaceInput): Promise<Workspace> {
  const db = getDb()
  const existing = await getWorkspace(input.workspace_id)
  if (!existing) {
    throw new FulcrumError(`workspace not found: ${input.workspace_id}`, 'not_found')
  }
  const fields: string[] = []
  const values: unknown[] = []
  if (input.name !== undefined) {
    if (!input.name.trim()) throw new FulcrumError('name must not be empty', 'invalid_input')
    fields.push('name = ?')
    values.push(input.name)
  }
  if (input.status !== undefined) {
    fields.push('status = ?')
    values.push(input.status)
  }
  if (fields.length > 0) {
    values.push(input.workspace_id)
    db.prepare(`UPDATE workspaces SET ${fields.join(', ')} WHERE workspace_id = ?`).run(...values)
  }
  return (await getWorkspace(input.workspace_id))!
}
```

- [ ] **Step 4.4: Re-export from index**

```typescript
// In packages/core/src/index.ts, add:
export { createWorkspace, getWorkspace, listWorkspaces, updateWorkspace } from './workspaces.js'
export type { CreateWorkspaceInput, UpdateWorkspaceInput } from './workspaces.js'
```

- [ ] **Step 4.5: Run — should PASS**

- [ ] **Step 4.6: Commit**

```bash
git add packages/core/src/workspaces.ts packages/core/src/tests/workspaces.test.ts packages/core/src/index.ts
git commit -m "feat(core): add workspaces CRUD module (G-1 workspaces half)"
```

---

## Task 5: Projects CRUD module

**Files:**
- Create: `packages/core/src/projects.ts`
- Create: `packages/core/src/tests/projects.test.ts`
- Modify: `packages/core/src/index.ts` (re-export)

Depends on Task 2 (migration adds the columns) and Task 4 (workspace FK target).

- [ ] **Step 5.1: Write failing tests**

```typescript
// packages/core/src/tests/projects.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb, closeDb } from '../db/client.js'
import { runMigrations } from '../db/migrations.js'
import { createWorkspace } from '../workspaces.js'
import { createProject, getProject, listProjects, updateProject } from '../projects.js'
import { FulcrumError } from '../types.js'

describe('projects CRUD', () => {
  beforeEach(async () => {
    closeDb()
    const db = new Database(':memory:')
    runMigrations(db)
    setDb(db)
    await createWorkspace({ workspace_id: 'ws_1', name: 'w' })
  })

  it('createProject defaults type=git, status=active, write_mode=worktree', async () => {
    const p = await createProject({ workspace_id: 'ws_1', name: 'alpha' })
    expect(p.project_id).toMatch(/^proj_[0-9A-Z]{26}$/)
    expect(p.type).toBe('git')
    expect(p.status).toBe('active')
    expect(p.write_mode).toBe('worktree')
  })

  it('accepts non_git/submodule/logical types', async () => {
    const p = await createProject({ workspace_id: 'ws_1', name: 'logical', type: 'logical' })
    expect(p.type).toBe('logical')
  })

  it('rejects invalid type', async () => {
    await expect(createProject({ workspace_id: 'ws_1', name: 'bad', type: 'nope' as any }))
      .rejects.toThrow(FulcrumError)
  })

  it('rejects missing workspace (FK)', async () => {
    await expect(createProject({ workspace_id: 'ws_missing', name: 'x' })).rejects.toThrow()
  })

  it('listProjects filters by workspace_id', async () => {
    await createWorkspace({ workspace_id: 'ws_2', name: 'w2' })
    await createProject({ workspace_id: 'ws_1', name: 'p1' })
    await createProject({ workspace_id: 'ws_2', name: 'p2' })
    const rows = await listProjects({ workspace_id: 'ws_1' })
    expect(rows.length).toBe(1)
    expect(rows[0].name).toBe('p1')
  })

  it('updateProject archives and sets git_url', async () => {
    const p = await createProject({ workspace_id: 'ws_1', name: 'a' })
    const updated = await updateProject({
      project_id: p.project_id,
      status: 'archived',
      git_url: 'git@github.com:x/y.git',
    })
    expect(updated.status).toBe('archived')
    expect(updated.git_url).toBe('git@github.com:x/y.git')
  })

  it('rejects update of missing project', async () => {
    await expect(updateProject({ project_id: 'proj_missing', status: 'archived' }))
      .rejects.toThrow(FulcrumError)
  })
})
```

- [ ] **Step 5.2: Implement**

```typescript
// packages/core/src/projects.ts
import { getDb } from './db/client.js'
import { newId } from './ids.js'
import { FulcrumError, type ProjectStatus, type ProjectType, type WriteMode } from './types.js'

export interface Project {
  project_id: string
  workspace_id: string
  name: string
  type: ProjectType
  status: ProjectStatus
  write_mode: WriteMode
  git_url: string | null
  parent_project_id: string | null
  created_at: string
}

export interface CreateProjectInput {
  workspace_id: string
  name: string
  project_id?: string
  type?: ProjectType
  status?: ProjectStatus
  write_mode?: WriteMode
  git_url?: string
  parent_project_id?: string
}

export interface UpdateProjectInput {
  project_id: string
  name?: string
  type?: ProjectType
  status?: ProjectStatus
  write_mode?: WriteMode
  git_url?: string | null
  parent_project_id?: string | null
}

export interface ListProjectsInput {
  workspace_id?: string
  limit?: number
}

const VALID_TYPES: ProjectType[] = ['git', 'non_git', 'submodule', 'logical']
const VALID_STATUSES: ProjectStatus[] = ['active', 'archived', 'paused']
const VALID_WRITE_MODES: WriteMode[] = ['worktree', 'in_place', 'sequential']

function rowToProject(row: Record<string, unknown>): Project {
  return {
    project_id: row['project_id'] as string,
    workspace_id: row['workspace_id'] as string,
    name: row['name'] as string,
    type: row['type'] as ProjectType,
    status: row['status'] as ProjectStatus,
    write_mode: row['write_mode'] as WriteMode,
    git_url: (row['git_url'] as string) ?? null,
    parent_project_id: (row['parent_project_id'] as string) ?? null,
    created_at: row['created_at'] as string,
  }
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  if (!input.name || !input.name.trim()) {
    throw new FulcrumError('name must not be empty', 'invalid_input')
  }
  const type: ProjectType = input.type ?? 'git'
  const status: ProjectStatus = input.status ?? 'active'
  const write_mode: WriteMode = input.write_mode ?? 'worktree'
  if (!VALID_TYPES.includes(type)) throw new FulcrumError(`invalid type: ${type}`, 'invalid_input')
  if (!VALID_STATUSES.includes(status)) throw new FulcrumError(`invalid status: ${status}`, 'invalid_input')
  if (!VALID_WRITE_MODES.includes(write_mode)) throw new FulcrumError(`invalid write_mode: ${write_mode}`, 'invalid_input')

  const db = getDb()
  const project_id = input.project_id ?? newId('project')
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, git_url, parent_project_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    project_id, input.workspace_id, input.name,
    type, status, write_mode,
    input.git_url ?? null, input.parent_project_id ?? null,
    now,
  )
  const row = db.prepare(`SELECT * FROM projects WHERE project_id = ?`).get(project_id) as Record<string, unknown>
  return rowToProject(row)
}

export async function getProject(project_id: string): Promise<Project | null> {
  const db = getDb()
  const row = db.prepare(`SELECT * FROM projects WHERE project_id = ?`).get(project_id) as Record<string, unknown> | undefined
  return row ? rowToProject(row) : null
}

export async function listProjects(input: ListProjectsInput = {}): Promise<Project[]> {
  const db = getDb()
  const limit = input.limit ?? 200
  const rows = input.workspace_id
    ? db.prepare(`SELECT * FROM projects WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?`).all(input.workspace_id, limit) as Record<string, unknown>[]
    : db.prepare(`SELECT * FROM projects ORDER BY created_at DESC LIMIT ?`).all(limit) as Record<string, unknown>[]
  return rows.map(rowToProject)
}

export async function updateProject(input: UpdateProjectInput): Promise<Project> {
  const existing = await getProject(input.project_id)
  if (!existing) throw new FulcrumError(`project not found: ${input.project_id}`, 'not_found')
  const fields: string[] = []
  const values: unknown[] = []
  const setField = <K extends keyof UpdateProjectInput>(key: K, col: string, validator?: (v: unknown) => boolean): void => {
    if (input[key] === undefined) return
    if (validator && !validator(input[key])) throw new FulcrumError(`invalid ${col}`, 'invalid_input')
    fields.push(`${col} = ?`)
    values.push(input[key])
  }
  setField('name', 'name', (v) => typeof v === 'string' && v.trim().length > 0)
  setField('type', 'type', (v) => VALID_TYPES.includes(v as ProjectType))
  setField('status', 'status', (v) => VALID_STATUSES.includes(v as ProjectStatus))
  setField('write_mode', 'write_mode', (v) => VALID_WRITE_MODES.includes(v as WriteMode))
  setField('git_url', 'git_url')
  setField('parent_project_id', 'parent_project_id')
  if (fields.length > 0) {
    values.push(input.project_id)
    getDb().prepare(`UPDATE projects SET ${fields.join(', ')} WHERE project_id = ?`).run(...values)
  }
  return (await getProject(input.project_id))!
}
```

- [ ] **Step 5.3: Re-export from index, run tests, commit**

```bash
git add packages/core/src/projects.ts packages/core/src/tests/projects.test.ts packages/core/src/index.ts
git commit -m "feat(core): add projects CRUD with type/status/write_mode (G-1 projects half, G-2)"
```

---

## Task 6: Migrate CLI + monitor to use workspaces/projects modules

**Files:**
- Modify: `packages/cli/src/index.ts` (`runWorkspaces`, `runProjects`, `ensureProjectInitialized`)
- Modify: `packages/monitor/src/server.ts` (replace `ensureWorkspace`/`ensureProject` helpers with calls into core)

- [ ] **Step 6.1: Replace raw SQL in CLI**

In `runWorkspaces`, replace the `db.prepare('INSERT OR IGNORE INTO workspaces ...')` calls with `await createWorkspace({...})`. Same for `runProjects` → `createProject`. Use `listWorkspaces` / `listProjects` for the list paths.

In `ensureProjectInitialized`, replace the raw INSERT OR IGNORE with `createWorkspace` and `createProject` calls.

- [ ] **Step 6.2: Replace raw SQL in monitor**

`ensureWorkspace` and `ensureProject` in `packages/monitor/src/server.ts` become thin wrappers around `createWorkspace` / `createProject` imported from `@fulcrum/core`.

- [ ] **Step 6.3: Verify nothing broke**

```bash
pnpm -r test
```

- [ ] **Step 6.4: Commit**

```bash
git add packages/cli/src/index.ts packages/monitor/src/server.ts
git commit -m "refactor(cli,monitor): use core workspaces/projects CRUD instead of raw SQL (G-1 follow-through)"
```

---

## Task 7: MemoryScope 'task' + recallMemory project_id optional

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/memory.ts`
- Modify: `packages/monitor/src/server.ts` (POST /memory/recall)
- Test: `packages/core/src/tests/memory.test.ts` (extend)

- [ ] **Step 7.1: Write failing tests**

```typescript
// append to packages/core/src/tests/memory.test.ts
describe('recallMemory project_id optional (G-3)', () => {
  it('returns results scoped to the whole workspace when project_id is omitted', async () => {
    // Setup: two projects under the same workspace, a memory in each
    // Call recallMemory without project_id → both memories should be candidates
    // ...
  })
})

describe('MemoryScope task (G-4)', () => {
  it('writeMemory accepts task_id and scope=task', async () => {
    // ...
  })
  it('recallMemory filters by task_id when provided', async () => {
    // ...
  })
})
```

(Full test bodies written by the implementing subagent — use `writeMemory` / `recallMemory` existing test patterns.)

- [ ] **Step 7.2: Update types**

```typescript
// packages/core/src/types.ts
export type MemoryScope = 'global' | 'project' | 'file' | 'task'
```

Add `task_id?: string | null` to the `Memory` interface.

- [ ] **Step 7.3: Update `recallMemory` signature**

```typescript
export interface RecallMemoryInput {
  query: string
  workspace_id: string
  project_id?: string    // ← was required, now optional (G-3)
  task_id?: string       // ← new (G-4)
  limit?: number
}
```

In the SQL WHERE clause, drop the `m.project_id = ?` filter when `project_id` is absent. Add an `AND m.task_id = ?` clause when `task_id` is provided.

- [ ] **Step 7.4: Update `writeMemory`**

Accept optional `task_id`. Persist it to the `memories.task_id` column. Validate that `scope === 'task'` implies `task_id !== null` and vice versa.

- [ ] **Step 7.5: Update monitor endpoint**

In `packages/monitor/src/server.ts` POST /memory/recall, remove the "project_id required" validation.

- [ ] **Step 7.6: Run, commit**

```bash
git add packages/core/src/types.ts packages/core/src/memory.ts packages/core/src/tests/memory.test.ts packages/monitor/src/server.ts
git commit -m "feat(memory): optional project_id in recall, add 'task' scope (G-3, G-4)"
```

---

## Task 8: Advisory lock API

**Files:**
- Create: `packages/core/src/locks.ts`
- Create: `packages/core/src/tests/locks.test.ts`
- Modify: `packages/core/src/index.ts` (re-export)
- Modify: `packages/core/src/janitor.ts` (call `cleanupExpiredLocks`)

The `advisory_locks` table already exists in migrations; only the TypeScript API is missing.

- [ ] **Step 8.1: Inspect the existing schema**

```bash
grep -A 15 "advisory_locks" packages/core/src/db/migrations.ts
```
Note the column names.

- [ ] **Step 8.2: Write failing tests**

```typescript
// packages/core/src/tests/locks.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb, closeDb } from '../db/client.js'
import { runMigrations } from '../db/migrations.js'
import { acquireLock, releaseLock, listLocks, cleanupExpiredLocks } from '../locks.js'

describe('advisory locks', () => {
  beforeEach(() => {
    closeDb()
    const db = new Database(':memory:')
    runMigrations(db)
    setDb(db)
  })

  it('acquireLock returns lock_id on success', async () => {
    const result = await acquireLock({
      workspace_id: 'ws_1', resource_path: 'src/foo.ts', run_id: 'run_1', ttl_sec: 60,
    })
    expect(result.acquired).toBe(true)
    expect(result.lock_id).toMatch(/^lock_/)
  })

  it('a second acquire on the same resource returns acquired=false', async () => {
    await acquireLock({ workspace_id: 'ws_1', resource_path: 'src/foo.ts', run_id: 'run_1', ttl_sec: 60 })
    const second = await acquireLock({ workspace_id: 'ws_1', resource_path: 'src/foo.ts', run_id: 'run_2', ttl_sec: 60 })
    expect(second.acquired).toBe(false)
    expect(second.held_by).toBe('run_1')
  })

  it('releaseLock frees the resource', async () => {
    const first = await acquireLock({ workspace_id: 'ws_1', resource_path: 'src/foo.ts', run_id: 'run_1', ttl_sec: 60 })
    await releaseLock(first.lock_id!)
    const second = await acquireLock({ workspace_id: 'ws_1', resource_path: 'src/foo.ts', run_id: 'run_2', ttl_sec: 60 })
    expect(second.acquired).toBe(true)
  })

  it('listLocks returns active locks for a workspace', async () => {
    await acquireLock({ workspace_id: 'ws_1', resource_path: 'a', run_id: 'r1', ttl_sec: 60 })
    await acquireLock({ workspace_id: 'ws_1', resource_path: 'b', run_id: 'r2', ttl_sec: 60 })
    const locks = await listLocks('ws_1')
    expect(locks.length).toBe(2)
  })

  it('cleanupExpiredLocks removes rows with expires_at in the past', async () => {
    // acquire with ttl=0 so it's immediately expired
    await acquireLock({ workspace_id: 'ws_1', resource_path: 'x', run_id: 'r1', ttl_sec: 0 })
    const deleted = await cleanupExpiredLocks()
    expect(deleted).toBeGreaterThanOrEqual(1)
    expect((await listLocks('ws_1')).length).toBe(0)
  })
})
```

- [ ] **Step 8.3: Implement**

```typescript
// packages/core/src/locks.ts
import { getDb } from './db/client.js'
import { newId } from './ids.js'
import { DEFAULT_LOCK_TTL_SEC } from './constants.js'

export interface AcquireLockInput {
  workspace_id: string
  resource_path: string
  run_id: string
  ttl_sec?: number
}

export interface AcquireLockResult {
  acquired: boolean
  lock_id: string | null
  held_by: string | null
  expires_at: string | null
}

export interface Lock {
  lock_id: string
  workspace_id: string
  resource_path: string
  run_id: string
  acquired_at: string
  expires_at: string
}

function rowToLock(row: Record<string, unknown>): Lock {
  return {
    lock_id: row['lock_id'] as string,
    workspace_id: row['workspace_id'] as string,
    resource_path: row['resource_path'] as string,
    run_id: row['run_id'] as string,
    acquired_at: row['acquired_at'] as string,
    expires_at: row['expires_at'] as string,
  }
}

export async function acquireLock(input: AcquireLockInput): Promise<AcquireLockResult> {
  const db = getDb()
  const ttl = input.ttl_sec ?? DEFAULT_LOCK_TTL_SEC
  const nowMs = Date.now()
  const now = new Date(nowMs).toISOString()
  const expires = new Date(nowMs + ttl * 1000).toISOString()

  // Purge any stale lock on this resource first so re-acquisition works
  db.prepare(
    `DELETE FROM advisory_locks WHERE workspace_id = ? AND resource_path = ? AND expires_at < ?`
  ).run(input.workspace_id, input.resource_path, now)

  const existing = db.prepare(
    `SELECT * FROM advisory_locks WHERE workspace_id = ? AND resource_path = ? LIMIT 1`
  ).get(input.workspace_id, input.resource_path) as Record<string, unknown> | undefined

  if (existing) {
    return {
      acquired: false,
      lock_id: null,
      held_by: existing['run_id'] as string,
      expires_at: existing['expires_at'] as string,
    }
  }

  const lock_id = newId('lock')
  db.prepare(
    `INSERT INTO advisory_locks (lock_id, workspace_id, resource_path, run_id, acquired_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(lock_id, input.workspace_id, input.resource_path, input.run_id, now, expires)

  return { acquired: true, lock_id, held_by: input.run_id, expires_at: expires }
}

export async function releaseLock(lock_id: string): Promise<void> {
  getDb().prepare(`DELETE FROM advisory_locks WHERE lock_id = ?`).run(lock_id)
}

export async function listLocks(workspace_id: string): Promise<Lock[]> {
  const rows = getDb().prepare(
    `SELECT * FROM advisory_locks WHERE workspace_id = ? ORDER BY acquired_at DESC`
  ).all(workspace_id) as Record<string, unknown>[]
  return rows.map(rowToLock)
}

export async function cleanupExpiredLocks(): Promise<number> {
  const now = new Date().toISOString()
  const result = getDb().prepare(`DELETE FROM advisory_locks WHERE expires_at < ?`).run(now)
  return result.changes
}
```

Note: if the `advisory_locks` table doesn't match these column names, read the existing schema and adjust either the code or the migration.

- [ ] **Step 8.4: Wire janitor**

In `packages/core/src/janitor.ts`, inside the cycle function, add:
```typescript
import { cleanupExpiredLocks } from './locks.js'
// ... inside the cycle:
await cleanupExpiredLocks()
```

- [ ] **Step 8.5: Re-export, run, commit**

```bash
git add packages/core/src/locks.ts packages/core/src/tests/locks.test.ts packages/core/src/index.ts packages/core/src/janitor.ts
git commit -m "feat(core): advisory lock API + janitor cleanup (G-5)"
```

---

## Task 9: L1 no-direct-writes invariant

**Files:**
- Modify: `packages/policy/src/engine.ts`
- Modify: `packages/policy/src/tests/engine.test.ts`

- [ ] **Step 9.1: Write failing test**

```typescript
// In packages/policy/src/tests/engine.test.ts
describe('chief_of_staff_no_direct_writes (G-6)', () => {
  it('denies CoS calling tool_use:Write', () => {
    const decision = evaluatePolicy({
      action: 'tool_use:Write',
      resource: 'src/foo.ts',
      actor_role: 'chief_of_staff',
      actor_id: 'run_cos',
      workspace_id: 'ws_1',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.rule_id).toBe('SYSTEM:chief_of_staff_no_direct_writes')
  })

  it('denies CoS calling tool_use:Edit', () => {
    const decision = evaluatePolicy({
      action: 'tool_use:Edit',
      resource: 'src/foo.ts',
      actor_role: 'chief_of_staff',
      actor_id: 'run_cos',
      workspace_id: 'ws_1',
    })
    expect(decision.allowed).toBe(false)
  })

  it('denies CoS calling shell_exec:git commit', () => {
    const decision = evaluatePolicy({
      action: 'shell_exec:git commit',
      resource: 'git commit',
      actor_role: 'chief_of_staff',
      actor_id: 'run_cos',
      workspace_id: 'ws_1',
    })
    expect(decision.allowed).toBe(false)
  })

  it('allows non-CoS roles to call Write', () => {
    const decision = evaluatePolicy({
      action: 'tool_use:Write',
      resource: 'src/foo.ts',
      actor_role: 'software_engineer',
      actor_id: 'run_se',
      workspace_id: 'ws_1',
    })
    expect(decision.allowed).toBe(true)
  })
})
```

- [ ] **Step 9.2: Add invariant to `SYSTEM_INVARIANTS`**

```typescript
{
  name: 'chief_of_staff_no_direct_writes',
  priority: 1000,
  action: 'deny',
  rule_id: 'SYSTEM:chief_of_staff_no_direct_writes',
  check: (input) => {
    if (input.actor_role !== 'chief_of_staff') return false
    const DENIED_PREFIXES = [
      'tool_use:Write',
      'tool_use:Edit',
      'tool_use:NotebookEdit',
      'tool_use:MultiEdit',
      'shell_exec:git',
    ]
    return DENIED_PREFIXES.some(prefix => input.action === prefix || input.action.startsWith(prefix + ' '))
  },
},
```

- [ ] **Step 9.3: Run, commit**

```bash
git add packages/policy/src/engine.ts packages/policy/src/tests/engine.test.ts
git commit -m "feat(policy): chief_of_staff_no_direct_writes system invariant (G-6)"
```

---

## Task 10: Run event journal

**Files:**
- Modify: `packages/core/src/runs.ts`
- Test: `packages/core/src/tests/runs.test.ts` (extend)

- [ ] **Step 10.1: Write failing test**

```typescript
describe('run event journal (G-7)', () => {
  it('appends heartbeat events', async () => {
    const run = await startAgentRun({ /* ... */ })
    await heartbeatAgentRun({ run_id: run.run_id, current_step: 'editing' })
    const status = await getAgentRunStatus({ run_id: run.run_id })
    const events = JSON.parse((status as any).events ?? '[]')
    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(events[events.length - 1].event_type).toBe('heartbeat')
    expect(events[events.length - 1].payload.current_step).toBe('editing')
  })

  it('appends completed event with output summary', async () => {
    const run = await startAgentRun({ /* ... */ })
    await completeAgentRun({ run_id: run.run_id, summary: 'done' })
    const status = await getAgentRunStatus({ run_id: run.run_id })
    const events = JSON.parse((status as any).events ?? '[]')
    expect(events.some((e: any) => e.event_type === 'completed')).toBe(true)
  })

  it('appends blocked event with reason', async () => { /* ... */ })
  it('appends escalated event', async () => { /* ... */ })
})
```

- [ ] **Step 10.2: Add helper**

```typescript
// packages/core/src/runs.ts (near the top)
function appendRunEvent(run_id: string, event_type: string, payload: Record<string, unknown> = {}): void {
  const db = getDb()
  const row = db.prepare(`SELECT events FROM agent_runs WHERE run_id = ?`).get(run_id) as { events: string | null } | undefined
  if (!row) return
  const events: Array<{ ts: string; event_type: string; payload: Record<string, unknown> }> =
    row.events ? JSON.parse(row.events) : []
  events.push({ ts: new Date().toISOString(), event_type, payload })
  db.prepare(`UPDATE agent_runs SET events = ? WHERE run_id = ?`).run(JSON.stringify(events), run_id)
}
```

Call `appendRunEvent(run_id, 'heartbeat', { current_step, progress_pct })` at the end of `heartbeatAgentRun`. Similarly `completed`, `blocked`, `escalated` at the end of their respective functions.

`startAgentRun` should seed the events column with `[{ts, event_type: 'started', payload: { agent_role }}]`.

- [ ] **Step 10.3: Run, commit**

```bash
git add packages/core/src/runs.ts packages/core/src/tests/runs.test.ts
git commit -m "feat(runs): append to events journal on every lifecycle transition (G-7)"
```

---

## Task 11: Stale runs excluded from WIP

**Files:**
- Modify: `packages/core/src/policy.ts` (if needed)
- Test: `packages/core/src/tests/policy.test.ts` (extend)

- [ ] **Step 11.1: Write the test first (may pass already)**

```typescript
describe('checkPolicy stale exclusion (G-8)', () => {
  it('stale runs are not counted toward WIP', async () => {
    // create 3 running runs (max WIP)
    // transition one to stale
    // verify checkPolicy allows a new run
  })
})
```

- [ ] **Step 11.2: If test fails, fix `checkPolicy` query**

The WIP-counting query should filter `WHERE status = 'running'` — stale runs have `status = 'stale'`, so they're already excluded. If the test passes without changes, just commit the test.

- [ ] **Step 11.3: Commit**

```bash
git add packages/core/src/tests/policy.test.ts packages/core/src/policy.ts
git commit -m "test(policy): verify stale runs are excluded from WIP count (G-8)"
```

---

## Task 12: Weighted hybrid ranking in recall

**Files:**
- Modify: `packages/core/src/memory.ts`
- Test: `packages/core/src/tests/memory.test.ts`

- [ ] **Step 12.1: Write failing test**

```typescript
describe('§10.7 weighted ranking (G-10)', () => {
  it('score combines semantic*0.4 + lexical*0.3 + recency*0.2 + confidence*0.1', async () => {
    // Write three memories with differing (semanticScore, lexicalScore, age, confidence)
    // Call recallMemory and verify ordering matches the weighted sum
  })
})
```

- [ ] **Step 12.2: Implement weighted ranking**

In `recallMemory`, after the FTS5 and dense searches produce candidate scores, compute:

```typescript
import { MEMORY_RANK_WEIGHTS } from './constants.js'

function recencyScore(created_at: string): number {
  const ageMs = Date.now() - new Date(created_at).getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)
  return Math.exp(-ageDays / 30) // exponential decay, half-life ~21 days
}

function weightedScore(opts: {
  semantic: number
  lexical: number
  recency: number
  confidence: number
}): number {
  return (
    opts.semantic * MEMORY_RANK_WEIGHTS.semantic +
    opts.lexical * MEMORY_RANK_WEIGHTS.lexical +
    opts.recency * MEMORY_RANK_WEIGHTS.recency +
    opts.confidence * MEMORY_RANK_WEIGHTS.confidence
  )
}
```

Normalize `semantic`, `lexical`, `confidence` into [0, 1] before combining. Use `weightedScore` to sort the merged candidate list. Run reranker on the top-N and update `semantic` with the reranker's score, then re-sort.

- [ ] **Step 12.3: Run, commit**

```bash
git add packages/core/src/memory.ts packages/core/src/tests/memory.test.ts
git commit -m "feat(memory): §10.7 weighted hybrid ranking in recall (G-10)"
```

---

## Task 13: Embedding init at server startup

**Files:**
- Modify: `packages/cli/src/index.ts` (`runServeMcp`, `runServeMonitor`)

- [ ] **Step 13.1: Call initEmbedding**

At the top of each function (before the dispatch loop for MCP, before `startMonitorServer` for monitor):

```typescript
const { initEmbedding } = await import('@fulcrum/core')
try {
  await initEmbedding()
  process.stderr.write('[fulcrum] embedding model ready\n')
} catch (err) {
  process.stderr.write(`[fulcrum] embedding init failed: ${(err as Error).message}\n`)
  process.exit(1)
}
```

- [ ] **Step 13.2: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "feat(cli): warm embedding model at serve startup (G-14)"
```

---

## Task 14: Handoff types tightening

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/handoffs.ts` (if it uses `handoff_mode` as a bare string)
- Test: `packages/core/src/tests/handoffs.test.ts`

- [ ] **Step 14.1: Define `HandoffMode` enum type**

```typescript
// packages/core/src/types.ts
export type HandoffMode = 'sync' | 'async' | 'review' | 'escalate'

export interface HandoffPacket {
  // ...
  done_criteria?: string[]   // ← was string | undefined
  handoff_mode: HandoffMode  // ← was string
  // ...
}
```

- [ ] **Step 14.2: Update `CreateHandoffInput` to match**

- [ ] **Step 14.3: Update `handoffs.ts` to validate**

```typescript
const VALID_MODES: HandoffMode[] = ['sync', 'async', 'review', 'escalate']
if (!VALID_MODES.includes(input.handoff_mode as HandoffMode)) {
  throw new FulcrumError(`invalid handoff_mode: ${input.handoff_mode}`, 'invalid_input')
}
```

- [ ] **Step 14.4: Add test, commit**

```bash
git add packages/core/src/types.ts packages/core/src/handoffs.ts packages/core/src/tests/handoffs.test.ts
git commit -m "feat(handoffs): tighten HandoffMode enum + done_criteria array (G-13)"
```

---

## Task 15: Telemetry spans scaffold

**Files:**
- Create: `packages/core/src/telemetry/spans.ts`
- Create: `packages/core/src/tests/telemetry.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/types.ts` (add `TelemetrySpan` type)

Depends on Task 2 migration (`trace_events` table).

- [ ] **Step 15.1: Add type**

```typescript
// packages/core/src/types.ts
export interface TelemetrySpan {
  span_id: string
  trace_id: string
  parent_span_id: string | null
  name: string
  workspace_id: string
  run_id: string | null
  status: 'started' | 'ok' | 'error'
  started_at: string
  ended_at: string | null
  payload: Record<string, unknown> | null
}
```

- [ ] **Step 15.2: Write failing test**

```typescript
// packages/core/src/tests/telemetry.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb, closeDb } from '../db/client.js'
import { runMigrations } from '../db/migrations.js'
import { createWorkspace } from '../workspaces.js'
import { startSpan, endSpan, getTrace } from '../telemetry/spans.js'

describe('telemetry spans (G-12)', () => {
  beforeEach(async () => {
    closeDb()
    const db = new Database(':memory:')
    runMigrations(db)
    setDb(db)
    await createWorkspace({ workspace_id: 'ws_1', name: 'w' })
  })

  it('startSpan creates a row with status=started', async () => {
    const span = await startSpan({ name: 'plan', workspace_id: 'ws_1' })
    expect(span.span_id).toMatch(/^span_/)
    expect(span.trace_id).toMatch(/^span_/) // when no parent, trace_id = span_id
    expect(span.status).toBe('started')
    expect(span.ended_at).toBeNull()
  })

  it('child span inherits trace_id from parent', async () => {
    const parent = await startSpan({ name: 'workflow', workspace_id: 'ws_1' })
    const child = await startSpan({ name: 'step', workspace_id: 'ws_1', parent_span_id: parent.span_id })
    expect(child.trace_id).toBe(parent.trace_id)
    expect(child.parent_span_id).toBe(parent.span_id)
  })

  it('endSpan updates status and ended_at', async () => {
    const span = await startSpan({ name: 'task', workspace_id: 'ws_1' })
    await endSpan({ span_id: span.span_id, status: 'ok' })
    const trace = await getTrace(span.trace_id)
    expect(trace[0].status).toBe('ok')
    expect(trace[0].ended_at).not.toBeNull()
  })

  it('getTrace returns all spans in a trace ordered by started_at', async () => {
    const root = await startSpan({ name: 'root', workspace_id: 'ws_1' })
    await startSpan({ name: 'child1', workspace_id: 'ws_1', parent_span_id: root.span_id })
    await startSpan({ name: 'child2', workspace_id: 'ws_1', parent_span_id: root.span_id })
    const spans = await getTrace(root.trace_id)
    expect(spans.length).toBe(3)
    expect(spans[0].name).toBe('root')
  })
})
```

- [ ] **Step 15.3: Implement**

```typescript
// packages/core/src/telemetry/spans.ts
import { getDb } from '../db/client.js'
import { newId } from '../ids.js'
import type { TelemetrySpan } from '../types.js'

export interface StartSpanInput {
  name: string
  workspace_id: string
  parent_span_id?: string
  run_id?: string
  payload?: Record<string, unknown>
}

export interface EndSpanInput {
  span_id: string
  status: 'ok' | 'error'
  payload?: Record<string, unknown>
}

function rowToSpan(row: Record<string, unknown>): TelemetrySpan {
  return {
    span_id: row['span_id'] as string,
    trace_id: row['trace_id'] as string,
    parent_span_id: (row['parent_span_id'] as string) ?? null,
    name: row['name'] as string,
    workspace_id: row['workspace_id'] as string,
    run_id: (row['run_id'] as string) ?? null,
    status: row['status'] as TelemetrySpan['status'],
    started_at: row['started_at'] as string,
    ended_at: (row['ended_at'] as string) ?? null,
    payload: row['payload'] ? JSON.parse(row['payload'] as string) : null,
  }
}

export async function startSpan(input: StartSpanInput): Promise<TelemetrySpan> {
  const db = getDb()
  const span_id = newId('span')
  let trace_id = span_id
  if (input.parent_span_id) {
    const parent = db.prepare(`SELECT trace_id FROM trace_events WHERE span_id = ?`).get(input.parent_span_id) as { trace_id: string } | undefined
    if (parent) trace_id = parent.trace_id
  }
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO trace_events (span_id, trace_id, parent_span_id, name, workspace_id, run_id, status, started_at, ended_at, payload)
     VALUES (?, ?, ?, ?, ?, ?, 'started', ?, NULL, ?)`
  ).run(
    span_id, trace_id, input.parent_span_id ?? null, input.name,
    input.workspace_id, input.run_id ?? null, now,
    input.payload ? JSON.stringify(input.payload) : null,
  )
  const row = db.prepare(`SELECT * FROM trace_events WHERE span_id = ?`).get(span_id) as Record<string, unknown>
  return rowToSpan(row)
}

export async function endSpan(input: EndSpanInput): Promise<void> {
  const now = new Date().toISOString()
  getDb().prepare(
    `UPDATE trace_events SET status = ?, ended_at = ?, payload = COALESCE(?, payload) WHERE span_id = ?`
  ).run(input.status, now, input.payload ? JSON.stringify(input.payload) : null, input.span_id)
}

export async function getTrace(trace_id: string): Promise<TelemetrySpan[]> {
  const rows = getDb().prepare(
    `SELECT * FROM trace_events WHERE trace_id = ? ORDER BY started_at ASC`
  ).all(trace_id) as Record<string, unknown>[]
  return rows.map(rowToSpan)
}
```

- [ ] **Step 15.4: Re-export, run, commit**

```bash
git add packages/core/src/telemetry/ packages/core/src/tests/telemetry.test.ts packages/core/src/types.ts packages/core/src/index.ts
git commit -m "feat(core): telemetry spans scaffold (G-12)"
```

---

## Task 16: Role prompt files

**Files:**
- Create: `agent-integration/roles/chief_of_staff.md`
- Create: `agent-integration/roles/software_engineer.md`
- Create: `agent-integration/roles/integration_worker.md`
- Create: `agent-integration/roles/code_reviewer.md`
- Create: `agent-integration/roles/security_reviewer.md`
- Create: `agent-integration/roles/tech_lead.md`
- Create: `agent-integration/roles/README.md`
- Modify: `packages/core/src/status.ts` — `listAgentProfiles` reads descriptions from these files

Content templates: start from the Python versions at `/home/mkh/workspace/pi-python-ref/src/pi_agent_os/pi_agents/` where they exist (chief_of_staff, implementer_backend, implementer_frontend, integration_worker). Consolidate backend/frontend into `software_engineer.md`. For roles without a Python equivalent (code_reviewer, security_reviewer, tech_lead), write a short one from the role's responsibilities in `agent-integration/claude/CLAUDE.md`.

- [ ] **Step 16.1: Read Python originals**
```bash
ls /home/mkh/workspace/pi-python-ref/src/pi_agent_os/pi_agents/
cat /home/mkh/workspace/pi-python-ref/src/pi_agent_os/pi_agents/chief_of_staff.md
```

- [ ] **Step 16.2: Create each role file**

Each file follows this structure:
```markdown
# {Role Name} ({role_slug})

## Purpose
{one paragraph}

## Responsibilities
- {bullet}

## Prohibitions
- {bullet}

## Tools / Capabilities
- {bullet}

## Response format
{if applicable — e.g. CoS Status/Work Completed/Next Steps/Blockers}
```

- [ ] **Step 16.3: Wire `listAgentProfiles`**

In `packages/core/src/status.ts`, read the role file at module init and cache the description per role:

```typescript
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const ROLES_DIR = (() => {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    return path.resolve(here, '..', '..', '..', '..', 'agent-integration', 'roles')
  } catch { return '' }
})()

function loadRoleDescription(role: string): string | null {
  if (!ROLES_DIR) return null
  const p = path.join(ROLES_DIR, `${role}.md`)
  if (!existsSync(p)) return null
  const content = readFileSync(p, 'utf8')
  const match = content.match(/## Purpose\n(.+?)(?=\n##|\n$)/s)
  return match ? match[1].trim() : null
}
```

Use the loaded description when constructing each entry in `listAgentProfiles`.

- [ ] **Step 16.4: Write test**

```typescript
describe('listAgentProfiles uses role MD files (G-11)', () => {
  it('chief_of_staff profile description matches Purpose from chief_of_staff.md', async () => {
    const profiles = await listAgentProfiles()
    const cos = profiles.find(p => p.role === 'chief_of_staff')
    expect(cos?.description).toMatch(/orchestrat|L1|chief/i)
  })
})
```

- [ ] **Step 16.5: Commit**

```bash
git add agent-integration/roles/ packages/core/src/status.ts packages/core/src/tests/status.test.ts
git commit -m "feat(roles): ship role prompt MDs, listAgentProfiles reads from them (G-11)"
```

---

## Task 17: MemoryKind 14th-value audit

**Files:**
- Read: `/home/mkh/workspace/pi-python-ref/pi_local_first_agent_os_spec.md` §10.5
- Possibly modify: `packages/core/src/types.ts`, `packages/core/src/db/migrations.ts`

- [ ] **Step 17.1: Find §10.5 in the spec**

```bash
grep -n "^##.*10\.5\|MemoryKind\|14" /home/mkh/workspace/pi-python-ref/pi_local_first_agent_os_spec.md
```
Read the section.

- [ ] **Step 17.2: Decide**

- If the spec lists 14 and we have 13, add the missing one (likely `insight`, `research`, or `pattern`).
- If the spec doesn't clearly list 14, close this task as "spec ambiguous, current 13 is fine".

- [ ] **Step 17.3: If adding, update types + schema CHECK + test**

```typescript
export type MemoryKind =
  | 'fact' | 'summary' | 'symbol' | 'decision' | 'procedure'
  | 'error' | 'diff' | 'doc' | 'code' | 'task_goal'
  | 'task_decision' | 'task_failure' | 'task_outcome'
  | 'insight'  // ← new
```

Update the CHECK constraint in the schema in a new migration.

- [ ] **Step 17.4: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/db/migrations.ts packages/core/src/tests/memory.test.ts
git commit -m "feat(memory): add 14th MemoryKind per spec §10.5 (G-16)"
```

---

## Self-Review Checklist

Before executing, verify:

1. **Spec coverage**: Every G-item in `docs/gap-analysis/phase-1-validated.md` is addressed by a task in this plan:
   - G-1 → Task 4, 5, 6
   - G-2 → Task 2, 5
   - G-3 → Task 7
   - G-4 → Task 2, 7
   - G-5 → Task 8
   - G-6 → Task 9
   - G-7 → Task 10
   - G-8 → Task 11
   - G-9 → Task 1
   - G-10 → Task 12
   - G-11 → Task 16
   - G-12 → Task 2, 15
   - G-13 → Task 14
   - G-14 → Task 13
   - G-15 → Task 3
   - G-16 → Task 17

2. **No placeholders**: Every task has real code and file paths.

3. **Sequencing**: Tasks 4, 5 depend on Task 2 (migration). Task 8 depends on Task 1 (DEFAULT_LOCK_TTL_SEC). Task 15 depends on Task 2 (trace_events table) and Task 3 (span_ prefix). Task 6 depends on Tasks 4 and 5. Task 12 depends on Task 1 (MEMORY_RANK_WEIGHTS).

4. **Ordering suggestion for subagent dispatch**:
   Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 →
   Task 7 → Task 8 → Task 9 → Task 10 → Task 11 →
   Task 12 → Task 13 → Task 14 → Task 15 → Task 16 → Task 17

## Execution handoff

Use superpowers:subagent-driven-development. Dispatch a fresh subagent per task in the order above. Each subagent should:
1. Read only this plan's relevant task section, `docs/gap-analysis/phase-1-validated.md` for context, and the files listed in that task's "Files" section.
2. Write the failing test first, run it to confirm failure, implement, run again to confirm pass, commit.
3. Report DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED.

After all 17 tasks are complete, trigger Task #122 from the top-level task list: Round 2 fresh gap analysis. Fresh subagents, no Round 1 context.
