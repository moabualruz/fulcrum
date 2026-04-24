# fulcrum-workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `fulcrum-workflows` package — a DAG-based workflow engine with 17 step types, 4 hardcoded built-in workflow definitions, and a full run lifecycle (start → step → wait → resume → complete/cancel).

**Architecture:** New `packages/workflows/` package depends on `fulcrum-core` for DB access and `nextDisplayId()`. A `WorkflowRegistry` (registry.ts) holds the 4 built-in definitions plus any loaded custom YAML definitions. A pure DAG engine (engine.ts) computes `nextReadySteps()` from step dependency graphs with no side effects. The public API in `workflows.ts` orchestrates DB persistence, registry lookups, and engine calls. `steps` and `handoff_refs`/`artifact_refs` columns are JSON-serialised arrays.

**Tech Stack:** TypeScript ESM, better-sqlite3, ulidx, vitest (pool: 'forks')

---

## File Structure

```
packages/workflows/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    types.ts
    schema.ts         — runMigration006Workflows(db)
    registry.ts       — WorkflowRegistry class + BUILTIN_WORKFLOWS
    engine.ts         — nextReadySteps(), computeStatusCategory()
    workflows.ts      — all 6 public functions
    index.ts          — re-exports
    tests/
      helpers.ts
      workflows.test.ts
```

---

## Task 1: Scaffold package

**Files:**
- Create: `packages/workflows/package.json`
- Create: `packages/workflows/tsconfig.json`
- Create: `packages/workflows/vitest.config.ts`
- Create: `packages/workflows/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "fulcrum-workflows",
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
    "fulcrum-core": "workspace:*",
    "ulidx": "^2.0.0"
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

Save to `packages/workflows/package.json`.

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

Save to `packages/workflows/tsconfig.json`.

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

Save to `packages/workflows/vitest.config.ts`.

- [ ] **Step 4: Create empty src/index.ts**

```typescript
// exports added as each module is implemented
```

Save to `packages/workflows/src/index.ts`.

- [ ] **Step 5: Install dependencies**

```bash
cd /home/mkh/workspace/pi-stack-plan
pnpm install
```

Expected: `fulcrum-workflows` appears in workspace. No errors.

- [ ] **Step 6: Commit**

```bash
git add packages/workflows/package.json packages/workflows/tsconfig.json packages/workflows/vitest.config.ts packages/workflows/src/index.ts
git commit -m "chore(workflows): scaffold fulcrum-workflows package"
```

---

## Task 2: Types

**Files:**
- Create: `packages/workflows/src/types.ts`

- [ ] **Step 1: Write types.ts**

```typescript
// packages/workflows/src/types.ts

export type WorkflowStepType =
  | 'prompt_user' | 'read_memory' | 'write_memory' | 'spawn_agent'
  | 'create_task' | 'create_issue' | 'write_artifact' | 'read_artifact'
  | 'evaluate_policy' | 'search_web' | 'search_code' | 'run_tool'
  | 'wait_for_task' | 'wait_for_review' | 'branch' | 'parallel' | 'complete'

export interface WorkflowStepDef {
  step_id: string
  step_type: WorkflowStepType
  name: string
  config: Record<string, unknown>
  depends_on?: string[]
  max_retries?: number
  timeout_ms?: number
}

export interface WorkflowStepState {
  step_id: string
  status: 'pending' | 'running' | 'waiting' | 'completed' | 'failed' | 'skipped'
  result?: unknown
  error?: string
  attempts: number
  started_at?: string
  completed_at?: string
}

export interface WorkflowDefinition {
  name: string
  version: string
  description?: string
  steps: WorkflowStepDef[]
}

export interface WorkflowRun {
  wf_id: string
  workspace_id: string
  project_id?: string
  display_id: string
  workflow_name: string
  workflow_version: string
  status: 'created' | 'ready' | 'running' | 'waiting_input' | 'waiting_dependency' | 'blocked' | 'failed' | 'completed' | 'cancelled'
  status_category: 'backlog' | 'active' | 'blocked' | 'done'
  task_id?: string
  issue_id?: string
  steps: WorkflowStepState[]
  current_step_id?: string
  handoff_refs: string[]
  artifact_refs: string[]
  error?: string
  version: number
  created_at: string
  updated_at: string
  started_at?: string
  completed_at?: string
}

export interface StartWorkflowInput {
  workflow_name: string
  workspace_id: string
  project_id?: string
  task_id?: string
  issue_id?: string
  inputs?: Record<string, unknown>
}

export interface StepWorkflowInput {
  wf_id: string
  step_id: string
  result?: unknown
  error?: string
}

export interface ResumeWorkflowInput {
  wf_id: string
  resume_data?: unknown
}

