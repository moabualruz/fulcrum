# Core API

`@moabualruz/fulcrum-core` is the foundation layer. Every other package depends on it.

---

## Tasks

```typescript
createTask(input)    // Create a queued task
listTasks(input)     // List tasks, optionally filtered by status, project, or assignee
updateTask(input)    // Update status, notes, assignee — with optimistic locking
```

---

## Workspaces & Projects

```typescript
createWorkspace(input) / getWorkspace(id) / listWorkspaces() / updateWorkspace(input)
createProject(input)  / getProject(id)  / listProjects(input) / updateProject(input)
```

---

## Agent Runs

```typescript
startAgentRun(input)      // Start a run (call checkPolicy first)
heartbeatAgentRun(input)  // Report progress (used by janitor for stale detection)
completeAgentRun(input)   // Mark done with summary and artifacts
blockAgentRun(input)      // Mark blocked with a reason
escalateRun(input)        // Escalate to chief_of_staff — auto-creates a CoS task
getAgentRunStatus(input)  // Fetch a run by ID
buildSpawnableRun(input)  // Build a SpawnableRun packet for the worker adapter
```

---

## Policy

```typescript
checkPolicy(input)
// Returns { allowed, reason?, current_wip?, limit?, blocking_tasks? }
// Never throws for policy denials — throws only for invalid config or unknown task
```

---

## Role Capabilities

Central role → capability lookup. Use these helpers instead of hardcoded string comparisons — the `role-string-guard` test enforces that no code outside `roles.ts` compares a role to a string literal.

```typescript
import {
  isL1, canInvokeTeams, canMerge, canWriteCode, canEditFiles,
  roleCapabilities, L1_ROLES,
} from '@moabualruz/fulcrum-core'

if (!canInvokeTeams(caller_role)) throw new FulcrumError('policy_denied')
if (!canMerge(actor_role))        throw new FulcrumError('policy_denied')

const caps = roleCapabilities('software_engineer')
// { is_l1: false, can_invoke_teams: false, can_merge: false,
//   can_edit_files: true, can_write_code: true }
```

| Role | is_l1 | can_invoke_teams | can_merge | can_edit_files | can_write_code |
|------|:-----:|:----------------:|:---------:|:--------------:|:--------------:|
| `chief_of_staff`        | yes | yes | no  | no  | no  |
| `integration_worker`    | no  | no  | yes | yes | yes |
| `software_engineer`     | no  | no  | no  | yes | yes |
| `code_reviewer`         | no  | no  | no  | no  | no  |
| `security_reviewer`     | no  | no  | no  | no  | no  |
| `architecture_reviewer` | no  | no  | no  | no  | no  |

---

## Memory

```typescript
writeMemory(input)   // Write to L0 vault + L1 SQLite, async L2 graph update
recallMemory(input)  // Hybrid: FTS5 → optional HNSW vector → optional BGE reranker
getMemory(id)
getMemoriesForTask(task_id)
```

See [`memory.md`](memory.md) for the full three-layer memory system.

---

## Status & Context

```typescript
getWorkspaceStatus(input)  // Running, blocked, stale run counts across a workspace
buildCosContext(input)     // Markdown context block for the chief-of-staff agent
buildWorldState(input)     // Full world state for CoS planning
parseCoSResponse(text)     // Parse structured CoS agent response
applyCoSResponse(input)    // Apply parsed CoS decisions to DB
listAgentProfiles()        // All agent roles with capabilities
```

---

## Handoffs

```typescript
createHandoff(input)
getHandoff(id)
listHandoffs(input)
claimHandoff(id, agent)
completeHandoff(id)
```

---

## Events

```typescript
emitEvent(event)  // Emit a typed domain event (task_created, run_started, memory_written, …)
```

`emitEvent` writes the event to the `events` SQLite table and then fires the in-process event bus synchronously. Subscriber errors are caught and swallowed — a bad subscriber never breaks the caller.

---

## Event Bus

An in-process publish/subscribe bus for cross-package coordination without polling or circular imports.

