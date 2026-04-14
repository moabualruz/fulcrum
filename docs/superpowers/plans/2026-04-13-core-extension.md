# @fulcrum/core Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend @fulcrum/core with complete domain types, event emission, display IDs, status categories, task relations table, and enriched memory fields — the foundation all other packages depend on.

**Architecture:** Additive migrations only (ALTER TABLE + new tables). All changes backward-compatible. New utility modules (ids.ts, events.ts, status-category.ts) are thin functions with no dependencies. Existing function signatures extended with new optional fields where possible.

**Tech Stack:** TypeScript, better-sqlite3, vitest (pool: forks), ulid

---

## Task 1 — New types in types.ts

Replace all enums and interfaces with the expanded domain model. No logic changes — types only.

### Step 1.1 — Write failing test

File: `packages/core/src/tests/types.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import type {
  TaskStatus, AgentRunStatus, StatusCategory,
  WorkspaceStatus, ProjectStatus, ProjectType, WriteMode,
  AgentRole, TaskRelationType, MemoryScope, MemoryKind,
  ArtifactType, EventType,
  Task, AgentRun, Memory, FulcrumEvent, TaskRelation,
} from '../types.js'

describe('type exports — compile-time shape checks', () => {
  it('TaskStatus includes all 8 values', () => {
    const statuses: TaskStatus[] = [
      'queued', 'ready', 'claimed', 'running',
      'blocked', 'failed', 'completed', 'cancelled',
    ]
    expect(statuses).toHaveLength(8)
  })

  it('AgentRunStatus includes all 8 values', () => {
    const statuses: AgentRunStatus[] = [
      'created', 'starting', 'running', 'waiting',
      'blocked', 'failed', 'finished', 'aborted',
    ]
    expect(statuses).toHaveLength(8)
  })

  it('StatusCategory has 4 values', () => {
    const cats: StatusCategory[] = ['backlog', 'active', 'blocked', 'done']
    expect(cats).toHaveLength(4)
  })

  it('AgentRole includes all 19 roles', () => {
    const roles: AgentRole[] = [
      'chief_of_staff', 'context_gatherer', 'prd_planner', 'implementation_planner',
      'issue_decomposer', 'architecture_reviewer', 'research_worker',
      'implementer_backend', 'implementer_frontend', 'implementer',
      'refactor_worker', 'browser_worker', 'tester', 'reviewer',
      'security_reviewer', 'performance_reviewer', 'integration_worker',
      'planner', 'researcher',
    ]
    expect(roles).toHaveLength(19)
  })

  it('Task interface has display_id, priority, status_category fields', () => {
    const t: Task = {
      task_id: 'task_01', workspace_id: 'ws_01', project_id: 'proj_01',
      issue_id: null, display_id: 'TASK-1', title: 'Test task',
      description: null, status: 'queued', status_category: 'backlog',
      priority: 'medium', estimate_type: null, estimate_value: null,
      assigned_to: null, note: null, done_criteria: null,
      version: 0, created_at: '', updated_at: '',
      claimed_at: null, completed_at: null,
    }
    expect(t.display_id).toBe('TASK-1')
    expect(t.status_category).toBe('backlog')
    expect(t.priority).toBe('medium')
  })

  it('AgentRun interface has display_id, agent_id, status_category, blocker, finished_at', () => {
    const r: AgentRun = {
      run_id: 'run_01', task_id: 'task_01', workspace_id: 'ws_01',
      project_id: 'proj_01', display_id: 'RUN-1', agent_id: 'agent-1',
      role: 'implementer', pi_profile: null, status: 'running',
      status_category: 'active', current_step: null, current_path: null,
      progress_pct: 0, output_summary: null, artifacts: null,
      git_branch: null, git_commit: null, heartbeat_at: null,
      blocker: null, worktree_id: null, version: 0,
      started_at: '', updated_at: '', finished_at: null,
    }
    expect(r.display_id).toBe('RUN-1')
    expect(r.agent_id).toBe('agent-1')
    expect(r.blocker).toBeNull()
    expect(r.finished_at).toBeNull()
  })

  it('Memory interface has scope, kind, title, summary, canonical_text fields', () => {
    const m: Memory = {
      memory_id: 'mem_01', scope: 'project', kind: 'fact',
      workspace_id: 'ws_01', project_id: 'proj_01', file_path: null,
      symbol_path: null, title: 'A fact', summary: 'Short summary',
      canonical_text: null, tags: [], entities: [], confidence: 1.0,
      access_count: 0, event_time: null, content_hash: null,
      task_id: null, issue_id: null, artifact_id: null,
      provenance_refs: [], embedding: null,
      created_at: '', updated_at: '', last_accessed_at: '',
    }
    expect(m.scope).toBe('project')
    expect(m.kind).toBe('fact')
    expect(m.title).toBe('A fact')
  })

  it('FulcrumEvent interface has all required fields', () => {
    const e: FulcrumEvent = {
      evt_id: 'evt_01', workspace_id: 'ws_01', project_id: null,
      evt_type: 'task_created', ts: '', object_type: 'task',
      object_id: 'task_01', actor_type: 'agent', actor_id: 'agent-1',
      payload: {}, severity: 'info',
      trace_id: null, span_id: null, correlation_id: null,
    }
    expect(e.evt_type).toBe('task_created')
    expect(e.severity).toBe('info')
  })

  it('TaskRelation interface has all required fields', () => {
    const tr: TaskRelation = {
      task_id: 'task_01', target_task_id: 'task_02',
      relation_type: 'blocks', created_at: '',
    }
    expect(tr.relation_type).toBe('blocks')
  })
})
```

### Step 1.2 — Run to confirm failure

```bash
cd packages/core && npx vitest run src/tests/types.test.ts
```

Expected: compile errors — `display_id`, `status_category`, `AgentRole` variants, etc. not found on existing types.

### Step 1.3 — Implement

Replace `packages/core/src/types.ts` entirely:

```typescript
export type TaskStatus =
  | 'queued' | 'ready' | 'claimed' | 'running'
  | 'blocked' | 'failed' | 'completed' | 'cancelled'

export type AgentRunStatus =
  | 'created' | 'starting' | 'running' | 'waiting'
  | 'blocked' | 'failed' | 'finished' | 'aborted'

export type StatusCategory = 'backlog' | 'active' | 'blocked' | 'done'

export type WorkspaceStatus = 'active' | 'archived'
export type ProjectStatus = 'active' | 'archived' | 'paused'
export type ProjectType = 'git' | 'non_git' | 'submodule' | 'logical'
export type WriteMode = 'sequential' | 'worktree'

export type AgentRole =
  | 'chief_of_staff' | 'context_gatherer' | 'prd_planner' | 'implementation_planner'
  | 'issue_decomposer' | 'architecture_reviewer' | 'research_worker'
  | 'implementer_backend' | 'implementer_frontend' | 'implementer'
  | 'refactor_worker' | 'browser_worker' | 'tester' | 'reviewer'
  | 'security_reviewer' | 'performance_reviewer' | 'integration_worker'
  | 'planner' | 'researcher'

export type TaskRelationType =
  | 'blocks' | 'blocked_by' | 'follows' | 'preceded_by'
  | 'relates' | 'duplicates' | 'requires_context_from'
  | 'must_merge_before' | 'conflicts_with' | 'reviewed_by' | 'verifies'

export type MemoryScope = 'global' | 'project' | 'file'

export type MemoryKind =
  | 'fact' | 'summary' | 'symbol' | 'decision' | 'procedure'
  | 'error' | 'diff' | 'doc' | 'code' | 'task_goal'
  | 'task_decision' | 'task_failure' | 'task_outcome'

export type ArtifactType =
  | 'prd' | 'plan' | 'issue_breakdown' | 'context_gathering_report'
  | 'patch' | 'changed_files_manifest' | 'command_log' | 'test_report'
  | 'benchmark_report' | 'review_report' | 'integration_report'
  | 'merge_conflict_report' | 'risk_report' | 'research_note'
  | 'source_digest' | 'comparison_matrix' | 'memory_promotion_summary'
  | 'task_outcome_summary'

export type EventType =
  | 'project_registered' | 'epic_created' | 'issue_created' | 'task_created'
  | 'task_status_changed' | 'team_created' | 'team_invoked'
  | 'agent_run_created' | 'agent_run_started' | 'agent_run_progress'
  | 'agent_run_blocked' | 'agent_run_failed' | 'agent_run_finished'
  | 'handoff_created' | 'handoff_consumed' | 'artifact_written'
  | 'artifact_validated' | 'memory_written' | 'memory_recalled'
  | 'worktree_allocated' | 'merge_queued' | 'merge_started'
  | 'merge_conflicted' | 'merge_completed' | 'review_created'
  | 'validation_started' | 'validation_finished' | 'policy_denied'
  | 'hook_executed' | 'workflow_step_completed'

// Keep RunStatus as alias for backward compat with existing code
export type RunStatus = AgentRunStatus

export interface Task {
  task_id: string
  workspace_id: string
  project_id: string
  issue_id: string | null
  display_id: string
  title: string
  description: string | null
  status: TaskStatus
  status_category: StatusCategory
  priority: 'critical' | 'high' | 'medium' | 'low' | 'none'
  estimate_type: 'story_points' | 'hours' | null
  estimate_value: number | null
  assigned_to: string | null
  note: string | null
  done_criteria: string | null
  version: number
  created_at: string
  updated_at: string
  claimed_at: string | null
  completed_at: string | null
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
  project_id: string
  display_id: string
  agent_id: string
  role: AgentRole
  pi_profile: string | null
  status: AgentRunStatus
  status_category: StatusCategory
  current_step: string | null
  current_path: string | null
  progress_pct: number
  output_summary: string | null
  artifacts: RunArtifacts | null
  git_branch: string | null
  git_commit: string | null
  heartbeat_at: string | null
  blocker: string | null
  worktree_id: string | null
  version: number
  started_at: string
  updated_at: string
  finished_at: string | null
}

export interface Memory {
  memory_id: string
  scope: MemoryScope
  kind: MemoryKind
  workspace_id: string
  project_id: string | null
  file_path: string | null
  symbol_path: string | null
  title: string
  summary: string
  canonical_text: string | null
  tags: string[]
  entities: string[]
  confidence: number
  access_count: number
  event_time: string | null
  content_hash: string | null
  task_id: string | null
  issue_id: string | null
  artifact_id: string | null
  provenance_refs: string[]
  embedding: Buffer | null
  created_at: string
  updated_at: string
  last_accessed_at: string
}

export interface FulcrumEvent {
  evt_id: string
  workspace_id: string
  project_id: string | null
  evt_type: EventType
  ts: string
  object_type: string | null
  object_id: string | null
  actor_type: string
  actor_id: string
  payload: Record<string, unknown>
  severity: 'debug' | 'info' | 'warn' | 'error'
  trace_id: string | null
  span_id: string | null
  correlation_id: string | null
}

export interface TaskRelation {
  task_id: string
  target_task_id: string
  relation_type: TaskRelationType
  created_at: string
}

export interface AgentProfile {
  role: AgentRole
  description: string
  can_create_teams: boolean
  can_dispatch_agents: boolean
}

// WorkspaceStatusResult renamed to avoid collision with WorkspaceStatus type above
export interface WorkspaceStatusResult {
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
  reason?: 'wip_limit_exceeded' | 'dependencies_incomplete'
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

**Important:** After updating types.ts, fix the import in `status.ts` — the `WorkspaceStatus` interface is now `WorkspaceStatusResult`. Update `status.ts` line 3:

```typescript
import type { AgentProfile, WorkspaceStatusResult } from './types.js'
```

And update the return type annotation on `getWorkspaceStatus` to `Promise<WorkspaceStatusResult>` and the `WorkspaceStatus` reference inside the function body.

### Step 1.4 — Run to confirm pass

```bash
cd packages/core && npx vitest run src/tests/types.test.ts
```

Expected output:
```
✓ src/tests/types.test.ts (7)
  ✓ type exports — compile-time shape checks (7)