export interface CancelWorkflowInput {
  wf_id: string
  reason?: string
}

export interface GetWorkflowRunInput {
  wf_id: string
}
```

Save to `packages/workflows/src/types.ts`.

- [ ] **Step 2: Commit**

```bash
git add packages/workflows/src/types.ts
git commit -m "feat(workflows): add types for WorkflowRun, WorkflowStepDef, WorkflowStepState, all inputs"
```

---

## Task 3: Schema (MIGRATION_006 workflows portion)

**Files:**
- Create: `packages/workflows/src/schema.ts`

- [ ] **Step 1: Write schema.ts**

```typescript
// packages/workflows/src/schema.ts
import type Database from 'better-sqlite3'

const MIGRATION_006_WORKFLOWS = `
CREATE TABLE IF NOT EXISTS workflow_runs (
  wf_id            TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id       TEXT REFERENCES projects(project_id),
  display_id       TEXT NOT NULL,
  workflow_name    TEXT NOT NULL,
  workflow_version TEXT NOT NULL DEFAULT '1.0',
  status           TEXT NOT NULL DEFAULT 'created'
    CHECK(status IN ('created','ready','running','waiting_input','waiting_dependency',
                     'blocked','failed','completed','cancelled')),
  status_category  TEXT NOT NULL DEFAULT 'active'
    CHECK(status_category IN ('backlog','active','blocked','done')),
  task_id          TEXT REFERENCES tasks(task_id),
  issue_id         TEXT REFERENCES issues(issue_id),
  steps            TEXT NOT NULL DEFAULT '[]',
  current_step_id  TEXT,
  handoff_refs     TEXT NOT NULL DEFAULT '[]',
  artifact_refs    TEXT NOT NULL DEFAULT '[]',
  error            TEXT,
  version          INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  started_at       TEXT,
  completed_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_wf_runs_workspace ON workflow_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wf_runs_status    ON workflow_runs(status_category);
`

export function runMigration006Workflows(db: Database.Database): void {
  db.exec(MIGRATION_006_WORKFLOWS)
  db.prepare(`INSERT OR IGNORE INTO schema_migrations(name) VALUES ('006_workflows')`).run()
}
```

Save to `packages/workflows/src/schema.ts`.

- [ ] **Step 2: Commit**

```bash
git add packages/workflows/src/schema.ts
git commit -m "feat(workflows): add MIGRATION_006 workflows schema — workflow_runs table with indexes"
```

---

## Task 4: Registry

**Files:**
- Create: `packages/workflows/src/registry.ts`

- [ ] **Step 1: Write registry.ts**

```typescript
// packages/workflows/src/registry.ts
import type { WorkflowDefinition } from './types.js'

const BUILTIN_WORKFLOWS: WorkflowDefinition[] = [
  {
    name: 'grill-me',
    version: '1.0',
    description: 'Interactive discovery — ask questions, search, write to memory',
    steps: [
      { step_id: 'ask', step_type: 'prompt_user', name: 'Ask discovery questions', config: {} },
      { step_id: 'search', step_type: 'search_web', name: 'Search for context', config: {}, depends_on: ['ask'] },
      { step_id: 'recall', step_type: 'read_memory', name: 'Read relevant memory', config: {}, depends_on: ['ask'] },
      { step_id: 'save', step_type: 'write_memory', name: 'Write findings to memory', config: {}, depends_on: ['search', 'recall'] },
      { step_id: 'done', step_type: 'complete', name: 'Complete', config: {}, depends_on: ['save'] },
    ],
  },
  {
    name: 'write-a-prd',
    version: '1.0',
    description: 'PRD generation from memory + user input',
    steps: [
      { step_id: 'recall', step_type: 'read_memory', name: 'Read context memory', config: {} },
      { step_id: 'prompt', step_type: 'prompt_user', name: 'Gather requirements', config: {}, depends_on: ['recall'] },
      { step_id: 'agent', step_type: 'spawn_agent', name: 'Spawn prd_planner', config: { role: 'prd_planner' }, depends_on: ['prompt'] },
      { step_id: 'artifact', step_type: 'write_artifact', name: 'Write PRD artifact', config: { artifact_type: 'prd' }, depends_on: ['agent'] },
      { step_id: 'save', step_type: 'write_memory', name: 'Store PRD in memory', config: {}, depends_on: ['artifact'] },
      { step_id: 'done', step_type: 'complete', name: 'Complete', config: {}, depends_on: ['save'] },
    ],
  },
  {
    name: 'prd-to-plan',
    version: '1.0',
    description: 'Generate implementation plan from PRD',
    steps: [
      { step_id: 'recall', step_type: 'read_memory', name: 'Read PRD from memory', config: { kind: 'prd' } },
      { step_id: 'agent', step_type: 'spawn_agent', name: 'Spawn implementation_planner', config: { role: 'implementation_planner' }, depends_on: ['recall'] },
      { step_id: 'tasks', step_type: 'create_task', name: 'Create tasks from plan', config: { multi: true }, depends_on: ['agent'] },
      { step_id: 'artifact', step_type: 'write_artifact', name: 'Write plan artifact', config: { artifact_type: 'plan' }, depends_on: ['tasks'] },
      { step_id: 'done', step_type: 'complete', name: 'Complete', config: {}, depends_on: ['artifact'] },
    ],
  },
  {
    name: 'prd-to-issues',
    version: '1.0',
    description: 'Decompose PRD into issues',
    steps: [
      { step_id: 'recall', step_type: 'read_memory', name: 'Read PRD from memory', config: { kind: 'prd' } },
      { step_id: 'agent', step_type: 'spawn_agent', name: 'Spawn issue_decomposer', config: { role: 'issue_decomposer' }, depends_on: ['recall'] },
      { step_id: 'issues', step_type: 'create_issue', name: 'Create issues', config: { multi: true }, depends_on: ['agent'] },
      { step_id: 'done', step_type: 'complete', name: 'Complete', config: {}, depends_on: ['issues'] },
    ],
  },
]