```typescript
import { getEventBus, resetEventBus } from '@moabualruz/fulcrum-core'

// Subscribe to a specific event type
getEventBus().on('task_created', (evt) => {
  console.log('task created', evt.object_id)
})

// Subscribe to all events
getEventBus().onAny((evt) => { ... })

// One-time subscription
getEventBus().once('agent_run_finished', (evt) => { ... })

// Unsubscribe
const handler = (evt) => { ... }
getEventBus().on('memory_written', handler)
getEventBus().off('memory_written', handler)

// Listener count (useful in tests)
getEventBus().listenerCount('task_created')  // → number
getEventBus().listenerCount()                // → total across all types

// In tests — replace with a fresh bus to avoid cross-test listener leakage
resetEventBus()
```

**Available event types** (from `EventType`):

| Category | Event types |
|----------|-------------|
| Projects | `project_registered` |
| Planning | `epic_created`, `epic_status_changed`, `issue_created`, `issue_status_changed`, `plan_status_changed`, `prd_status_changed` |
| Tasks | `task_created`, `task_status_changed` |
| Teams | `team_created`, `team_invoked` |
| Agent runs | `agent_run_created`, `agent_run_started`, `agent_run_progress`, `agent_run_blocked`, `agent_run_failed`, `agent_run_finished` |
| Handoffs | `handoff_created`, `handoff_consumed` |
| Artifacts | `artifact_written`, `artifact_validated` |
| Memory | `memory_written`, `memory_recalled` |
| Worktrees | `worktree_allocated`, `merge_queued`, `merge_started`, `merge_conflicted`, `merge_completed` |
| Reviews | `review_created`, `review_updated` |
| Validation | `validation_started`, `validation_finished` |
| Policy | `policy_denied` |
| Hooks | `hook_executed` |
| Workflows | `workflow_step_completed` |

**Design:** subscribers are called synchronously in registration order. Each subscriber runs in its own try/catch — an exception re-emits as an `error` event rather than propagating to the caller. Use `setEventBus(bus)` to inject a test double.

---

## Hook Types

The six hook interface types are exported from `@moabualruz/fulcrum-core` so non-CLI packages can reference the hook contract without depending on `@moabualruz/fulcrum-cli`:

```typescript
import type {
  HookCli,             // 'claude' | 'gemini' | 'pi'
  NormalizedHookEvent, // { toolName, toolInput, sessionId, agentRole, runId }
  HookPhase,           // 'pre' | 'post'
  HookContext,         // { cliName, phase, toolName, toolInput, sessionId, agentRole, runId, workspace_id }
  HookOutput,          // { continue, suppressOutput?, stopReason?, message? }
  HookIO,              // { stdout, stderr, exit } — injected I/O surface for testing
} from '@moabualruz/fulcrum-core'
```

The implementations (`normalizeHookEvent`, `runPreHook`, `runPostHook`) live in `@moabualruz/fulcrum-cli` because they depend on `@moabualruz/fulcrum-policy` and `@moabualruz/fulcrum-memory`. The types are in core so policy or monitoring code can check hook shapes without pulling in the CLI package.

---

## Telemetry

```typescript
import {
  startSpan, endSpan, getTrace,
  initOtel, shutdownOtel, getOtelTracer,
} from '@moabualruz/fulcrum-core'

const span = await startSpan({
  name: 'workflow.run',
  workspace_id: 'ws_1',
  payload: { wf_id: 'wfr_1', role: 'software_engineer', model: 'claude-opus-4-6' },
})
// ... do work ...
await endSpan({ span_id: span.span_id, status: 'ok', payload: { steps_executed: 7 } })

const trace = await getTrace({ trace_id: span.trace_id })  // all spans for the trace
```

See [`telemetry.md`](telemetry.md) for OTLP export and auto-instrumentation details.

---

## Locks

```typescript
acquireLock(input)
releaseLock(lock_id)
listLocks(input)
cleanupExpiredLocks(workspace_id)
```

---

## Database

```typescript
import { getDb, runMigrations, _configureDb, setDb } from '@moabualruz/fulcrum-core'

// Production
const db = getDb()    // Opens .fulcrum/fulcrum.db — WAL + FK + busy_timeout
runMigrations(db)

// Tests — inject an in-memory DB
import Database from 'better-sqlite3'
const db = new Database(':memory:')
_configureDb(db)
runMigrations(db)
setDb(db)
```