Test Files  1 passed (1)
Tests  7 passed (7)
```

### Step 1.5 — Run full suite to confirm no regressions

```bash
cd packages/core && npx vitest run
```

Expected: 91+ tests passing (types.test.ts adds 7 more = 98 total).

### Step 1.6 — Commit

```bash
cd packages/core && git add src/types.ts src/status.ts src/tests/types.test.ts
git commit -m "$(cat <<'EOF'
feat(core/types): expand domain model — 8-status enums, 19 roles, enriched Task/AgentRun/Memory interfaces

Adds TaskStatus (8), AgentRunStatus (8), AgentRole (19), StatusCategory,
TaskRelationType (11), MemoryScope, MemoryKind (13), ArtifactType (18),
EventType (30). Extends Task with display_id/priority/status_category,
AgentRun with agent_id/blocker/finished_at, Memory with scope/kind/title/summary.
Adds FulcrumEvent and TaskRelation interfaces. RunStatus kept as alias.
EOF
)"
```

---

## Task 2 — ids.ts — newId() and nextDisplayId()

### Step 2.1 — Write failing test

File: `packages/core/src/tests/ids.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { newId, nextDisplayId } from '../ids.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces VALUES ('ws_1','test ws',datetime('now'))").run()
  db.prepare("INSERT INTO projects VALUES ('proj_1','ws_1','test proj',datetime('now'))").run()
}

describe('newId', () => {
  it('generates a plain ULID for unknown entity type', () => {
    const id = newId('unknown')
    expect(id).toMatch(/^[0-9A-Z]{26}$/)
  })

  it('prefixes task IDs with task_', () => {
    const id = newId('task')
    expect(id).toMatch(/^task_[0-9A-Z]{26}$/)
  })

  it('prefixes run IDs with run_', () => {
    const id = newId('run')
    expect(id).toMatch(/^run_[0-9A-Z]{26}$/)
  })

  it('prefixes workspace IDs with ws_', () => {
    const id = newId('workspace')
    expect(id).toMatch(/^ws_[0-9A-Z]{26}$/)
  })

  it('prefixes project IDs with proj_', () => {
    const id = newId('project')
    expect(id).toMatch(/^proj_[0-9A-Z]{26}$/)
  })

  it('prefixes memory IDs with mem_', () => {
    const id = newId('memory')
    expect(id).toMatch(/^mem_[0-9A-Z]{26}$/)
  })

  it('prefixes event IDs with evt_', () => {
    const id = newId('event')
    expect(id).toMatch(/^evt_[0-9A-Z]{26}$/)
  })

  it('generates unique IDs on each call', () => {
    const ids = Array.from({ length: 100 }, () => newId('task'))
    const unique = new Set(ids)
    expect(unique.size).toBe(100)
  })
})

describe('nextDisplayId', () => {
  it('returns TASK-1 for first task in a project', () => {
    seed()
    const db = getDb()
    const id = nextDisplayId('task', 'proj_1', db)
    expect(id).toBe('TASK-1')
  })

  it('auto-increments per project', () => {
    seed()
    const db = getDb()
    const id1 = nextDisplayId('task', 'proj_1', db)
    const id2 = nextDisplayId('task', 'proj_1', db)
    const id3 = nextDisplayId('task', 'proj_1', db)
    expect(id1).toBe('TASK-1')
    expect(id2).toBe('TASK-2')
    expect(id3).toBe('TASK-3')
  })

  it('sequences are independent per project', () => {
    seed()
    const db = getDb()
    db.prepare("INSERT INTO projects VALUES ('proj_2','ws_1','p2',datetime('now'))").run()
    expect(nextDisplayId('task', 'proj_1', db)).toBe('TASK-1')
    expect(nextDisplayId('task', 'proj_2', db)).toBe('TASK-1')
    expect(nextDisplayId('task', 'proj_1', db)).toBe('TASK-2')
    expect(nextDisplayId('task', 'proj_2', db)).toBe('TASK-2')
  })

  it('sequences are independent per entity_type', () => {
    seed()
    const db = getDb()
    expect(nextDisplayId('task', 'proj_1', db)).toBe('TASK-1')
    expect(nextDisplayId('run', 'proj_1', db)).toBe('RUN-1')
    expect(nextDisplayId('task', 'proj_1', db)).toBe('TASK-2')
    expect(nextDisplayId('run', 'proj_1', db)).toBe('RUN-2')
  })

  it('throws for entity types with no display prefix', () => {
    seed()
    const db = getDb()
    expect(() => nextDisplayId('workspace', 'proj_1', db)).toThrow('No display prefix')
  })
})
```

### Step 2.2 — Run to confirm failure

```bash
cd packages/core && npx vitest run src/tests/ids.test.ts
```

Expected: module not found — `../ids.js` does not exist yet.

### Step 2.3 — Implement

File: `packages/core/src/ids.ts`

```typescript
import { ulid } from 'ulid'
import type Database from 'better-sqlite3'

const PREFIXES: Record<string, string> = {
  workspace: 'ws_',
  project: 'proj_',
  epic: 'epic_',
  issue: 'iss_',
  task: 'task_',
  prd: 'prd_',
  plan: 'plan_',
  run: 'run_',
  wf: 'wf_',
  worktree: 'wt_',
  review: 'rev_',
  artifact: 'art_',
  memory: 'mem_',
  handoff: 'hof_',
  contract: 'ac_',
  event: 'evt_',
  team: 'team_',
  policy: 'pol_',
}

const DISPLAY_PREFIXES: Record<string, string> = {
  epic: 'EPIC',
  issue: 'ISS',
  task: 'TASK',
  prd: 'PRD',
  plan: 'PLAN',
  run: 'RUN',
  wf: 'WF',
  artifact: 'ART',
  review: 'REV',
  team: 'TEAM',
}

export function newId(entityType: string): string {
  return (PREFIXES[entityType] ?? '') + ulid()
}

export function nextDisplayId(entityType: string, projectId: string, db: Database.Database): string {
  const prefix = DISPLAY_PREFIXES[entityType]
  if (!prefix) throw new Error(`No display prefix for entity type: ${entityType}`)
  const result = db.prepare(`
    INSERT INTO display_id_sequences (entity_type, project_id, last_value)
    VALUES (?, ?, 1)
    ON CONFLICT(entity_type, project_id) DO UPDATE SET last_value = last_value + 1
    RETURNING last_value
  `).get(entityType, projectId) as { last_value: number }
  return `${prefix}-${result.last_value}`
}
```

**Note:** `nextDisplayId` depends on the `display_id_sequences` table created in MIGRATION_002 (Task 5). For tests in Task 2 to pass, the `createTestDb()` helper must run MIGRATION_002. Therefore Task 5 (migrations) must be implemented **before** running this test, OR the test must manually create the table. Add a minimal table creation in the test's `beforeEach` as a temporary bridge:

Update the test `beforeEach` temporarily for Task 2 isolation:

```typescript
beforeEach(() => {
  const db = createTestDb()
  // display_id_sequences created by MIGRATION_002; add it here for Task 2 isolation
  db.exec(`
    CREATE TABLE IF NOT EXISTS display_id_sequences (
      entity_type TEXT NOT NULL,
      project_id TEXT NOT NULL,
      last_value INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (entity_type, project_id)
    )
  `)
})
```

### Step 2.4 — Run to confirm pass

```bash
cd packages/core && npx vitest run src/tests/ids.test.ts
```

Expected output:
```
✓ src/tests/ids.test.ts (13)
  ✓ newId (8)
  ✓ nextDisplayId (5)
Test Files  1 passed (1)
Tests  13 passed (13)
```

### Step 2.5 — Commit

```bash
git add packages/core/src/ids.ts packages/core/src/tests/ids.test.ts
git commit -m "$(cat <<'EOF'
feat(core/ids): add newId() with entity prefixes and nextDisplayId() with per-project sequences
EOF
)"
```

---

## Task 3 — status-category.ts — statusCategory()

### Step 3.1 — Write failing test

File: `packages/core/src/tests/status-category.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { statusCategory } from '../status-category.js'

describe('statusCategory', () => {
  it('maps queued → backlog', () => { expect(statusCategory('queued')).toBe('backlog') })
  it('maps ready → backlog', () => { expect(statusCategory('ready')).toBe('backlog') })
  it('maps backlog → backlog', () => { expect(statusCategory('backlog')).toBe('backlog') })
  it('maps draft → backlog', () => { expect(statusCategory('draft')).toBe('backlog') })
  it('maps never_synced → backlog', () => { expect(statusCategory('never_synced')).toBe('backlog') })

  it('maps claimed → active', () => { expect(statusCategory('claimed')).toBe('active') })
  it('maps running → active', () => { expect(statusCategory('running')).toBe('active') })
  it('maps starting → active', () => { expect(statusCategory('starting')).toBe('active') })
  it('maps waiting → active', () => { expect(statusCategory('waiting')).toBe('active') })
  it('maps in_progress → active', () => { expect(statusCategory('in_progress')).toBe('active') })
  it('maps in_review → active', () => { expect(statusCategory('in_review')).toBe('active') })
  it('maps syncing → active', () => { expect(statusCategory('syncing')).toBe('active') })
  it('maps created → active', () => { expect(statusCategory('created')).toBe('active') })

  it('maps blocked → blocked', () => { expect(statusCategory('blocked')).toBe('blocked') })
  it('maps waiting_input → blocked', () => { expect(statusCategory('waiting_input')).toBe('blocked') })
  it('maps waiting_dependency → blocked', () => { expect(statusCategory('waiting_dependency')).toBe('blocked') })
  it('maps conflicted → blocked', () => { expect(statusCategory('conflicted')).toBe('blocked') })

  it('maps completed → done', () => { expect(statusCategory('completed')).toBe('done') })
  it('maps done → done', () => { expect(statusCategory('done')).toBe('done') })
  it('maps finished → done', () => { expect(statusCategory('finished')).toBe('done') })
  it('maps cancelled → done', () => { expect(statusCategory('cancelled')).toBe('done') })
  it('maps failed → done', () => { expect(statusCategory('failed')).toBe('done') })
  it('maps aborted → done', () => { expect(statusCategory('aborted')).toBe('done') })
  it('maps archived → done', () => { expect(statusCategory('archived')).toBe('done') })
  it('maps approved → done', () => { expect(statusCategory('approved')).toBe('done') })
  it('maps merged → done', () => { expect(statusCategory('merged')).toBe('done') })
  it('maps discarded → done', () => { expect(statusCategory('discarded')).toBe('done') })

  it('maps unknown status → active (safe default)', () => {
    expect(statusCategory('some_future_status')).toBe('active')
  })
})
```

### Step 3.2 — Run to confirm failure

```bash
cd packages/core && npx vitest run src/tests/status-category.test.ts
```

Expected: module not found — `../status-category.js` does not exist yet.

### Step 3.3 — Implement

File: `packages/core/src/status-category.ts`

```typescript
import type { StatusCategory } from './types.js'