export class WorkflowRegistry {
  private readonly definitions = new Map<string, WorkflowDefinition>()

  constructor() {
    for (const def of BUILTIN_WORKFLOWS) {
      this.definitions.set(def.name, def)
    }
  }

  getDefinition(name: string): WorkflowDefinition | undefined {
    return this.definitions.get(name)
  }

  register(def: WorkflowDefinition): void {
    this.definitions.set(def.name, def)
  }

  listAll(): WorkflowDefinition[] {
    return Array.from(this.definitions.values())
  }
}

// Singleton registry shared across all calls in this process
export const registry = new WorkflowRegistry()
```

Save to `packages/workflows/src/registry.ts`.

- [ ] **Step 2: Commit**

```bash
git add packages/workflows/src/registry.ts
git commit -m "feat(workflows): add WorkflowRegistry with 4 built-in workflow definitions"
```

---

## Task 5: DAG engine

**Files:**
- Create: `packages/workflows/src/engine.ts`

- [ ] **Step 1: Write engine.ts**

```typescript
// packages/workflows/src/engine.ts
import type { WorkflowStepDef, WorkflowStepState } from './types.js'

/**
 * Returns the step_ids that are ready to run:
 * - step itself is 'pending'
 * - all depends_on steps are 'completed'
 */
export function nextReadySteps(
  states: WorkflowStepState[],
  defs: WorkflowStepDef[]
): string[] {
  const stateMap = new Map<string, WorkflowStepState>()
  for (const s of states) {
    stateMap.set(s.step_id, s)
  }

  const ready: string[] = []
  for (const def of defs) {
    const state = stateMap.get(def.step_id)
    if (!state || state.status !== 'pending') continue

    const deps = def.depends_on ?? []
    const allDepsComplete = deps.every(depId => {
      const depState = stateMap.get(depId)
      return depState?.status === 'completed'
    })

    if (allDepsComplete) {
      ready.push(def.step_id)
    }
  }

  return ready
}

/**
 * Computes the top-level workflow status_category from step states.
 * - Any step 'failed' → 'blocked'
 * - All steps 'completed' or 'skipped' → 'done'
 * - Otherwise → 'active'
 */
export function computeStatusCategory(
  states: WorkflowStepState[]
): 'active' | 'blocked' | 'done' {
  if (states.some(s => s.status === 'failed')) return 'blocked'
  if (states.every(s => s.status === 'completed' || s.status === 'skipped')) return 'done'
  return 'active'
}

/**
 * Initialises all steps as pending WorkflowStepState records.
 */
export function initStepStates(defs: WorkflowStepDef[]): WorkflowStepState[] {
  return defs.map(def => ({
    step_id: def.step_id,
    status: 'pending',
    attempts: 0,
  }))
}
```

Save to `packages/workflows/src/engine.ts`.

- [ ] **Step 2: Commit**

```bash
git add packages/workflows/src/engine.ts
git commit -m "feat(workflows): add DAG engine — nextReadySteps, computeStatusCategory, initStepStates"
```

---

## Task 6: Test helpers

**Files:**
- Create: `packages/workflows/src/tests/helpers.ts`

- [ ] **Step 1: Write helpers.ts**

```typescript
// packages/workflows/src/tests/helpers.ts
import Database from 'better-sqlite3'
import { setDb, closeDb, runMigrations } from 'fulcrum-core'
import { runMigration006Workflows } from '../schema.js'