`runMigrations(db)` is fully idempotent and ships **52 migrations** covering all domain tables, indices, and `content_type` / `sparse_vector` columns on `memories`.

**Pragmas set on every connection:** `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`, `synchronous=NORMAL`, `cache_size=-8000` (8 MB).

**Transaction helper:**

```typescript
import { withTransaction } from '@moabualruz/fulcrum-core'

const result = withTransaction(() => {
  getDb().prepare('INSERT INTO tasks ...').run(...)
  return taskId
})
// Uses BEGIN IMMEDIATE — safe under concurrent WAL readers.
// Rolls back automatically on any thrown error.
```

**Liveness check:**

```typescript
import { checkDbHealth } from '@moabualruz/fulcrum-core'

const health = checkDbHealth()
// { ok: true, latencyMs: 1 }  or  { ok: false, error: '...' }
```

**All tables:** `workspaces`, `projects`, `tasks`, `agent_runs`, `memories`, `advisory_locks`, `handoffs`, `events`, `epics`, `issues`, `prds`, `plans`, `task_relations`, `task_labels`, `issue_labels`, `plan_issues`, `prd_plans`, `reviews`, `worktrees`, `artifacts`, `artifact_contracts`, `team_templates`, `team_instances`, `team_members`, `workflow_runs`, `sync_states`, `sync_conflicts`, `sync_queue`, `policy_rules`, `policy_events`, `display_id_sequences`, `agentrun_artifacts`, `review_targets`, `task_memory_links`, `artifact_memory_links`, `analytics_daily`, `analytics_cycle`, `analytics_project`, `analytics_agent`, `analytics_team`, `memory_entities`, `code_chunks`, `graph_entities`, `graph_edges`, `graph_episodes`, `trace_events`, `agent_definitions`, `schema_migrations`

**Virtual tables:** `tasks_fts`, `memories_fts`, `vec_memories` (when `sqlite-vec` is available)

---

## Janitor

The janitor runs as a background timer, marking stale runs and auto-escalating blocked ones:

```typescript
import { startJanitor, loadConfig } from '@moabualruz/fulcrum-core'

const stop = startJanitor('ws_1', loadConfig().policy)
// ...
stop()   // clears the interval
```

The janitor is overlapping-cycle safe — if a cycle takes longer than the interval, the next tick is skipped. Every cycle emits a `janitor.cycle` span.

The janitor also runs **memory decay** each cycle: memories with `importance < 0.5` that haven't been accessed in 7+ days are decayed by a multiplicative `0.9^weeksElapsed` factor (floor `0.01`). Pass `runDecay: false` to opt out for a specific invocation.

---

## Embedding & Recall

```typescript
import { initEmbedding, loadConfig } from '@moabualruz/fulcrum-core'

await initEmbedding(loadConfig())   // downloads models on first run to .fulcrum/models/
```

Default models (run locally via ONNX, no API key required):

| Role | Model |
|------|-------|
| Text embedder | `onnx-community/Qwen3-Embedding-0.6B-ONNX` |
| Code embedder | `onnx-community/Qwen3-Embedding-0.6B-ONNX` |
| Reranker | `onnx-community/bge-reranker-v2-m3-ONNX` |

`writeMemory` auto-selects the embedder based on `content_type`:

```typescript
await writeMemory({
  content: 'function add(a, b) { return a + b }',
  content_type: 'code',   // routes to code embedder; default is 'text'
  workspace_id: 'ws_1',
  project_id: 'proj_1',
})
```

**Repo map** — `@moabualruz/fulcrum-memory` ships an aider-style repo map builder for passing relevant symbol context to agents:

```typescript
import { scanAndBuildRepoMap } from '@moabualruz/fulcrum-memory'

const map = await scanAndBuildRepoMap('/path/to/project')
// map.summary — compact "path.ts  [funcName:1, ClassName:10]" per-file lines
// map.files   — RepoFileEntry[] with symbols[], language, path
```