const BACKLOG = new Set([
  'queued', 'ready', 'backlog', 'draft', 'never_synced',
])
const ACTIVE = new Set([
  'claimed', 'running', 'starting', 'waiting', 'in_progress',
  'in_review', 'syncing', 'created',
])
const BLOCKED = new Set([
  'blocked', 'waiting_input', 'waiting_dependency', 'conflicted',
])
const DONE = new Set([
  'completed', 'done', 'finished', 'cancelled', 'failed',
  'aborted', 'archived', 'approved', 'merged', 'discarded',
])

export function statusCategory(status: string): StatusCategory {
  if (BACKLOG.has(status)) return 'backlog'
  if (ACTIVE.has(status))  return 'active'
  if (BLOCKED.has(status)) return 'blocked'
  if (DONE.has(status))    return 'done'
  return 'active' // safe default for future statuses
}
```

### Step 3.4 — Run to confirm pass

```bash
cd packages/core && npx vitest run src/tests/status-category.test.ts
```

Expected output:
```
✓ src/tests/status-category.test.ts (27)
Test Files  1 passed (1)
Tests  27 passed (27)
```

### Step 3.5 — Commit

```bash
git add packages/core/src/status-category.ts packages/core/src/tests/status-category.test.ts
git commit -m "$(cat <<'EOF'
feat(core/status-category): add statusCategory() mapping status strings to StatusCategory
EOF
)"
```

---

## Task 4 — events.ts — emitEvent()

### Step 4.1 — Write failing test

File: `packages/core/src/tests/events.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { emitEvent } from '../events.js'

beforeEach(() => {
  const db = createTestDb()
  // events table created by MIGRATION_002; add it here for Task 4 isolation
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      evt_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT,
      evt_type TEXT NOT NULL,
      ts TEXT NOT NULL DEFAULT (datetime('now')),
      object_type TEXT,
      object_id TEXT,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      severity TEXT NOT NULL DEFAULT 'info',
      trace_id TEXT,
      span_id TEXT,
      correlation_id TEXT
    )
  `)
  db.prepare("INSERT INTO workspaces VALUES ('ws_1','test ws',datetime('now'))").run()
})
afterEach(() => resetTestDb())

describe('emitEvent', () => {
  it('inserts an event row with correct fields', () => {
    emitEvent({
      workspace_id: 'ws_1',
      evt_type: 'task_created',
      actor_type: 'agent',
      actor_id: 'agent-xyz',
      object_type: 'task',
      object_id: 'task_01',
      payload: { title: 'Test task' },
    })
    const db = getDb()
    const row = db.prepare('SELECT * FROM events WHERE workspace_id = ?').get('ws_1') as Record<string, unknown>
    expect(row).toBeTruthy()
    expect(row.evt_type).toBe('task_created')
    expect(row.actor_type).toBe('agent')
    expect(row.actor_id).toBe('agent-xyz')
    expect(row.object_type).toBe('task')
    expect(row.object_id).toBe('task_01')
    expect(JSON.parse(row.payload as string)).toEqual({ title: 'Test task' })
    expect(row.severity).toBe('info')
    expect(row.evt_id).toMatch(/^evt_[0-9A-Z]{26}$/)
  })

  it('defaults severity to info', () => {
    emitEvent({ workspace_id: 'ws_1', evt_type: 'memory_written', actor_type: 'system', actor_id: 'core' })
    const db = getDb()
    const row = db.prepare('SELECT severity FROM events WHERE evt_type = ?').get('memory_written') as { severity: string }
    expect(row.severity).toBe('info')
  })

  it('accepts custom severity', () => {
    emitEvent({ workspace_id: 'ws_1', evt_type: 'policy_denied', actor_type: 'system', actor_id: 'core', severity: 'warn' })
    const db = getDb()
    const row = db.prepare('SELECT severity FROM events WHERE evt_type = ?').get('policy_denied') as { severity: string }
    expect(row.severity).toBe('warn')
  })

  it('stores optional project_id', () => {
    emitEvent({ workspace_id: 'ws_1', project_id: 'proj_1', evt_type: 'task_created', actor_type: 'agent', actor_id: 'a1' })
    const db = getDb()
    const row = db.prepare('SELECT project_id FROM events').get() as { project_id: string | null }
    expect(row.project_id).toBe('proj_1')
  })

  it('stores null project_id when not provided', () => {
    emitEvent({ workspace_id: 'ws_1', evt_type: 'task_created', actor_type: 'agent', actor_id: 'a1' })
    const db = getDb()
    const row = db.prepare('SELECT project_id FROM events').get() as { project_id: string | null }
    expect(row.project_id).toBeNull()
  })

  it('stores trace/span/correlation ids', () => {
    emitEvent({
      workspace_id: 'ws_1', evt_type: 'task_created', actor_type: 'agent', actor_id: 'a1',
      trace_id: 'trace-abc', span_id: 'span-def', correlation_id: 'corr-ghi',
    })
    const db = getDb()
    const row = db.prepare('SELECT trace_id, span_id, correlation_id FROM events').get() as Record<string, string>
    expect(row.trace_id).toBe('trace-abc')
    expect(row.span_id).toBe('span-def')
    expect(row.correlation_id).toBe('corr-ghi')
  })

  it('emits multiple events independently', () => {
    emitEvent({ workspace_id: 'ws_1', evt_type: 'task_created', actor_type: 'agent', actor_id: 'a1' })
    emitEvent({ workspace_id: 'ws_1', evt_type: 'agent_run_started', actor_type: 'agent', actor_id: 'a1' })
    emitEvent({ workspace_id: 'ws_1', evt_type: 'agent_run_finished', actor_type: 'agent', actor_id: 'a1' })
    const db = getDb()
    const rows = db.prepare('SELECT evt_id FROM events').all() as { evt_id: string }[]
    expect(rows).toHaveLength(3)
    const ids = rows.map(r => r.evt_id)
    expect(new Set(ids).size).toBe(3)
  })
})
```

### Step 4.2 — Run to confirm failure

```bash
cd packages/core && npx vitest run src/tests/events.test.ts
```

Expected: module not found — `../events.js` does not exist yet.

### Step 4.3 — Implement

File: `packages/core/src/events.ts`

```typescript
import { getDb } from './db/client.js'
import { newId } from './ids.js'
import type { EventType } from './types.js'

export interface EmitEventInput {
  workspace_id: string
  project_id?: string
  evt_type: EventType
  object_type?: string
  object_id?: string
  actor_type: string
  actor_id: string
  payload?: Record<string, unknown>
  severity?: 'debug' | 'info' | 'warn' | 'error'
  trace_id?: string
  span_id?: string
  correlation_id?: string
}

export function emitEvent(input: EmitEventInput): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO events
      (evt_id, workspace_id, project_id, evt_type, ts,
       object_type, object_id, actor_type, actor_id, payload, severity,
       trace_id, span_id, correlation_id)
    VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newId('event'),
    input.workspace_id,
    input.project_id ?? null,
    input.evt_type,
    input.object_type ?? null,
    input.object_id ?? null,
    input.actor_type,
    input.actor_id,
    JSON.stringify(input.payload ?? {}),
    input.severity ?? 'info',
    input.trace_id ?? null,
    input.span_id ?? null,
    input.correlation_id ?? null
  )
}
```

### Step 4.4 — Run to confirm pass

```bash
cd packages/core && npx vitest run src/tests/events.test.ts
```

Expected output:
```
✓ src/tests/events.test.ts (7)
Test Files  1 passed (1)
Tests  7 passed (7)
```

### Step 4.5 — Commit

```bash
git add packages/core/src/events.ts packages/core/src/tests/events.test.ts
git commit -m "$(cat <<'EOF'
feat(core/events): add emitEvent() — synchronous event insertion with evt_ ULID prefix
EOF
)"
```

---

## Task 5 — MIGRATION_002 — all ALTER TABLE + new tables

### Step 5.1 — Write failing test

File: `packages/core/src/tests/migrations.test.ts` — **add** these describe blocks to the existing file (do not replace existing tests):

```typescript
describe('MIGRATION_002 — new columns on workspaces', () => {
  it('workspaces has status column defaulting to active', () => {
    const db = getDb()
    const row = db.prepare("PRAGMA table_info(workspaces)").all() as { name: string }[]
    const cols = row.map(r => r.name)
    expect(cols).toContain('status')
    const ws = db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_m2','m2') RETURNING *").get() as Record<string, unknown>
    expect(ws.status).toBe('active')
  })
})

describe('MIGRATION_002 — new columns on projects', () => {
  it('projects has project_type, root_path, default_branch, parent_project_id, write_mode, status', () => {
    const db = getDb()
    const cols = (db.prepare("PRAGMA table_info(projects)").all() as { name: string }[]).map(r => r.name)
    expect(cols).toContain('project_type')
    expect(cols).toContain('root_path')
    expect(cols).toContain('default_branch')
    expect(cols).toContain('parent_project_id')
    expect(cols).toContain('write_mode')
    expect(cols).toContain('status')
  })
})

describe('MIGRATION_002 — new columns on tasks', () => {
  it('tasks has display_id, issue_id, priority, estimate_type, estimate_value, done_criteria, status_category, claimed_at, completed_at', () => {
    const db = getDb()
    const cols = (db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[]).map(r => r.name)
    for (const col of ['display_id','issue_id','priority','estimate_type','estimate_value','done_criteria','status_category','claimed_at','completed_at']) {
      expect(cols, `missing column: ${col}`).toContain(col)
    }
  })

  it('existing task status values remain valid after migration', () => {
    const db = getDb()
    db.prepare("INSERT INTO workspaces VALUES ('ws_m2','m2',datetime('now'))").run()
    db.prepare("INSERT INTO projects VALUES ('proj_m2','ws_m2','pm2',datetime('now'))").run()
    // Old statuses still valid
    for (const status of ['queued', 'completed', 'blocked']) {
      expect(() =>
        db.prepare("INSERT INTO tasks (task_id, workspace_id, project_id, title, status, display_id, priority, status_category) VALUES (?,?,?,?,?,?,?,?)")
          .run(`t_${status}`, 'ws_m2', 'proj_m2', `task ${status}`, status, `TASK-x`, 'medium', 'backlog')
      ).not.toThrow()
    }
  })
})

describe('MIGRATION_002 — new columns on agent_runs', () => {
  it('agent_runs has display_id, project_id, agent_id, pi_profile, status_category, current_path, heartbeat_at, blocker, worktree_id, finished_at', () => {
    const db = getDb()
    const cols = (db.prepare("PRAGMA table_info(agent_runs)").all() as { name: string }[]).map(r => r.name)
    for (const col of ['display_id','project_id','agent_id','pi_profile','status_category','current_path','heartbeat_at','blocker','worktree_id','finished_at']) {
      expect(cols, `missing column: ${col}`).toContain(col)
    }
  })
})

describe('MIGRATION_002 — new columns on memories', () => {
  it('memories has scope, kind, title, summary, canonical_text, entities, event_time, content_hash, symbol_path, task_id, issue_id, artifact_id, provenance_refs', () => {
    const db = getDb()
    const cols = (db.prepare("PRAGMA table_info(memories)").all() as { name: string }[]).map(r => r.name)
    for (const col of ['scope','kind','title','summary','canonical_text','entities','event_time','content_hash','symbol_path','task_id','issue_id','artifact_id','provenance_refs']) {
      expect(cols, `missing column: ${col}`).toContain(col)
    }
  })
})

describe('MIGRATION_002 — new tables', () => {
  it('display_id_sequences table exists with correct PK', () => {
    const db = getDb()
    const cols = (db.prepare("PRAGMA table_info(display_id_sequences)").all() as { name: string }[]).map(r => r.name)
    expect(cols).toContain('entity_type')
    expect(cols).toContain('project_id')
    expect(cols).toContain('last_value')
  })

  it('events table exists with all 14 columns', () => {
    const db = getDb()
    const cols = (db.prepare("PRAGMA table_info(events)").all() as { name: string }[]).map(r => r.name)
    for (const col of ['evt_id','workspace_id','project_id','evt_type','ts','object_type','object_id','actor_type','actor_id','payload','severity','trace_id','span_id','correlation_id']) {
      expect(cols, `missing column: ${col}`).toContain(col)
    }
  })

  it('task_relations table exists', () => {
    const db = getDb()
    const cols = (db.prepare("PRAGMA table_info(task_relations)").all() as { name: string }[]).map(r => r.name)
    expect(cols).toContain('task_id')
    expect(cols).toContain('target_task_id')
    expect(cols).toContain('relation_type')
    expect(cols).toContain('created_at')
  })

  it('task_labels table exists', () => {
    const db = getDb()
    const cols = (db.prepare("PRAGMA table_info(task_labels)").all() as { name: string }[]).map(r => r.name)
    expect(cols).toContain('task_id')
    expect(cols).toContain('label')
  })
})

describe('MIGRATION_002 — idempotent', () => {
  it('running runMigrations twice does not throw', () => {
    const db = getDb()
    expect(() => runMigrations(db)).not.toThrow()
  })
})
```

Also add the import at the top:
```typescript
import { runMigrations } from '../db/migrations.js'
```

### Step 5.2 — Run to confirm failure

```bash
cd packages/core && npx vitest run src/tests/migrations.test.ts
```

Expected: multiple failures — columns do not exist, tables do not exist.

### Step 5.3 — Implement

Append MIGRATION_002 to `packages/core/src/db/migrations.ts` and update `runMigrations`:

```typescript
const MIGRATION_002 = `
-- workspaces
ALTER TABLE workspaces ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

-- projects
ALTER TABLE projects ADD COLUMN project_type TEXT;
ALTER TABLE projects ADD COLUMN root_path TEXT;
ALTER TABLE projects ADD COLUMN default_branch TEXT;
ALTER TABLE projects ADD COLUMN parent_project_id TEXT REFERENCES projects(project_id);
ALTER TABLE projects ADD COLUMN write_mode TEXT NOT NULL DEFAULT 'sequential';
ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

-- tasks: expand status CHECK to accept new values, add columns
ALTER TABLE tasks ADD COLUMN display_id TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN issue_id TEXT;
ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE tasks ADD COLUMN estimate_type TEXT;
ALTER TABLE tasks ADD COLUMN estimate_value REAL;
ALTER TABLE tasks ADD COLUMN done_criteria TEXT;
ALTER TABLE tasks ADD COLUMN status_category TEXT NOT NULL DEFAULT 'backlog';
ALTER TABLE tasks ADD COLUMN claimed_at TEXT;
ALTER TABLE tasks ADD COLUMN completed_at TEXT;

-- agent_runs: add new columns
ALTER TABLE agent_runs ADD COLUMN display_id TEXT NOT NULL DEFAULT '';
ALTER TABLE agent_runs ADD COLUMN project_id TEXT;
ALTER TABLE agent_runs ADD COLUMN agent_id TEXT NOT NULL DEFAULT '';
ALTER TABLE agent_runs ADD COLUMN pi_profile TEXT;
ALTER TABLE agent_runs ADD COLUMN status_category TEXT NOT NULL DEFAULT 'active';
ALTER TABLE agent_runs ADD COLUMN current_path TEXT;
ALTER TABLE agent_runs ADD COLUMN heartbeat_at TEXT;
ALTER TABLE agent_runs ADD COLUMN blocker TEXT;
ALTER TABLE agent_runs ADD COLUMN worktree_id TEXT;
ALTER TABLE agent_runs ADD COLUMN finished_at TEXT;

-- memories: add new columns
ALTER TABLE memories ADD COLUMN scope TEXT NOT NULL DEFAULT 'project';
ALTER TABLE memories ADD COLUMN kind TEXT NOT NULL DEFAULT 'fact';
ALTER TABLE memories ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE memories ADD COLUMN summary TEXT NOT NULL DEFAULT '';
ALTER TABLE memories ADD COLUMN canonical_text TEXT;
ALTER TABLE memories ADD COLUMN entities TEXT NOT NULL DEFAULT '[]';
ALTER TABLE memories ADD COLUMN event_time TEXT;
ALTER TABLE memories ADD COLUMN content_hash TEXT;
ALTER TABLE memories ADD COLUMN symbol_path TEXT;
ALTER TABLE memories ADD COLUMN task_id TEXT;
ALTER TABLE memories ADD COLUMN issue_id TEXT;
ALTER TABLE memories ADD COLUMN artifact_id TEXT;
ALTER TABLE memories ADD COLUMN provenance_refs TEXT NOT NULL DEFAULT '[]';

-- display_id_sequences
CREATE TABLE IF NOT EXISTS display_id_sequences (
  entity_type TEXT NOT NULL,
  project_id TEXT NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entity_type, project_id)
);