export function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db)
  runMigration006Workflows(db)
  setDb(db)
  return db
}

export function resetTestDb(): void {
  closeDb()
}

export function seed(db: Database.Database): { workspace_id: string; project_id: string } {
  const workspace_id = 'ws_wf_test_01'
  const project_id = 'proj_wf_test_01'
  db.prepare(
    `INSERT OR IGNORE INTO workspaces(workspace_id, name, created_at)
     VALUES (?, 'Workflow Test Workspace', datetime('now'))`
  ).run(workspace_id)
  db.prepare(
    `INSERT OR IGNORE INTO projects(project_id, workspace_id, name, created_at)
     VALUES (?, ?, 'Workflow Test Project', datetime('now'))`
  ).run(project_id, workspace_id)
  return { workspace_id, project_id }
}
```

Save to `packages/workflows/src/tests/helpers.ts`.

- [ ] **Step 2: Commit**

```bash
git add packages/workflows/src/tests/helpers.ts
git commit -m "test(workflows): add test helpers with in-memory DB setup and seed"
```

---

## Task 7: Core implementation

**Files:**
- Create: `packages/workflows/src/workflows.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/workflows/src/tests/workflows.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seed } from './helpers.js'
import type Database from 'better-sqlite3'
import {
  startWorkflow,
  stepWorkflow,
  resumeWorkflow,
  cancelWorkflow,
  listWorkflows,
  getWorkflowRun,
} from '../workflows.js'

let db: Database.Database
let workspace_id: string
let project_id: string

beforeEach(() => {
  db = createTestDb()
  const seeded = seed(db)
  workspace_id = seeded.workspace_id
  project_id = seeded.project_id
})

afterEach(() => {
  resetTestDb()
})

describe('listWorkflows', () => {
  it('returns all 4 built-in workflow definitions', async () => {
    const defs = await listWorkflows()
    expect(defs).toHaveLength(4)
    const names = defs.map(d => d.name)
    expect(names).toContain('grill-me')
    expect(names).toContain('write-a-prd')
    expect(names).toContain('prd-to-plan')
    expect(names).toContain('prd-to-issues')
  })

  it('each definition has steps array with step_type fields', async () => {
    const defs = await listWorkflows()
    for (const def of defs) {
      expect(def.steps.length).toBeGreaterThan(0)
      for (const step of def.steps) {
        expect(step.step_id).toBeTruthy()
        expect(step.step_type).toBeTruthy()
        expect(step.name).toBeTruthy()
      }
    }
  })
})

describe('startWorkflow', () => {
  it('creates a run with correct initial state for grill-me', async () => {
    const run = await startWorkflow({ workflow_name: 'grill-me', workspace_id })

    expect(run.wf_id).toMatch(/^wf_/)
    expect(run.display_id).toBeTruthy()
    expect(run.workflow_name).toBe('grill-me')
    expect(run.workflow_version).toBe('1.0')
    expect(run.workspace_id).toBe(workspace_id)
    expect(run.status).toBe('running')
    expect(run.status_category).toBe('active')
    expect(run.steps).toHaveLength(5) // grill-me has 5 steps
    expect(run.steps.every(s => ['pending', 'running'].includes(s.status))).toBe(true)
    expect(run.started_at).toBeTruthy()
    expect(run.version).toBe(0)
  })

  it('sets current_step_id to the first ready step', async () => {
    const run = await startWorkflow({ workflow_name: 'grill-me', workspace_id })
    // 'ask' has no depends_on — should be first ready step
    expect(run.current_step_id).toBe('ask')
  })

  it('throws when workflow_name is not found in registry', async () => {
    await expect(
      startWorkflow({ workflow_name: 'nonexistent-workflow', workspace_id })
    ).rejects.toThrow('workflow not found: nonexistent-workflow')
  })
})