-- events
CREATE TABLE IF NOT EXISTS events (
  evt_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT,
  evt_type TEXT NOT NULL,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  object_type TEXT,
  object_id TEXT,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  severity TEXT NOT NULL DEFAULT 'info',
  trace_id TEXT,
  span_id TEXT,
  correlation_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_workspace ON events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(evt_type);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_object ON events(object_type, object_id);

-- task_relations
CREATE TABLE IF NOT EXISTS task_relations (
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  target_task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, target_task_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_task_relations_target ON task_relations(target_task_id);

-- task_labels
CREATE TABLE IF NOT EXISTS task_labels (
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  PRIMARY KEY (task_id, label)
);

CREATE INDEX IF NOT EXISTS idx_task_labels_label ON task_labels(label);

-- Recreate memories_fts to include title and summary
DROP TRIGGER IF EXISTS memories_fts_insert;
DROP TRIGGER IF EXISTS memories_fts_delete;
DROP TRIGGER IF EXISTS memories_fts_update;
DROP TABLE IF EXISTS memories_fts;

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts
  USING fts5(content, title, summary, canonical_text, content='memories', content_rowid='rowid');

CREATE TRIGGER IF NOT EXISTS memories_fts_insert AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, title, summary, canonical_text)
    VALUES (new.rowid, new.content, new.title, new.summary, new.canonical_text);
END;
CREATE TRIGGER IF NOT EXISTS memories_fts_delete BEFORE DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, title, summary, canonical_text)
    VALUES ('delete', old.rowid, old.content, old.title, old.summary, old.canonical_text);
END;
CREATE TRIGGER IF NOT EXISTS memories_fts_update AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, title, summary, canonical_text)
    VALUES ('delete', old.rowid, old.content, old.title, old.summary, old.canonical_text);
  INSERT INTO memories_fts(rowid, content, title, summary, canonical_text)
    VALUES (new.rowid, new.content, new.title, new.summary, new.canonical_text);
END;
`

export function runMigrations(db: Database.Database): void {
  db.exec(MIGRATION_001)
  db.prepare(`
    INSERT OR IGNORE INTO schema_migrations(name) VALUES ('001_initial')
  `).run()

  // MIGRATION_002 — idempotent via INSERT OR IGNORE sentinel
  const already002 = db.prepare(
    "SELECT id FROM schema_migrations WHERE name = '002_extensions'"
  ).get()
  if (!already002) {
    db.exec(MIGRATION_002)
    db.prepare(`INSERT INTO schema_migrations(name) VALUES ('002_extensions')`).run()
  }

  // Optional: create sqlite-vec virtual table for vector ANN search
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(embedding float[1024])`)
  } catch {
    // sqlite-vec not available — vector recall degrades to FTS5-only if unavailable
  }
}
```

**Important notes on SQLite ALTER TABLE:**
- SQLite does not support removing CHECK constraints via ALTER TABLE. The existing `CHECK(status IN ('queued','in_progress','completed','blocked'))` on tasks.status will remain. To allow new status values, you must recreate the table. Include a table recreation step in MIGRATION_002 if you need to fully expand the CHECK constraints:

```sql
-- In MIGRATION_002, replace the tasks ALTER statements with a full table recreation:
CREATE TABLE tasks_new (
  task_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  display_id TEXT NOT NULL DEFAULT '',
  issue_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  status_category TEXT NOT NULL DEFAULT 'backlog',
  priority TEXT NOT NULL DEFAULT 'medium',
  estimate_type TEXT,
  estimate_value REAL,
  depends_on TEXT NOT NULL DEFAULT '[]',
  assigned_to TEXT,
  note TEXT,
  done_criteria TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  claimed_at TEXT,
  completed_at TEXT
);
INSERT INTO tasks_new SELECT task_id, workspace_id, project_id, '', NULL, title, description, status, 'backlog', 'medium', NULL, NULL, depends_on, assigned_to, note, NULL, version, created_at, updated_at, NULL, NULL FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
-- Recreate tasks_fts triggers (they reference the table, not the virtual table name)
DROP TRIGGER IF EXISTS tasks_fts_insert;
DROP TRIGGER IF EXISTS tasks_fts_delete;
DROP TRIGGER IF EXISTS tasks_fts_update;
CREATE TRIGGER IF NOT EXISTS tasks_fts_insert AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
END;
CREATE TRIGGER IF NOT EXISTS tasks_fts_delete BEFORE DELETE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
END;
CREATE TRIGGER IF NOT EXISTS tasks_fts_update AFTER UPDATE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
  INSERT INTO tasks_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
END;
```

Similarly recreate `agent_runs` without the role CHECK constraint (to support 19 roles):

```sql
CREATE TABLE agent_runs_new (
  run_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id TEXT,
  display_id TEXT NOT NULL DEFAULT '',
  agent_id TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL,
  pi_profile TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  status_category TEXT NOT NULL DEFAULT 'active',
  current_step TEXT,
  current_path TEXT,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  output_summary TEXT,
  artifacts TEXT,
  git_branch TEXT,
  git_commit TEXT,
  heartbeat_at TEXT,
  blocker TEXT,
  worktree_id TEXT,
  events TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  finished_at TEXT
);
INSERT INTO agent_runs_new SELECT run_id, task_id, workspace_id, NULL, '', '', role, NULL, status, 'active', current_step, NULL, progress_pct, output_summary, artifacts, git_branch, git_commit, NULL, NULL, NULL, events, version, started_at, updated_at, completed_at, NULL FROM agent_runs;
DROP TABLE agent_runs;
ALTER TABLE agent_runs_new RENAME TO agent_runs;
CREATE INDEX IF NOT EXISTS idx_runs_workspace ON agent_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_runs_task ON agent_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_updated ON agent_runs(updated_at);
```

Use these full table recreations in the actual MIGRATION_002 string instead of the simple ALTER TABLE ADD COLUMN statements for tasks and agent_runs.

### Step 5.4 — Run to confirm pass

```bash
cd packages/core && npx vitest run src/tests/migrations.test.ts
```

Expected output:
```
✓ src/tests/migrations.test.ts (all passing)
Test Files  1 passed (1)
```

### Step 5.5 — Run full suite

```bash
cd packages/core && npx vitest run
```

Expected: all previous tests still passing.

### Step 5.6 — Commit

```bash
git add packages/core/src/db/migrations.ts packages/core/src/tests/migrations.test.ts
git commit -m "$(cat <<'EOF'
feat(core/migrations): MIGRATION_002 — expand schema with display IDs, events, task_relations, task_labels, enriched memory columns
EOF
)"
```

---

## Task 6 — Update createTask + updateTask

### Step 6.1 — Write failing tests

Add to `packages/core/src/tests/tasks.test.ts`:

```typescript
describe('createTask — display_id and status_category', () => {
  it('generates a display_id with TASK- prefix', async () => {
    seed()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T1' })
    expect(task.display_id).toMatch(/^TASK-\d+$/)
  })

  it('auto-increments display_id within the same project', async () => {
    seed()
    const t1 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T1' })
    const t2 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T2' })
    expect(t1.display_id).toBe('TASK-1')
    expect(t2.display_id).toBe('TASK-2')
  })

  it('sets status_category to backlog for queued tasks', async () => {
    seed()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    expect(task.status_category).toBe('backlog')
  })

  it('emits a task_created event', async () => {
    seed()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Event test' })
    const db = getDb()
    const evt = db.prepare("SELECT * FROM events WHERE evt_type = 'task_created' AND object_id = ?").get(task.task_id) as Record<string, unknown> | undefined
    expect(evt).toBeTruthy()
    expect(evt!.object_type).toBe('task')
  })

  it('sets priority to medium by default', async () => {
    seed()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    expect(task.priority).toBe('medium')
  })
})

describe('updateTask — status_category and events', () => {
  it('updates status_category when status changes to completed', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    const updated = await updateTask({ task_id: t.task_id, status: 'completed' })
    expect(updated.status_category).toBe('done')
  })

  it('updates status_category when status changes to blocked', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    const updated = await updateTask({ task_id: t.task_id, status: 'blocked' })
    expect(updated.status_category).toBe('blocked')
  })

  it('emits task_status_changed event when status changes', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    await updateTask({ task_id: t.task_id, status: 'running' })
    const db = getDb()
    const evt = db.prepare("SELECT * FROM events WHERE evt_type = 'task_status_changed' AND object_id = ?").get(t.task_id) as Record<string, unknown> | undefined
    expect(evt).toBeTruthy()
  })

  it('does not emit task_status_changed when only note changes', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    await updateTask({ task_id: t.task_id, note: 'just a note' })
    const db = getDb()
    const evt = db.prepare("SELECT * FROM events WHERE evt_type = 'task_status_changed' AND object_id = ?").get(t.task_id) as Record<string, unknown> | undefined
    expect(evt).toBeUndefined()
  })
})
```

### Step 6.2 — Run to confirm failure

```bash
cd packages/core && npx vitest run src/tests/tasks.test.ts
```

Expected: display_id undefined, status_category undefined, no events table populated.

### Step 6.3 — Implement

Replace `packages/core/src/tasks.ts`:

```typescript
import { getDb } from './db/client.js'
import { newId, nextDisplayId } from './ids.js'
import { statusCategory } from './status-category.js'
import { emitEvent } from './events.js'
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
  priority?: 'critical' | 'high' | 'medium' | 'low' | 'none'
  done_criteria?: string
  issue_id?: string
}

interface UpdateTaskInput {
  task_id: string
  status?: TaskStatus
  note?: string
  assigned_to?: string
  description?: string
  expected_version?: number
  priority?: 'critical' | 'high' | 'medium' | 'low' | 'none'
  done_criteria?: string
  claimed_at?: string | null
  completed_at?: string | null
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    task_id: row.task_id as string,
    workspace_id: row.workspace_id as string,
    project_id: row.project_id as string,
    issue_id: (row.issue_id as string | null) ?? null,
    display_id: (row.display_id as string) || '',
    title: row.title as string,
    description: row.description as string | null,
    status: row.status as TaskStatus,
    status_category: (row.status_category as string) as import('./types.js').StatusCategory || statusCategory(row.status as string),
    priority: ((row.priority as string) || 'medium') as Task['priority'],
    estimate_type: (row.estimate_type as Task['estimate_type']) ?? null,
    estimate_value: (row.estimate_value as number | null) ?? null,
    assigned_to: row.assigned_to as string | null,
    note: row.note as string | null,
    done_criteria: (row.done_criteria as string | null) ?? null,
    version: row.version as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    claimed_at: (row.claimed_at as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
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
  if (!input.title.trim()) throw new FulcrumError('title must not be empty', 'invalid_input')
  const db = getDb()
  const task_id = newId('task')
  const now = new Date().toISOString()
  const display_id = nextDisplayId('task', input.project_id, db)
  const initialStatus = 'queued'
  const sc = statusCategory(initialStatus)
  const priority = input.priority ?? 'medium'

  db.prepare(`
    INSERT INTO tasks
      (task_id, workspace_id, project_id, display_id, issue_id, title, description,
       status, status_category, priority, depends_on, assigned_to, note, done_criteria,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task_id,
    input.workspace_id,
    input.project_id,
    display_id,
    input.issue_id ?? null,
    input.title,
    input.description ?? null,
    initialStatus,
    sc,
    priority,
    JSON.stringify(input.depends_on ?? []),
    input.assigned_to ?? null,
    null,
    input.done_criteria ?? null,
    now,
    now
  )

  emitEvent({
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    evt_type: 'task_created',
    object_type: 'task',
    object_id: task_id,
    actor_type: 'system',
    actor_id: 'core',
    payload: { display_id, title: input.title, status: initialStatus },
  })

  const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(task_id) as Record<string, unknown> | undefined
  if (!row) throw new FulcrumError(`Task ${task_id} not found after insert`, 'not_found')
  return rowToTask(row)
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

  const fields: string[] = ['version = version + 1', 'updated_at = ?']
  const values: unknown[] = [new Date().toISOString()]

  const statusChanging = input.status !== undefined && input.status !== (existing.status as string)

  if (input.status !== undefined) {
    fields.push('status = ?'); values.push(input.status)
    fields.push('status_category = ?'); values.push(statusCategory(input.status))
  }
  if (input.note !== undefined) { fields.push('note = ?'); values.push(input.note) }
  if (input.assigned_to !== undefined) { fields.push('assigned_to = ?'); values.push(input.assigned_to) }
  if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description) }
  if (input.priority !== undefined) { fields.push('priority = ?'); values.push(input.priority) }
  if (input.done_criteria !== undefined) { fields.push('done_criteria = ?'); values.push(input.done_criteria) }
  if (input.claimed_at !== undefined) { fields.push('claimed_at = ?'); values.push(input.claimed_at) }
  if (input.completed_at !== undefined) { fields.push('completed_at = ?'); values.push(input.completed_at) }

  values.push(input.task_id)
  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE task_id = ?`).run(...values)

  if (statusChanging) {
    emitEvent({
      workspace_id: existing.workspace_id as string,
      project_id: existing.project_id as string,
      evt_type: 'task_status_changed',
      object_type: 'task',
      object_id: input.task_id,
      actor_type: 'system',
      actor_id: 'core',
      payload: {
        from_status: existing.status as string,
        to_status: input.status as string,
        to_category: statusCategory(input.status as string),
      },
    })
  }

  const updated = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(input.task_id) as Record<string, unknown> | undefined
  if (!updated) throw new FulcrumError(`Task ${input.task_id} not found after update`, 'not_found')
  return rowToTask(updated)
}
```

### Step 6.4 — Run to confirm pass

```bash
cd packages/core && npx vitest run src/tests/tasks.test.ts
```

Expected: all task tests pass including new display_id and event tests.

### Step 6.5 — Run full suite

```bash
cd packages/core && npx vitest run
```

### Step 6.6 — Commit

```bash
git add packages/core/src/tasks.ts packages/core/src/tests/tasks.test.ts
git commit -m "$(cat <<'EOF'
feat(core/tasks): generate display_id, set status_category, emit task_created + task_status_changed events
EOF
)"
```

---

## Task 7 — Update startAgentRun, completeAgentRun, blockAgentRun

### Step 7.1 — Write failing tests

Add to `packages/core/src/tests/runs.test.ts`:

```typescript
describe('startAgentRun — display_id, agent_id, status_category, events', () => {
  it('generates a RUN- display_id', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer', agent_id: 'agent-abc' })
    expect(run.display_id).toMatch(/^RUN-\d+$/)
  })

  it('stores agent_id from input', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer', agent_id: 'agent-xyz' })
    expect(run.agent_id).toBe('agent-xyz')
  })

  it('sets status_category to active', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer', agent_id: 'a1' })
    expect(run.status_category).toBe('active')
  })

  it('emits agent_run_created and agent_run_started events', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer', agent_id: 'a1' })
    const db = getDb()
    const created = db.prepare("SELECT * FROM events WHERE evt_type = 'agent_run_created' AND object_id = ?").get(run.run_id)
    const started = db.prepare("SELECT * FROM events WHERE evt_type = 'agent_run_started' AND object_id = ?").get(run.run_id)
    expect(created).toBeTruthy()
    expect(started).toBeTruthy()
  })
})