describe('stepWorkflow', () => {
  it('marks step completed and advances to next ready step', async () => {
    const run = await startWorkflow({ workflow_name: 'grill-me', workspace_id })
    // Step 'ask' is current — advance it
    const updated = await stepWorkflow({
      wf_id: run.wf_id,
      step_id: 'ask',
      result: { answers: ['use TypeScript', 'prefer ESM'] },
    })

    const askState = updated.steps.find(s => s.step_id === 'ask')
    expect(askState?.status).toBe('completed')
    expect(askState?.result).toEqual({ answers: ['use TypeScript', 'prefer ESM'] })
    expect(askState?.completed_at).toBeTruthy()
    // 'search' and 'recall' both depend on 'ask' — both are now ready
    // current_step_id advances to one of them
    expect(['search', 'recall']).toContain(updated.current_step_id)
  })

  it('sets workflow status to waiting_input when step_type is prompt_user', async () => {
    // 'grill-me' step 'ask' is prompt_user and the first step
    const run = await startWorkflow({ workflow_name: 'grill-me', workspace_id })

    // The step itself triggers a prompt_user pause — simulate by stepping with no result yet
    // To test waiting_input, start 'write-a-prd' which has prompt_user after recall
    const prdRun = await startWorkflow({ workflow_name: 'write-a-prd', workspace_id })
    // Step 'recall' first (read_memory, no waiting)
    const afterRecall = await stepWorkflow({ wf_id: prdRun.wf_id, step_id: 'recall', result: {} })
    // Now 'prompt' step (prompt_user) is ready — stepping it should pause at waiting_input
    const afterPrompt = await stepWorkflow({ wf_id: afterRecall.wf_id, step_id: 'prompt' })
    expect(afterPrompt.status).toBe('waiting_input')
  })

  it('marks step failed and records error message', async () => {
    const run = await startWorkflow({ workflow_name: 'grill-me', workspace_id })
    const updated = await stepWorkflow({
      wf_id: run.wf_id,
      step_id: 'ask',
      error: 'Agent timeout after 30s',
    })

    const askState = updated.steps.find(s => s.step_id === 'ask')
    expect(askState?.status).toBe('failed')
    expect(askState?.error).toBe('Agent timeout after 30s')
    expect(updated.status_category).toBe('blocked')
  })

  it('sets status completed and status_category done when all steps complete', async () => {
    // Use prd-to-issues: 4 steps, no prompt_user or wait_for_task
    const run = await startWorkflow({ workflow_name: 'prd-to-issues', workspace_id })

    // Step through all non-final steps
    let current = run
    current = await stepWorkflow({ wf_id: current.wf_id, step_id: 'recall', result: {} })
    current = await stepWorkflow({ wf_id: current.wf_id, step_id: 'agent', result: {} })
    current = await stepWorkflow({ wf_id: current.wf_id, step_id: 'issues', result: {} })
    current = await stepWorkflow({ wf_id: current.wf_id, step_id: 'done', result: {} })

    expect(current.status).toBe('completed')
    expect(current.status_category).toBe('done')
    expect(current.completed_at).toBeTruthy()
  })
})

describe('resumeWorkflow', () => {
  it('moves from waiting_input back to running', async () => {
    const prdRun = await startWorkflow({ workflow_name: 'write-a-prd', workspace_id })
    let current = await stepWorkflow({ wf_id: prdRun.wf_id, step_id: 'recall', result: {} })
    current = await stepWorkflow({ wf_id: current.wf_id, step_id: 'prompt' })
    expect(current.status).toBe('waiting_input')

    const resumed = await resumeWorkflow({
      wf_id: current.wf_id,
      resume_data: { user_input: 'Build a REST API' },
    })

    expect(resumed.status).toBe('running')
    expect(resumed.status_category).toBe('active')
    // After resume, the prompt step should be completed and next step ready
    const promptState = resumed.steps.find(s => s.step_id === 'prompt')
    expect(promptState?.status).toBe('completed')
  })
})

describe('cancelWorkflow', () => {
  it('sets status cancelled and status_category done', async () => {
    const run = await startWorkflow({ workflow_name: 'grill-me', workspace_id })
    const cancelled = await cancelWorkflow({ wf_id: run.wf_id, reason: 'User aborted' })

    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.status_category).toBe('done')
    expect(cancelled.error).toBe('User aborted')
  })

  it('sets status cancelled with no reason when reason is omitted', async () => {
    const run = await startWorkflow({ workflow_name: 'grill-me', workspace_id })
    const cancelled = await cancelWorkflow({ wf_id: run.wf_id })

    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.status_category).toBe('done')
  })
})

describe('getWorkflowRun', () => {
  it('retrieves a persisted run by wf_id', async () => {
    const run = await startWorkflow({ workflow_name: 'grill-me', workspace_id })
    const fetched = await getWorkflowRun({ wf_id: run.wf_id })

    expect(fetched.wf_id).toBe(run.wf_id)
    expect(fetched.workflow_name).toBe('grill-me')
    expect(fetched.steps).toHaveLength(5)
  })

  it('throws when wf_id is not found', async () => {
    await expect(getWorkflowRun({ wf_id: 'wf_nonexistent' })).rejects.toThrow(
      'workflow run not found: wf_nonexistent'
    )
  })
})

describe('full grill-me happy path', () => {
  it('completes all 5 steps in order and ends with status completed', async () => {
    // grill-me steps: ask → (search, recall) → save → done
    const run = await startWorkflow({ workflow_name: 'grill-me', workspace_id })
    expect(run.current_step_id).toBe('ask')

    // ask is prompt_user — stepping it pauses at waiting_input
    let current = await stepWorkflow({ wf_id: run.wf_id, step_id: 'ask' })
    expect(current.status).toBe('waiting_input')

    // resume from user input
    current = await resumeWorkflow({ wf_id: current.wf_id, resume_data: { answers: ['TypeScript'] } })
    expect(current.status).toBe('running')

    // search and recall are now both ready — step them in any order
    current = await stepWorkflow({ wf_id: current.wf_id, step_id: 'search', result: { results: [] } })
    current = await stepWorkflow({ wf_id: current.wf_id, step_id: 'recall', result: { memories: [] } })

    // save is now ready
    current = await stepWorkflow({ wf_id: current.wf_id, step_id: 'save', result: {} })

    // done step completes the run
    current = await stepWorkflow({ wf_id: current.wf_id, step_id: 'done', result: {} })

    expect(current.status).toBe('completed')
    expect(current.status_category).toBe('done')
    expect(current.completed_at).toBeTruthy()
    expect(current.steps.every(s => s.status === 'completed')).toBe(true)
  })
})
```

Save to `packages/workflows/src/tests/workflows.test.ts`.

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter fulcrum-workflows test
```

Expected: import errors — `../workflows.js` does not exist yet.

- [ ] **Step 3: Implement workflows.ts**

```typescript
// packages/workflows/src/workflows.ts
import { ulid } from 'ulidx'
import { getDb, nextDisplayId } from 'fulcrum-core'
import { registry } from './registry.js'
import { nextReadySteps, initStepStates, computeStatusCategory } from './engine.js'
import type {
  WorkflowRun,
  WorkflowDefinition,
  WorkflowStepState,
  StartWorkflowInput,
  StepWorkflowInput,
  ResumeWorkflowInput,
  CancelWorkflowInput,
  GetWorkflowRunInput,
} from './types.js'

// ── helpers ────────────────────────────────────────────────────────────────

function rowToRun(row: Record<string, unknown>): WorkflowRun {
  return {
    wf_id: row['wf_id'] as string,
    workspace_id: row['workspace_id'] as string,
    project_id: (row['project_id'] as string | null) ?? undefined,
    display_id: row['display_id'] as string,
    workflow_name: row['workflow_name'] as string,
    workflow_version: row['workflow_version'] as string,
    status: row['status'] as WorkflowRun['status'],
    status_category: row['status_category'] as WorkflowRun['status_category'],
    task_id: (row['task_id'] as string | null) ?? undefined,
    issue_id: (row['issue_id'] as string | null) ?? undefined,
    steps: JSON.parse(row['steps'] as string) as WorkflowStepState[],
    current_step_id: (row['current_step_id'] as string | null) ?? undefined,
    handoff_refs: JSON.parse(row['handoff_refs'] as string) as string[],
    artifact_refs: JSON.parse(row['artifact_refs'] as string) as string[],
    error: (row['error'] as string | null) ?? undefined,
    version: row['version'] as number,
    created_at: row['created_at'] as string,
    updated_at: row['updated_at'] as string,
    started_at: (row['started_at'] as string | null) ?? undefined,
    completed_at: (row['completed_at'] as string | null) ?? undefined,
  }
}

function fetchRun(wf_id: string): WorkflowRun {
  const db = getDb()
  const row = db.prepare(`SELECT * FROM workflow_runs WHERE wf_id = ?`).get(wf_id) as Record<string, unknown> | undefined
  if (!row) throw new Error(`workflow run not found: ${wf_id}`)
  return rowToRun(row)
}

/**
 * Given updated step states, determines the workflow's top-level status.
 * Waits if the current step is prompt_user or wait_for_task.
 */
function deriveWorkflowStatus(
  steps: WorkflowStepState[],
  def: WorkflowDefinition,
  currentStepId?: string
): WorkflowRun['status'] {
  const cat = computeStatusCategory(steps)
  if (cat === 'done') return 'completed'
  if (cat === 'blocked') return 'failed'

  if (currentStepId) {
    const stepDef = def.steps.find(s => s.step_id === currentStepId)
    if (stepDef?.step_type === 'prompt_user') return 'waiting_input'
    if (stepDef?.step_type === 'wait_for_task') return 'waiting_dependency'
  }

  return 'running'
}

// ── public API ─────────────────────────────────────────────────────────────

export async function startWorkflow(input: StartWorkflowInput): Promise<WorkflowRun> {
  const def = registry.getDefinition(input.workflow_name)
  if (!def) throw new Error(`workflow not found: ${input.workflow_name}`)

  const db = getDb()
  const wf_id = `wf_${ulid()}`
  const now = new Date().toISOString()
  const display_id = nextDisplayId('workflow_run', input.project_id ?? input.workspace_id, db)

  // Initialise all steps as pending
  const steps = initStepStates(def.steps)

  // Advance first ready steps to 'running'
  const readyIds = nextReadySteps(steps, def.steps)
  for (const sid of readyIds) {
    const s = steps.find(s => s.step_id === sid)!
    s.status = 'running'
    s.started_at = now
  }
  const current_step_id = readyIds[0] ?? undefined

  // Determine initial status — if current step is prompt_user, pause immediately
  const status = deriveWorkflowStatus(steps, def, current_step_id)
  const status_category = 'active'

  db.prepare(
    `INSERT INTO workflow_runs(
       wf_id, workspace_id, project_id, display_id, workflow_name, workflow_version,
       status, status_category, task_id, issue_id,
       steps, current_step_id, handoff_refs, artifact_refs,
       version, created_at, updated_at, started_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', 0, ?, ?, ?)`
  ).run(
    wf_id,
    input.workspace_id,
    input.project_id ?? null,
    display_id,
    input.workflow_name,
    def.version,
    status,
    status_category,
    input.task_id ?? null,
    input.issue_id ?? null,
    JSON.stringify(steps),
    current_step_id ?? null,
    now,
    now,
    now
  )

  return fetchRun(wf_id)
}