describe('heartbeatAgentRun — heartbeat_at', () => {
  it('updates heartbeat_at on each call', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer', agent_id: 'a1' })
    await heartbeatAgentRun({ run_id: run.run_id, current_step: 'step', progress_pct: 10 })
    const updated = await getAgentRunStatus({ run_id: run.run_id })
    expect(updated.heartbeat_at).toBeTruthy()
  })
})

describe('completeAgentRun — finished_at, status_category, event', () => {
  it('sets finished_at on completion', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer', agent_id: 'a1' })
    const completed = await completeAgentRun({ run_id: run.run_id, output_summary: 'done' })
    expect(completed.finished_at).toBeTruthy()
  })

  it('sets status_category to done on completion', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer', agent_id: 'a1' })
    const completed = await completeAgentRun({ run_id: run.run_id, output_summary: 'done' })
    expect(completed.status_category).toBe('done')
  })

  it('emits agent_run_finished event', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer', agent_id: 'a1' })
    const completed = await completeAgentRun({ run_id: run.run_id, output_summary: 'done' })
    const db = getDb()
    const evt = db.prepare("SELECT * FROM events WHERE evt_type = 'agent_run_finished' AND object_id = ?").get(completed.run_id)
    expect(evt).toBeTruthy()
  })
})

describe('blockAgentRun — blocker field, status_category, event', () => {
  it('sets blocker field with the reason', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'reviewer', agent_id: 'a1' })
    const blocked = await blockAgentRun({ run_id: run.run_id, reason: 'waiting for review' })
    expect(blocked.blocker).toBe('waiting for review')
  })

  it('sets status_category to blocked', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'reviewer', agent_id: 'a1' })
    const blocked = await blockAgentRun({ run_id: run.run_id, reason: 'reason' })
    expect(blocked.status_category).toBe('blocked')
  })

  it('emits agent_run_blocked event', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'reviewer', agent_id: 'a1' })
    const blocked = await blockAgentRun({ run_id: run.run_id, reason: 'reason' })
    const db = getDb()
    const evt = db.prepare("SELECT * FROM events WHERE evt_type = 'agent_run_blocked' AND object_id = ?").get(blocked.run_id)
    expect(evt).toBeTruthy()
  })
})
```

### Step 7.2 — Run to confirm failure

```bash
cd packages/core && npx vitest run src/tests/runs.test.ts
```

Expected: agent_id not accepted, display_id missing, heartbeat_at not populated.

### Step 7.3 — Implement

Replace `packages/core/src/runs.ts`:

```typescript
import { execSync } from 'child_process'
import { getDb } from './db/client.js'
import { newId, nextDisplayId } from './ids.js'
import { statusCategory } from './status-category.js'
import { emitEvent } from './events.js'
import { createTask } from './tasks.js'
import { FulcrumError } from './types.js'
import type { AgentRun, AgentRole, AgentRunStatus, RunArtifacts, Task } from './types.js'

interface StartRunInput {
  task_id: string
  workspace_id: string
  role: AgentRole
  agent_id?: string
  pi_profile?: string
  git_branch?: string
}
interface HeartbeatInput {
  run_id: string
  current_step: string
  progress_pct: number
  current_path?: string
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
    const opts = { stdio: ['ignore', 'pipe', 'ignore'] as ['ignore', 'pipe', 'ignore'], timeout: 3000 }
    const branch = execSync('git rev-parse --abbrev-ref HEAD', opts).toString().trim()
    const commit = execSync('git rev-parse HEAD', opts).toString().trim()
    return { git_branch: branch === 'HEAD' ? null : branch, git_commit: commit }
  } catch {
    return { git_branch: null, git_commit: null }
  }
}