export async function stepWorkflow(input: StepWorkflowInput): Promise<WorkflowRun> {
  const db = getDb()
  const run = fetchRun(input.wf_id)
  const def = registry.getDefinition(run.workflow_name)
  if (!def) throw new Error(`workflow definition not found: ${run.workflow_name}`)

  const now = new Date().toISOString()
  const steps = run.steps

  // Update the stepped step's state
  const stepState = steps.find(s => s.step_id === input.step_id)
  if (!stepState) throw new Error(`step not found in run: ${input.step_id}`)

  stepState.attempts += 1
  if (input.error) {
    stepState.status = 'failed'
    stepState.error = input.error
    stepState.completed_at = now
  } else {
    stepState.status = 'completed'
    if (input.result !== undefined) stepState.result = input.result
    stepState.completed_at = now
  }

  // Compute next ready steps and advance them
  const readyIds = nextReadySteps(steps, def.steps)
  for (const sid of readyIds) {
    const s = steps.find(s => s.step_id === sid)!
    s.status = 'running'
    s.started_at = now
  }
  const current_step_id = readyIds[0] ?? run.current_step_id

  const status = deriveWorkflowStatus(steps, def, current_step_id)
  const status_category: WorkflowRun['status_category'] =
    status === 'completed' || status === 'cancelled' ? 'done'
    : status === 'failed' ? 'blocked'
    : 'active'
  const completed_at = status === 'completed' ? now : null

  db.prepare(
    `UPDATE workflow_runs
     SET steps = ?, current_step_id = ?, status = ?, status_category = ?,
         completed_at = COALESCE(completed_at, ?), version = version + 1, updated_at = ?
     WHERE wf_id = ?`
  ).run(
    JSON.stringify(steps),
    current_step_id ?? null,
    status,
    status_category,
    completed_at,
    now,
    input.wf_id
  )

  return fetchRun(input.wf_id)
}

export async function resumeWorkflow(input: ResumeWorkflowInput): Promise<WorkflowRun> {
  const db = getDb()
  const run = fetchRun(input.wf_id)
  const def = registry.getDefinition(run.workflow_name)
  if (!def) throw new Error(`workflow definition not found: ${run.workflow_name}`)

  const now = new Date().toISOString()
  const steps = run.steps

  // Mark the current waiting step as completed (the user/task provided the input)
  if (run.current_step_id) {
    const waitingStep = steps.find(s => s.step_id === run.current_step_id)
    if (waitingStep && (waitingStep.status === 'running' || waitingStep.status === 'waiting')) {
      waitingStep.status = 'completed'
      if (input.resume_data !== undefined) waitingStep.result = input.resume_data
      waitingStep.completed_at = now
    }
  }

  // Recompute ready steps
  const readyIds = nextReadySteps(steps, def.steps)
  for (const sid of readyIds) {
    const s = steps.find(s => s.step_id === sid)!
    s.status = 'running'
    s.started_at = now
  }
  const current_step_id = readyIds[0] ?? run.current_step_id

  db.prepare(
    `UPDATE workflow_runs
     SET steps = ?, current_step_id = ?, status = 'running', status_category = 'active',
         version = version + 1, updated_at = ?
     WHERE wf_id = ?`
  ).run(JSON.stringify(steps), current_step_id ?? null, now, input.wf_id)

  return fetchRun(input.wf_id)
}

export async function cancelWorkflow(input: CancelWorkflowInput): Promise<WorkflowRun> {
  const db = getDb()
  const now = new Date().toISOString()

  db.prepare(
    `UPDATE workflow_runs
     SET status = 'cancelled', status_category = 'done',
         error = ?, version = version + 1, updated_at = ?, completed_at = COALESCE(completed_at, ?)
     WHERE wf_id = ?`
  ).run(input.reason ?? null, now, now, input.wf_id)

  return fetchRun(input.wf_id)
}

export async function listWorkflows(): Promise<WorkflowDefinition[]> {
  return registry.listAll()
}

export async function getWorkflowRun(input: GetWorkflowRunInput): Promise<WorkflowRun> {
  return fetchRun(input.wf_id)
}
```

Save to `packages/workflows/src/workflows.ts`.

- [ ] **Step 4: Update src/index.ts**

```typescript
// packages/workflows/src/index.ts
export * from './types.js'
export * from './schema.js'
export * from './registry.js'
export * from './engine.js'
export * from './workflows.js'
```

Save to `packages/workflows/src/index.ts`.

- [ ] **Step 5: Run tests and confirm they pass**

```bash
pnpm --filter fulcrum-workflows test
```

Expected output:
```
✓ src/tests/workflows.test.ts (16)
  ✓ listWorkflows (2)
  ✓ startWorkflow (3)
  ✓ stepWorkflow (4)
  ✓ resumeWorkflow (1)
  ✓ cancelWorkflow (2)
  ✓ getWorkflowRun (2)
  ✓ full grill-me happy path (1)
Test Files  1 passed (1)
Tests  16 passed (16)
```

- [ ] **Step 6: Commit**

```bash
git add packages/workflows/src/workflows.ts packages/workflows/src/index.ts packages/workflows/src/tests/workflows.test.ts
git commit -m "$(cat <<'EOF'
feat(workflows): implement fulcrum-workflows — DAG engine, registry, full run lifecycle

Adds startWorkflow, stepWorkflow (prompt_user/wait_for_task pausing), resumeWorkflow,
cancelWorkflow, listWorkflows, getWorkflowRun. WorkflowRegistry holds 4 built-in
definitions. Pure DAG engine computes nextReadySteps from depends_on graph.
16 tests passing including full grill-me happy path.
EOF
)"
```

---

## Task 8: Integration with fulcrum-core migrations

The workflows migration must run when fulcrum-core's `runMigrations()` is called. Add the workflows SQL to `packages/core/src/db/migrations.ts`.

**Files:**
- Modify: `packages/core/src/db/migrations.ts`

- [ ] **Step 1: Add MIGRATION_006 workflows tables to core migrations**

Open `packages/core/src/db/migrations.ts`. After the MIGRATION_006_TEAMS block, add:

```typescript
const MIGRATION_006_WORKFLOWS = `
CREATE TABLE IF NOT EXISTS workflow_runs (
  wf_id            TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id       TEXT REFERENCES projects(project_id),
  display_id       TEXT NOT NULL,
  workflow_name    TEXT NOT NULL,
  workflow_version TEXT NOT NULL DEFAULT '1.0',
  status           TEXT NOT NULL DEFAULT 'created'
    CHECK(status IN ('created','ready','running','waiting_input','waiting_dependency',
                     'blocked','failed','completed','cancelled')),
  status_category  TEXT NOT NULL DEFAULT 'active'
    CHECK(status_category IN ('backlog','active','blocked','done')),
  task_id          TEXT REFERENCES tasks(task_id),
  issue_id         TEXT REFERENCES issues(issue_id),
  steps            TEXT NOT NULL DEFAULT '[]',
  current_step_id  TEXT,
  handoff_refs     TEXT NOT NULL DEFAULT '[]',
  artifact_refs    TEXT NOT NULL DEFAULT '[]',
  error            TEXT,
  version          INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  started_at       TEXT,
  completed_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_wf_runs_workspace ON workflow_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wf_runs_status    ON workflow_runs(status_category);
`

db.exec(MIGRATION_006_WORKFLOWS)
db.prepare(`INSERT OR IGNORE INTO schema_migrations(name) VALUES ('006_workflows')`).run()
```

- [ ] **Step 2: Run core tests to confirm no regressions**

```bash
pnpm --filter fulcrum-core test
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/db/migrations.ts
git commit -m "feat(core): add MIGRATION_006_WORKFLOWS to runMigrations — workflow_runs table with indexes"
```

---