export function rowToRun(row: Record<string, unknown>): AgentRun {
  return {
    run_id: row.run_id as string,
    task_id: row.task_id as string,
    workspace_id: row.workspace_id as string,
    project_id: (row.project_id as string) || '',
    display_id: (row.display_id as string) || '',
    agent_id: (row.agent_id as string) || '',
    role: row.role as AgentRole,
    pi_profile: (row.pi_profile as string | null) ?? null,
    status: row.status as AgentRunStatus,
    status_category: ((row.status_category as string) || statusCategory(row.status as string)) as AgentRun['status_category'],
    current_step: row.current_step as string | null,
    current_path: (row.current_path as string | null) ?? null,
    progress_pct: row.progress_pct as number,
    output_summary: row.output_summary as string | null,
    artifacts: row.artifacts
      ? ((): RunArtifacts => { try { return JSON.parse(row.artifacts as string) as RunArtifacts } catch { return {} } })()
      : null,
    git_branch: row.git_branch as string | null,
    git_commit: row.git_commit as string | null,
    heartbeat_at: (row.heartbeat_at as string | null) ?? null,
    blocker: (row.blocker as string | null) ?? null,
    worktree_id: (row.worktree_id as string | null) ?? null,
    version: row.version as number,
    started_at: row.started_at as string,
    updated_at: row.updated_at as string,
    finished_at: (row.finished_at as string | null) ?? null,
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
  const taskRow = db.prepare('SELECT workspace_id, project_id FROM tasks WHERE task_id = ?')
    .get(input.task_id) as { workspace_id: string; project_id: string } | undefined
  if (!taskRow) throw new FulcrumError(`Task ${input.task_id} not found`, 'not_found')
  if (taskRow.workspace_id !== input.workspace_id) {
    throw new FulcrumError(
      `Task ${input.task_id} belongs to workspace ${taskRow.workspace_id}, not ${input.workspace_id}`,
      'invalid_input'
    )
  }
  const run_id = newId('run')
  const now = new Date().toISOString()
  const { git_branch, git_commit } = captureGitContext()
  const display_id = nextDisplayId('run', taskRow.project_id, db)
  const agent_id = input.agent_id ?? ''
  const initialStatus = 'running'
  const sc = statusCategory(initialStatus)

  db.prepare(`
    INSERT INTO agent_runs
      (run_id, task_id, workspace_id, project_id, display_id, agent_id, role, pi_profile,
       status, status_category, git_branch, git_commit, started_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run_id, input.task_id, input.workspace_id, taskRow.project_id,
    display_id, agent_id, input.role, input.pi_profile ?? null,
    initialStatus, sc, git_branch, git_commit, now, now
  )

  emitEvent({
    workspace_id: input.workspace_id,
    project_id: taskRow.project_id,
    evt_type: 'agent_run_created',
    object_type: 'agent_run',
    object_id: run_id,
    actor_type: 'agent',
    actor_id: agent_id || 'system',
    payload: { display_id, role: input.role, task_id: input.task_id },
  })
  emitEvent({
    workspace_id: input.workspace_id,
    project_id: taskRow.project_id,
    evt_type: 'agent_run_started',
    object_type: 'agent_run',
    object_id: run_id,
    actor_type: 'agent',
    actor_id: agent_id || 'system',
    payload: { display_id, role: input.role },
  })

  return getRun(run_id)
}

export async function heartbeatAgentRun(input: HeartbeatInput): Promise<void> {
  if (input.progress_pct < 0 || input.progress_pct > 100) {
    throw new FulcrumError('progress_pct must be between 0 and 100', 'invalid_input')
  }
  const db = getDb()
  const now = new Date().toISOString()
  const result = db.prepare(`
    UPDATE agent_runs
    SET current_step = ?, progress_pct = ?, heartbeat_at = ?,
        current_path = COALESCE(?, current_path),
        updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(
    input.current_step, input.progress_pct, now,
    input.current_path ?? null,
    now, input.run_id
  )
  if (result.changes === 0) throw new FulcrumError(`Run ${input.run_id} not found`, 'not_found')
}

export async function getAgentRunStatus(input: GetStatusInput): Promise<AgentRun> {
  return getRun(input.run_id)
}

export async function completeAgentRun(input: CompleteRunInput): Promise<AgentRun> {
  const run = getRun(input.run_id) // throws not_found before any mutation
  const db = getDb()
  const now = new Date().toISOString()
  const doneCategory = statusCategory('finished')
  db.prepare(`
    UPDATE agent_runs
    SET status = 'finished', status_category = ?, output_summary = ?, artifacts = ?,
        finished_at = ?, completed_at = ?, updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(
    doneCategory,
    input.output_summary,
    input.artifacts ? JSON.stringify(input.artifacts) : null,
    now, now, now, input.run_id
  )

  emitEvent({
    workspace_id: run.workspace_id,
    project_id: run.project_id || undefined,
    evt_type: 'agent_run_finished',
    object_type: 'agent_run',
    object_id: input.run_id,
    actor_type: 'agent',
    actor_id: run.agent_id || 'system',
    payload: { output_summary: input.output_summary },
  })

  return getRun(input.run_id)
}

export async function blockAgentRun(input: BlockRunInput): Promise<AgentRun> {
  if (!input.reason.trim()) throw new FulcrumError('reason must not be empty', 'invalid_input')
  const run = getRun(input.run_id) // throws not_found before any mutation
  const db = getDb()
  const blockedCategory = statusCategory('blocked')
  db.prepare(`
    UPDATE agent_runs
    SET status = 'blocked', status_category = ?, blocker = ?, output_summary = ?,
        updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(blockedCategory, input.reason, input.reason, new Date().toISOString(), input.run_id)

  emitEvent({
    workspace_id: run.workspace_id,
    project_id: run.project_id || undefined,
    evt_type: 'agent_run_blocked',
    object_type: 'agent_run',
    object_id: input.run_id,
    actor_type: 'agent',
    actor_id: run.agent_id || 'system',
    payload: { reason: input.reason },
  })

  return getRun(input.run_id)
}

export async function escalateRun(input: EscalateRunInput): Promise<Task> {
  if (!input.escalation_reason.trim()) throw new FulcrumError('escalation_reason must not be empty', 'invalid_input')
  const db = getDb()
  const run = getRun(input.run_id)

  db.prepare(`
    UPDATE agent_runs SET status = 'aborted', status_category = 'done', updated_at = ?, version = version + 1
    WHERE run_id = ?
  `).run(new Date().toISOString(), input.run_id)

  const taskRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?')
    .get(run.task_id) as Record<string, unknown> | undefined
  if (!taskRow) throw new FulcrumError(`Task ${run.task_id} not found during escalation`, 'not_found')

  return createTask({
    workspace_id: run.workspace_id,
    project_id: taskRow.project_id as string,
    title: `Escalation: ${taskRow.title as string} (run ${run.run_id})`,
    description: `Run ${run.run_id} (role: ${run.role}) was escalated.\n\nReason: ${input.escalation_reason}`,
    assigned_to: 'chief_of_staff',
  })
}
```

**Note on backward compat:** The existing `completeAgentRun` set `status = 'completed'`. The new version sets `status = 'finished'` to match `AgentRunStatus`. The existing test `expect(completed.status).toBe('completed')` will need updating to `'finished'`. Update that assertion in the existing runs test.

### Step 7.4 — Run to confirm pass

```bash
cd packages/core && npx vitest run src/tests/runs.test.ts
```

Expected: all run tests pass.

### Step 7.5 — Run full suite

```bash
cd packages/core && npx vitest run
```

### Step 7.6 — Commit

```bash
git add packages/core/src/runs.ts packages/core/src/tests/runs.test.ts
git commit -m "$(cat <<'EOF'
feat(core/runs): generate display_id, store agent_id, heartbeat_at, blocker, finished_at; emit run lifecycle events
EOF
)"
```

---

## Task 8 — Update writeMemory to accept scope/kind/title/summary

### Step 8.1 — Write failing tests

Add to `packages/core/src/tests/memory.test.ts`:

```typescript
describe('writeMemory — scope, kind, title, summary', () => {
  it('defaults scope to project', async () => {
    seed()
    const m = await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'A fact about the project' })
    expect(m.scope).toBe('project')
  })

  it('defaults kind to fact', async () => {
    seed()
    const m = await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'Some content here' })
    expect(m.kind).toBe('fact')
  })

  it('defaults title to first 80 chars of content', async () => {
    seed()
    const content = 'This is a memory with some content that is more than 80 characters in total length for testing'
    const m = await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content })
    expect(m.title).toBe(content.slice(0, 80))
  })

  it('defaults summary to title', async () => {
    seed()
    const m = await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'Short content' })
    expect(m.summary).toBe(m.title)
  })

  it('accepts explicit scope, kind, title, summary', async () => {
    seed()
    const m = await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      content: 'Detailed content here',
      scope: 'global', kind: 'decision',
      title: 'Custom title', summary: 'Custom summary',
    })
    expect(m.scope).toBe('global')
    expect(m.kind).toBe('decision')
    expect(m.title).toBe('Custom title')
    expect(m.summary).toBe('Custom summary')
  })
})
```

### Step 8.2 — Run to confirm failure

```bash
cd packages/core && npx vitest run src/tests/memory.test.ts
```

Expected: scope, kind, title, summary are undefined on returned Memory.

### Step 8.3 — Implement

Update `WriteMemoryInput` interface and `writeMemory` in `packages/core/src/memory.ts`:

```typescript
// Update the interface
interface WriteMemoryInput {
  workspace_id: string
  project_id: string
  content: string
  tags?: string[]
  confidence?: number
  embedding?: Float32Array
  scope?: import('./types.js').MemoryScope
  kind?: import('./types.js').MemoryKind
  title?: string
  summary?: string
  canonical_text?: string
  entities?: string[]
  task_id?: string
  issue_id?: string
  artifact_id?: string
  provenance_refs?: string[]
}
```

Update `rowToMemory` to map new fields:

```typescript
function rowToMemory(row: Record<string, unknown>): Memory {
  const content = row.content as string
  const defaultTitle = content.slice(0, 80)
  return {
    memory_id: row.memory_id as string,
    scope: ((row.scope as string) || 'project') as import('./types.js').MemoryScope,
    kind: ((row.kind as string) || 'fact') as import('./types.js').MemoryKind,
    workspace_id: row.workspace_id as string,
    project_id: row.project_id as string | null,
    file_path: (row.file_path as string | null) ?? null,
    symbol_path: (row.symbol_path as string | null) ?? null,
    title: (row.title as string) || defaultTitle,
    summary: (row.summary as string) || (row.title as string) || defaultTitle,
    canonical_text: (row.canonical_text as string | null) ?? null,
    tags: (() => { try { return JSON.parse(row.tags as string) as string[] } catch { return [] } })(),
    entities: (() => { try { return JSON.parse((row.entities as string) || '[]') as string[] } catch { return [] } })(),
    confidence: row.confidence as number,
    access_count: row.access_count as number,
    event_time: (row.event_time as string | null) ?? null,
    content_hash: (row.content_hash as string | null) ?? null,
    task_id: (row.task_id as string | null) ?? null,
    issue_id: (row.issue_id as string | null) ?? null,
    artifact_id: (row.artifact_id as string | null) ?? null,
    provenance_refs: (() => { try { return JSON.parse((row.provenance_refs as string) || '[]') as string[] } catch { return [] } })(),
    embedding: (row.embedding as Buffer | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    last_accessed_at: row.last_accessed_at as string,
  }
}
```

Update the INSERT in `writeMemory` to include new fields:

```typescript
// In the INSERT block, replace the existing INSERT statement:
const memory_id = newId('memory')  // use newId instead of ulid() directly
const defaultTitle = input.content.slice(0, 80)
const title = input.title ?? defaultTitle
const summary = input.summary ?? title
const scope = input.scope ?? 'project'
const kind = input.kind ?? 'fact'
const embeddingBuffer = input.embedding ? Buffer.from(input.embedding.buffer) : null

db.prepare(`
  INSERT INTO memories
    (memory_id, workspace_id, project_id, content, tags, confidence, embedding,
     scope, kind, title, summary, canonical_text, entities,
     task_id, issue_id, artifact_id, provenance_refs,
     created_at, updated_at, last_accessed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  memory_id,
  input.workspace_id,
  input.project_id,
  input.content,
  JSON.stringify(input.tags ?? []),
  input.confidence ?? 1.0,
  embeddingBuffer,
  scope,
  kind,
  title,
  summary,
  input.canonical_text ?? null,
  JSON.stringify(input.entities ?? []),
  input.task_id ?? null,
  input.issue_id ?? null,
  input.artifact_id ?? null,
  JSON.stringify(input.provenance_refs ?? []),
  now, now, now
)
```

Also update the existing-match UPDATE paths to preserve scope/kind/title/summary.

Update the import at the top of memory.ts: replace `ulid` with `newId`:
```typescript
import { newId } from './ids.js'
// Remove: import { ulid } from 'ulid'
```

### Step 8.4 — Run to confirm pass

```bash
cd packages/core && npx vitest run src/tests/memory.test.ts
```

Expected: all memory tests pass including new scope/kind/title/summary tests.

### Step 8.5 — Run full suite

```bash
cd packages/core && npx vitest run
```

### Step 8.6 — Commit

```bash
git add packages/core/src/memory.ts packages/core/src/tests/memory.test.ts
git commit -m "$(cat <<'EOF'
feat(core/memory): accept scope/kind/title/summary in writeMemory, default title to first 80 chars of content
EOF
)"
```

---

## Task 9 — Update listAgentProfiles to return all 19 roles

### Step 9.1 — Write failing test

Add to `packages/core/src/tests/status.test.ts`:

```typescript
describe('listAgentProfiles — all 19 roles', () => {
  it('returns exactly 19 agent profiles', async () => {
    const profiles = await listAgentProfiles()
    expect(profiles).toHaveLength(19)
  })

  it('includes all 19 expected roles', async () => {
    const profiles = await listAgentProfiles()
    const roles = profiles.map(p => p.role)
    const expected = [
      'chief_of_staff', 'context_gatherer', 'prd_planner', 'implementation_planner',
      'issue_decomposer', 'architecture_reviewer', 'research_worker',
      'implementer_backend', 'implementer_frontend', 'implementer',
      'refactor_worker', 'browser_worker', 'tester', 'reviewer',
      'security_reviewer', 'performance_reviewer', 'integration_worker',
      'planner', 'researcher',
    ]
    for (const role of expected) {
      expect(roles, `missing role: ${role}`).toContain(role)
    }
  })

  it('chief_of_staff can create teams and dispatch agents', async () => {
    const profiles = await listAgentProfiles()
    const cos = profiles.find(p => p.role === 'chief_of_staff')
    expect(cos?.can_create_teams).toBe(true)
    expect(cos?.can_dispatch_agents).toBe(true)
  })

  it('all non-CoS roles have can_create_teams false', async () => {
    const profiles = await listAgentProfiles()
    for (const p of profiles) {
      if (p.role !== 'chief_of_staff') {
        expect(p.can_create_teams, `${p.role} should not create teams`).toBe(false)
      }
    }
  })
})
```

### Step 9.2 — Run to confirm failure

```bash
cd packages/core && npx vitest run src/tests/status.test.ts
```

Expected: only 6 profiles returned, test fails on length check.

### Step 9.3 — Implement

Replace the `AGENT_PROFILES` constant in `packages/core/src/status.ts`:

```typescript
const AGENT_PROFILES: AgentProfile[] = [
  { role: 'chief_of_staff',        description: 'Plans work, creates teams, dispatches agents, reviews CoS context', can_create_teams: true,  can_dispatch_agents: true  },
  { role: 'context_gatherer',      description: 'Gathers context about codebase, requirements, and environment',     can_create_teams: false, can_dispatch_agents: false },
  { role: 'prd_planner',           description: 'Writes Product Requirements Documents from high-level specs',       can_create_teams: false, can_dispatch_agents: false },
  { role: 'implementation_planner',description: 'Breaks PRDs into detailed implementation plans',                    can_create_teams: false, can_dispatch_agents: false },
  { role: 'issue_decomposer',      description: 'Decomposes issues into atomic tasks with acceptance criteria',      can_create_teams: false, can_dispatch_agents: false },
  { role: 'architecture_reviewer', description: 'Reviews architectural decisions and system design',                 can_create_teams: false, can_dispatch_agents: false },
  { role: 'research_worker',       description: 'Investigates unknowns, evaluates libraries and approaches',        can_create_teams: false, can_dispatch_agents: false },
  { role: 'implementer_backend',   description: 'Implements backend features, APIs, and data layers',               can_create_teams: false, can_dispatch_agents: false },
  { role: 'implementer_frontend',  description: 'Implements frontend features, UI components, and styles',          can_create_teams: false, can_dispatch_agents: false },
  { role: 'implementer',           description: 'Writes code and implements features across the stack',             can_create_teams: false, can_dispatch_agents: false },
  { role: 'refactor_worker',       description: 'Improves code quality, reduces duplication, applies patterns',     can_create_teams: false, can_dispatch_agents: false },
  { role: 'browser_worker',        description: 'Performs browser automation, web scraping, and UI testing',        can_create_teams: false, can_dispatch_agents: false },
  { role: 'tester',                description: 'Writes and runs tests, validates implementations',                  can_create_teams: false, can_dispatch_agents: false },
  { role: 'reviewer',              description: 'Reviews code and provides structured feedback',                     can_create_teams: false, can_dispatch_agents: false },
  { role: 'security_reviewer',     description: 'Audits code for security vulnerabilities and policy violations',    can_create_teams: false, can_dispatch_agents: false },
  { role: 'performance_reviewer',  description: 'Profiles performance and identifies bottlenecks',                  can_create_teams: false, can_dispatch_agents: false },
  { role: 'integration_worker',    description: 'Integrates components, resolves merge conflicts, coordinates deps', can_create_teams: false, can_dispatch_agents: false },
  { role: 'planner',               description: 'Breaks down epics into tasks and defines acceptance criteria',      can_create_teams: false, can_dispatch_agents: false },
  { role: 'researcher',            description: 'Investigates unknowns, gathers information for the team',          can_create_teams: false, can_dispatch_agents: false },
]
```

Also fix the import to use `WorkspaceStatusResult` instead of `WorkspaceStatus`:

```typescript
import type { AgentProfile, WorkspaceStatusResult } from './types.js'
```

Update the `getWorkspaceStatus` return type and the object literal inside to use `WorkspaceStatusResult`.

### Step 9.4 — Run to confirm pass

```bash
cd packages/core && npx vitest run src/tests/status.test.ts
```

Expected: all status tests pass including new profile tests.

### Step 9.5 — Run full suite

```bash
cd packages/core && npx vitest run
```

### Step 9.6 — Commit

```bash
git add packages/core/src/status.ts packages/core/src/tests/status.test.ts
git commit -m "$(cat <<'EOF'
feat(core/status): expand listAgentProfiles to all 19 roles with accurate descriptions
EOF
)"
```

---

## Task 10 — Integration test: full lifecycle with events, display IDs, task relations

### Step 10.1 — Write test

File: `packages/core/src/tests/integration.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { createTask, updateTask, listTasks } from '../tasks.js'
import { startAgentRun, heartbeatAgentRun, completeAgentRun, blockAgentRun, getAgentRunStatus } from '../runs.js'
import { writeMemory, recallMemory } from '../memory.js'
import { listAgentProfiles, getWorkspaceStatus } from '../status.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces VALUES ('ws_1','Acme Corp',datetime('now'))").run()
  db.prepare("INSERT INTO projects VALUES ('proj_1','ws_1','Backend API',datetime('now'))").run()
}

describe('full lifecycle integration', () => {
  it('task creation emits task_created event with display_id', async () => {
    seed()
    const task = await createTask({
      workspace_id: 'ws_1', project_id: 'proj_1',
      title: 'Implement auth endpoint',
      description: 'POST /auth/login with JWT response',
    })
    expect(task.display_id).toBe('TASK-1')
    expect(task.status_category).toBe('backlog')
    expect(task.priority).toBe('medium')

    const db = getDb()
    const evt = db.prepare("SELECT * FROM events WHERE object_id = ? AND evt_type = 'task_created'").get(task.task_id) as Record<string, unknown>
    expect(evt).toBeTruthy()
    expect(JSON.parse(evt.payload as string)).toMatchObject({ display_id: 'TASK-1' })
  })

  it('agent run lifecycle: created → running → heartbeat → finished', async () => {
    seed()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Auth endpoint' })
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer_backend', agent_id: 'agent-001' })

    expect(run.display_id).toBe('RUN-1')
    expect(run.agent_id).toBe('agent-001')
    expect(run.status_category).toBe('active')

    await heartbeatAgentRun({ run_id: run.run_id, current_step: 'Writing auth handler', progress_pct: 30, current_path: 'src/auth/handler.ts' })
    const mid = await getAgentRunStatus({ run_id: run.run_id })
    expect(mid.current_step).toBe('Writing auth handler')
    expect(mid.heartbeat_at).toBeTruthy()
    expect(mid.current_path).toBe('src/auth/handler.ts')

    const completed = await completeAgentRun({
      run_id: run.run_id,
      output_summary: 'Auth endpoint implemented with JWT',
      artifacts: { files_changed: ['src/auth/handler.ts'], tests_passed: 12 },
    })
    expect(completed.status).toBe('finished')
    expect(completed.status_category).toBe('done')
    expect(completed.finished_at).toBeTruthy()

    const db = getDb()
    const evts = db.prepare("SELECT evt_type FROM events WHERE object_id = ? ORDER BY rowid ASC").all(run.run_id) as { evt_type: string }[]
    const types = evts.map(e => e.evt_type)
    expect(types).toContain('agent_run_created')
    expect(types).toContain('agent_run_started')
    expect(types).toContain('agent_run_finished')
  })

  it('blocking a run sets blocker, status_category=blocked, emits event', async () => {
    seed()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Review PR' })
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'reviewer', agent_id: 'agent-002' })
    const blocked = await blockAgentRun({ run_id: run.run_id, reason: 'CI checks still running' })

    expect(blocked.status).toBe('blocked')
    expect(blocked.blocker).toBe('CI checks still running')
    expect(blocked.status_category).toBe('blocked')

    const db = getDb()
    const evt = db.prepare("SELECT * FROM events WHERE evt_type = 'agent_run_blocked' AND object_id = ?").get(run.run_id)
    expect(evt).toBeTruthy()
  })

  it('task status changes emit task_status_changed event with from/to', async () => {
    seed()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'A task' })
    await updateTask({ task_id: task.task_id, status: 'running' })
    await updateTask({ task_id: task.task_id, status: 'completed' })

    const db = getDb()
    const evts = db.prepare("SELECT payload FROM events WHERE evt_type = 'task_status_changed' AND object_id = ? ORDER BY rowid ASC").all(task.task_id) as { payload: string }[]
    expect(evts).toHaveLength(2)
    const first = JSON.parse(evts[0].payload) as Record<string, string>
    const second = JSON.parse(evts[1].payload) as Record<string, string>
    expect(first.from_status).toBe('queued')
    expect(first.to_status).toBe('running')
    expect(second.from_status).toBe('running')
    expect(second.to_status).toBe('completed')
    expect(second.to_category).toBe('done')
  })

  it('task relations can be inserted and queried', async () => {
    seed()
    const t1 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Setup DB' })
    const t2 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Implement API' })
    const db = getDb()
    db.prepare(`
      INSERT INTO task_relations (task_id, target_task_id, relation_type)
      VALUES (?, ?, 'blocks')
    `).run(t1.task_id, t2.task_id)
    const relation = db.prepare('SELECT * FROM task_relations WHERE task_id = ?').get(t1.task_id) as Record<string, unknown>
    expect(relation.target_task_id).toBe(t2.task_id)
    expect(relation.relation_type).toBe('blocks')
  })

  it('display_id sequences are project-scoped and monotonic', async () => {
    seed()
    const db = getDb()
    db.prepare("INSERT INTO projects VALUES ('proj_2','ws_1','Frontend',datetime('now'))").run()

    const tasks = await Promise.all([
      createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P1 T1' }),
      createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P1 T2' }),
      createTask({ workspace_id: 'ws_1', project_id: 'proj_2', title: 'P2 T1' }),
      createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P1 T3' }),
    ])
    expect(tasks[0].display_id).toBe('TASK-1')
    expect(tasks[1].display_id).toBe('TASK-2')
    expect(tasks[2].display_id).toBe('TASK-1') // separate sequence for proj_2
    expect(tasks[3].display_id).toBe('TASK-3')
  })

  it('memory writeMemory stores scope, kind, title, summary; recallMemory returns them', async () => {
    seed()
    const m = await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      content: 'JWT tokens expire after 24 hours',
      scope: 'project', kind: 'decision',
      title: 'JWT expiry decision', summary: 'We chose 24h for JWT token expiry',
      tags: ['auth', 'jwt'],
    })
    expect(m.scope).toBe('project')
    expect(m.kind).toBe('decision')
    expect(m.title).toBe('JWT expiry decision')
    expect(m.summary).toBe('We chose 24h for JWT token expiry')

    const results = await recallMemory({ workspace_id: 'ws_1', project_id: 'proj_1', query: 'JWT' })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].title).toBe('JWT expiry decision')
  })

  it('listAgentProfiles returns 19 roles; workspace status reflects run counts', async () => {
    seed()
    const profiles = await listAgentProfiles()
    expect(profiles).toHaveLength(19)

    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Status test task' })
    await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'tester', agent_id: 'a1' })
    const status = await getWorkspaceStatus({ workspace_id: 'ws_1' })
    expect(status.running_runs.length).toBeGreaterThanOrEqual(1)
    expect(status.wip_count).toBeGreaterThanOrEqual(1)
  })
})
```

### Step 10.2 — Run to confirm all pass

```bash
cd packages/core && npx vitest run src/tests/integration.test.ts
```

Expected output:
```
✓ src/tests/integration.test.ts (8)
  ✓ full lifecycle integration (8)
Test Files  1 passed (1)
Tests  8 passed (8)
```

### Step 10.3 — Run complete suite

```bash
cd packages/core && npx vitest run
```

Expected: all tests passing (target: 130+ tests).

### Step 10.4 — Commit

```bash
git add packages/core/src/tests/integration.test.ts
git commit -m "$(cat <<'EOF'
test(core): integration test — full lifecycle with events, display IDs, task relations, enriched memory
EOF
)"
```

---

## Step 11 — Update index.ts exports

Add new exports to `packages/core/src/index.ts`:

```typescript
// Add these exports (append or merge with existing):
export { newId, nextDisplayId } from './ids.js'
export { statusCategory } from './status-category.js'
export { emitEvent } from './events.js'
export type { EmitEventInput } from './events.js'
```

Verify all existing exports still present, then:

```bash
cd packages/core && npx vitest run
```

```bash
git add packages/core/src/index.ts
git commit -m "$(cat <<'EOF'
feat(core): export ids, status-category, events from package index
EOF
)"
```

---

## Execution order

1. Task 1 (types) — no dependencies
2. Task 3 (status-category) — depends on types
3. Task 2 (ids) — depends on types + migration table (inline in test)
4. Task 4 (events) — depends on ids, types
5. Task 5 (migrations) — depends on types; makes Tasks 2/4 tests fully clean
6. Task 6 (tasks update) — depends on ids, events, status-category, migrations
7. Task 7 (runs update) — depends on ids, events, status-category, tasks
8. Task 8 (memory update) — depends on ids, migrations
9. Task 9 (profiles) — depends on types
10. Task 10 (integration) — depends on all the above
11. Task 11 (index exports) — final housekeeping

## Verification checklist

- [ ] `npx vitest run` passes with 130+ tests from `packages/core/`
- [ ] No TypeScript compilation errors: `npx tsc --noEmit`
- [ ] All 10 git commits present in `git log --oneline`
- [ ] `display_id_sequences`, `events`, `task_relations`, `task_labels` tables exist in migrated DB
- [ ] `MIGRATION_002` sentinel row present in `schema_migrations`
- [ ] `listAgentProfiles()` returns exactly 19 profiles
- [ ] `statusCategory('queued')` → `'backlog'`, `statusCategory('finished')` → `'done'`
- [ ] `newId('task')` matches `/^task_[0-9A-Z]{26}$/`
- [ ] `emitEvent()` inserts with `evt_` prefixed ULID
- [ ] `writeMemory()` without title defaults to first 80 chars of content
