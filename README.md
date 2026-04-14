# Fulcrum

**Local-first agent operating system for multi-agent TypeScript systems.**

Fulcrum is the persistence and coordination layer that keeps agents on track — managing tasks, enforcing WIP limits, routing work through teams and workflows, and maintaining a three-layer semantic memory that survives across sessions.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL%20+%20FTS5-003B57?logo=sqlite)](https://sqlite.org/)
[![Tests](https://img.shields.io/badge/tests-91%20passing-brightgreen)](#running-tests)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-F69220?logo=pnpm)](https://pnpm.io/)

---

## Why Fulcrum?

Multi-agent systems fail in predictable ways: agents go rogue, pile up stale work, duplicate effort, and lose context across sessions. Fulcrum solves this at the persistence layer, before any of that reaches your agent code.

- **Local-first** — SQLite on disk, zero network dependencies, zero cold starts
- **Hexagonal architecture** — pure domain functions, no transport concerns in the core
- **WIP enforcement** — global and per-role concurrency limits prevent runaway parallelism
- **Three-layer memory** — L0 git-backed markdown vault (Obsidian-compatible), L1 FTS5 keyword search, L2 Kuzu graph + HNSW vector search (opt-in)
- **Team orchestration** — typed agent team templates with slot policies, communication modes, and budget classes
- **Workflow engine** — declarative multi-step workflows with dependency tracking and retry semantics
- **Automatic janitor** — marks stale runs, auto-escalates blocked ones, overlapping-cycle safe
- **Chief-of-staff context** — one call gives the orchestrator agent everything it needs to plan the next action

---

## Packages

| Package | Description |
|---------|-------------|
| [`@fulcrum/core`](packages/core) | Domain functions, SQLite schema, embedding providers, handoff protocol, event stream |
| [`@fulcrum/memory`](packages/memory) | Three-layer memory stack — L0 git vault, L1 FTS5 + scoring, L2 Kuzu graph + HNSW vector search |
| [`@fulcrum/monitor`](packages/monitor) | Real-time metrics dashboard — daily/project/agent metrics, burndown, SSE event stream, HTTP server |
| [`@fulcrum/planning`](packages/planning) | Project planning domain — epics, issues, PRDs, plans, dependency graph, code review workflows |
| [`@fulcrum/policy`](packages/policy) | Policy engine — system invariants, custom rules, secret guard (9 patterns, auto-redact), audit log |
| [`@fulcrum/sync`](packages/sync) | Bidirectional sync — Plane integration, conflict detection, secret scan before push, priority queue |
| [`@fulcrum/teams`](packages/teams) | Agent team orchestration — typed templates, slot policies, communication and budget classes |
| [`@fulcrum/workflows`](packages/workflows) | Workflow engine — declarative step graphs, 20+ step types, retry/timeout, run state machine |
| [`@fulcrum/worktrees`](packages/worktrees) | Worktree lifecycle — allocation, artifact tracking, review workflow, integration merge queue |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Agent Code                                │
│   chief_of_staff  ·  software_engineer  ·  reviewer  ·  …       │
└────────────────────────────┬────────────────────────────────────┘
                             │ domain function calls
┌────────────────────────────▼────────────────────────────────────┐
│                       @fulcrum/core                              │
│   tasks · runs · policy · memory · handoffs · events · CoS       │
│                  SQLite (WAL + FTS5)                             │
└───┬──────────┬──────────┬──────────┬──────────┬─────────────────┘
    │          │          │          │          │
┌───▼──┐  ┌───▼───┐  ┌───▼──┐  ┌───▼───┐  ┌───▼──────┐
│memory│  │monitor│  │teams │  │policy │  │planning  │
│ L0   │  │metrics│  │slots │  │rules  │  │epics     │
│ L1   │  │server │  │sched.│  │secrets│  │issues    │
│ L2   │  └───────┘  └──────┘  │audit  │  │PRDs/plans│
│kuzu  │                        └───────┘  └──────────┘
└──────┘
┌──────────┐  ┌──────────────┐  ┌───────────────┐
│workflows │  │   worktrees  │  │     sync      │
│step graph│  │ alloc/merge  │  │ Plane adapter │
│20+ types │  │ artifact mgmt│  │ conflict res. │
└──────────┘  └──────────────┘  └───────────────┘
```

**Dependency rule:** all packages depend on `@fulcrum/core`; `@fulcrum/policy` additionally depends on `@fulcrum/teams` for role constants; no other cross-package dependencies.

---

## Quick Start

```bash
pnpm install
```

```bash
fulcrum memory init        # initialize vault (L0 + L1)
fulcrum memory accelerate  # enable L2 graph + vector search (optional)
```

```typescript
import {
  loadConfig, getDb, runMigrations,
  createTask, startAgentRun, completeAgentRun,
  checkPolicy,
  writeMemory, recallMemory,
  buildCosContext,
} from '@fulcrum/core'

// Bootstrap
const config = loadConfig()   // reads .fulcrum.json + env vars
const db = getDb()
runMigrations(db)

// Create and execute a task
const task = await createTask({
  workspace_id: 'ws_1',
  project_id:   'proj_1',
  title:        'Implement feature X',
})

const policy = await checkPolicy({
  workspace_id: 'ws_1',
  task_id:      task.task_id,
  role:         'software_engineer',
  policy:       config.policy,
})

if (policy.allowed) {
  const run = await startAgentRun({
    task_id:      task.task_id,
    workspace_id: 'ws_1',
    role:         'software_engineer',
  })

  // ... agent does work ...

  await completeAgentRun({
    run_id:   run.run_id,
    summary:  'Implemented feature X with unit tests',
  })
}

// Store and recall memory
await writeMemory({
  workspace_id: 'ws_1',
  project_id:   'proj_1',
  scope:        'project',
  kind:         'decision',
  title:        'SQLite for local-first storage',
  content:      'We use SQLite — no Postgres dependency, zero cold starts.',
  tags:         ['architecture', 'database'],
})

const memories = await recallMemory({
  workspace_id: 'ws_1',
  project_id:   'proj_1',
  query:        'database choice',
})

// Build chief-of-staff context
const context = await buildCosContext({
  workspace_id: 'ws_1',
  project_id:   'proj_1',
})
```

---

## Core API

### Tasks

```typescript
createTask(input)    // Create a queued task
listTasks(input)     // List tasks, optionally filtered by status, project, or assignee
updateTask(input)    // Update status, notes, assignee — with optimistic locking
```

### Agent Runs

```typescript
startAgentRun(input)      // Start a run (call checkPolicy first)
heartbeatAgentRun(input)  // Report progress (used by janitor for stale detection)
completeAgentRun(input)   // Mark done with summary and artifacts
blockAgentRun(input)      // Mark blocked with a reason
escalateRun(input)        // Escalate to chief_of_staff — auto-creates a CoS task
getAgentRunStatus(input)  // Fetch a run by ID
```

### Policy

```typescript
checkPolicy(input)
// Returns { allowed, reason?, current_wip?, limit?, blocking_tasks? }
// Never throws for policy denials — throws only for invalid config or unknown task
```

### Memory

```typescript
writeMemory(input)   // Write to L0 vault + L1 SQLite, async L2 graph update
recallMemory(input)  // Hybrid: FTS5 → optional HNSW vector → optional BGE reranker
getMemory(id)        // Fetch a single memory by ID
getMemoriesForTask(task_id)  // All memories linked to a task
```

### Status & Context

```typescript
getWorkspaceStatus(input)  // Running, blocked, stale run counts across a workspace
buildCosContext(input)     // Markdown context block for the chief-of-staff agent
buildWorldState(input)     // Full world state for CoS planning
parseCoSResponse(text)     // Parse structured CoS agent response
applyCoSResponse(input)    // Apply parsed CoS decisions to DB
listAgentProfiles()        // All agent roles with capabilities
```

### Handoffs

```typescript
createHandoff(input)    // Create an inter-agent handoff packet
getHandoff(id)          // Fetch handoff
claimHandoff(id, agent) // Claim a handoff (atomic)
completeHandoff(id)     // Mark handoff complete
```

### Events

```typescript
emitEvent(event)  // Emit a typed domain event (task_created, run_started, memory_written, …)
```

---

## Memory System (Three Layers)

### L0 — Git Vault (Source of Truth)

Every memory is a Markdown file with YAML frontmatter stored in `~/.fulcrum/vault/`:

```
~/.fulcrum/vault/
├── memories/
│   ├── curated/          # committed to git — decisions, facts, lessons, summaries
│   │   └── workspaces/<ws_id>/
│   │       ├── global/<yyyy>/<mm>/<id>.md
│   │       ├── project/<project_id>/<yyyy>/<mm>/<id>.md
│   │       └── file/<project_id>/<encoded_path>/<yyyy>/<mm>/<id>.md
│   └── operational/      # gitignored — traces, reasoning steps, diffs
│       └── workspaces/<ws_id>/runs/<task_id>/<id>.md
├── .obsidian/            # Obsidian plugin config (auto-generated)
├── index.md              # Auto-rebuilt catalog
├── log.md                # Append-only operation log (WRITE/EDIT/DELETE/MERGE/ERROR)
├── schema.yaml           # Vault schema definition
└── queries.md            # Pre-built Dataview queries for Obsidian
```

The vault watcher detects human edits in Obsidian or any editor, validates required frontmatter fields, updates `content_hash` and `updated_at`, and syncs changes back to L1/L2.

**Memory kinds:**

| Kind | Layer | Description |
|------|-------|-------------|
| `decision` | curated | Architectural or process decisions |
| `fact` | curated | Factual assertions about the codebase or domain |
| `lesson` | curated | Lessons learned from errors or experience |
| `summary` | curated | Summaries of sessions, PRs, or investigations |
| `task_outcome` | curated | Outcomes of completed tasks |
| `task_decision` | curated | Decisions made during a task |
| `error` | curated | Errors encountered and how they were resolved |
| `doc` | curated | Documentation fragments |
| `tool_trace` | operational | Tool call input/output traces |
| `reasoning_step` | operational | Intermediate reasoning steps |
| `symbol` | operational | Code symbols (functions, classes, types) |
| `diff` | operational | Code diffs |
| `code` | operational | Code chunks |
| `procedure` | operational | Step-by-step procedures |
| `task_goal` | operational | Task goal descriptions |
| `task_failure` | operational | Task failure reports |

**Memory scopes:** `global`, `project`, `file`

### L1 — FTS5 Full-Text Search (always on)

Hybrid scoring formula applied to all FTS5 results:

```
score = importance × freshness × log(1 + access_count)
```

- Content deduplication by SHA-256 hash
- Cross-workspace scope (with related-workspace affinity boost)
- Graceful FTS5 fallback to LIKE on SQLite parse errors

### L2 — Kuzu Graph + HNSW Vector Search (opt-in)

```bash
fulcrum memory accelerate  # enables L2 and rebuilds from vault
```

Six-stage retrieval pipeline:

| Stage | What happens |
|-------|-------------|
| 0 | Expand related workspace IDs via entity graph |
| 1 | Extract query entities (structured + semantic extraction) |
| 2 | HNSW seed: top-40 vector candidates with NOT EXISTS superseded filter |
| 3 | 1-hop graph expansion from seed entities |
| 4 | 2-hop entity-entity traversal (hot entities >1000 mentions penalised 10×) |
| 4.5 | Filter superseded memories via `UPDATES` edges |
| 5 | Fused scoring: `1.0×vscore + 0.8×graphScore + 0.3×importance + 0.2×recency + 0.25×workspace_affinity − 0.6×contradiction_penalty` |
| 6 | MMR diversification (λ=0.7) |

**Activation (via rebuild):**

```typescript
import { activateL2 } from '@fulcrum/memory/setup'

const result = await activateL2()
// result: { l1Count, l2Count, errors }
```

**Vault ↔ L1/L2 sync after branch merge:**

```typescript
import { reconcileMergedBranch } from '@fulcrum/memory/setup'

await reconcileMergedBranch(vaultPath, taskId)
// Diffs merge commit, upserts changed files to L1+L2, removes deleted, appends MERGE log entry
```

---

## Agent Roles

| Role | Description | Can Invoke Teams |
|------|-------------|-----------------|
| `chief_of_staff` | Orchestrator — plans work, dispatches teams | ✓ |
| `context_gatherer` | Collects context before planning | — |
| `prd_planner` | Writes PRDs from requirements | — |
| `implementation_planner` | Breaks epics into tasks | — |
| `issue_decomposer` | Decomposes issues into sub-tasks | — |
| `architecture_reviewer` | Reviews system design | — |
| `research_worker` | Web search and information gathering | — |
| `software_engineer` | General-purpose implementation | — |
| `refactor_worker` | Code refactoring and cleanup | — |
| `browser_worker` | Browser automation | — |
| `data_engineer` | Data pipeline work | — |
| `ml_engineer` | ML model and training work | — |
| `devops_engineer` | Infrastructure and CI/CD | — |
| `code_reviewer` | Reviews pull requests | — |
| `qa_engineer` | Testing and quality assurance | — |
| `security_reviewer` | Security audits | — |
| `integration_worker` | Merges worktrees (only role allowed to merge) | — |
| `documentation_writer` | Writes and updates docs | — |
| `memory_curator` | Curates and prunes memory vault | — |
| `tech_lead` | Technical leadership and unblocking | — |
| `product_manager` | Manages roadmap and priorities | — |
| `analyst` | Data analysis and reporting | — |
| `orchestrator` | Generic sub-orchestration | — |

---

## Teams

Define a typed team template, then invoke it:

```typescript
import { createTeamTemplate, invokeTeam } from '@fulcrum/teams'

// Define a reusable template
await createTeamTemplate({
  workspace_id: 'ws_1',
  name: 'implementation_squad',
  slots: [
    { role: 'chief_of_staff',   min: 1, max: 1 },
    { role: 'software_engineer', min: 1, max: 3 },
    { role: 'code_reviewer',    min: 1, max: 1 },
  ],
  communication_policy: 'hub_and_spoke',
  budget_class: 'medium',
  quality_class: 'standard',
})

// Invoke for a specific task
const team = await invokeTeam({
  workspace_id: 'ws_1',
  template_name: 'implementation_squad',
  task_id: task.task_id,
  purpose: 'implement_auth_feature',
})
```

Team scheduling caps: global (8 concurrent), per-project (4), per-template (2). Only `chief_of_staff` can invoke teams — enforced by the policy engine.

---

## Workflows

```typescript
import { registerWorkflow, startWorkflow, stepWorkflow } from '@fulcrum/workflows'

// Register a workflow definition
registerWorkflow({
  name: 'implement_feature',
  version: '1.0',
  steps: [
    { step_id: 's1', step_type: 'prompt_user',       name: 'Clarify requirements', config: {} },
    { step_id: 's2', step_type: 'create_task',        name: 'Break down work',     config: {}, depends_on: ['s1'] },
    { step_id: 's3', step_type: 'spawn_agent',        name: 'Implement',           config: { role: 'software_engineer' }, depends_on: ['s2'] },
    { step_id: 's4', step_type: 'wait_for_review',    name: 'Code review',         config: {}, depends_on: ['s3'] },
    { step_id: 's5', step_type: 'complete',           name: 'Done',                config: {}, depends_on: ['s4'] },
  ],
})

// Start an instance
const run = await startWorkflow({ workflow_name: 'implement_feature', workspace_id: 'ws_1' })

// Advance a step
await stepWorkflow({ run_id: run.run_id, step_id: 's1', output: { requirements: '...' } })
```

**Available step types:** `prompt_user`, `create_task`, `create_issue`, `spawn_agent`, `invoke_team`, `wait_for_task`, `wait_for_review`, `read_memory`, `write_memory`, `search_code`, `write_artifact`, `run_script`, `evaluate_policy`, `validate_schema`, `gate`, `review_artifact`, `search_web`, `parallel`, `branch`, `complete`

---

## Policy Engine

### System Invariants (cannot be overridden)

| Rule | Description |
|------|-------------|
| `only_l1_invokes_teams` | Only `chief_of_staff` can invoke teams |
| `only_integration_worker_merges` | Only `integration_worker` can merge worktrees |
| `no_task_bypass` | `start_run` requires an existing task |

### Custom Rules

```typescript
import { createPolicyRule, evaluatePolicy } from '@fulcrum/policy'

// Deny prod deployments outside hours
await createPolicyRule({
  workspace_id: 'ws_1',
  scope: 'workspace',
  matcher: { type: 'command', value: 'deploy:production' },
  action: 'deny',
  reason: 'Production deployments require manual approval outside business hours',
  priority: 100,
})

const decision = await evaluatePolicy({
  workspace_id: 'ws_1',
  actor: { role: 'devops_engineer', agent_id: 'agt_1' },
  resource: { type: 'command', value: 'deploy:production' },
})
// decision: { allowed: false, reason: '...', matched_rule: ... }
```

### Secret Guard

```typescript
import { checkSecrets, redactSecrets } from '@fulcrum/policy'

const result = checkSecrets(text)
// result: { found: true, matches: [{ pattern: 'api_key', value: 'sk-...' }] }

const safe = redactSecrets(text)
// Replaces secrets with [REDACTED_API_KEY], [REDACTED_AWS_ACCESS_KEY], etc.
```

Detects: API keys, AWS credentials, private keys, OAuth tokens, Slack tokens, JWTs, password key-value pairs, credential URLs.

---

## Sync (Plane Integration)

```typescript
import { syncObject, resolveConflict } from '@fulcrum/sync'

// Sync an issue to Plane
await syncObject({
  workspace_id: 'ws_1',
  object_type:  'issue',
  object_id:    issue.issue_id,
  local_data:   issue,
})

// Handle a conflict
await resolveConflict({
  conflict_id: conflict.conflict_id,
  resolution:  'local_wins',   // or 'remote_wins' / 'manual'
})
```

Required env vars: `PLANE_API_KEY`, `PLANE_BASE_URL`, `PLANE_WORKSPACE_SLUG`, `PLANE_PROJECT_ID`.

---

## Worktrees

```typescript
import { allocateWorktree, markReady, enqueueMerge } from '@fulcrum/worktrees'

// Allocate a worktree for a run
const wt = await allocateWorktree({
  workspace_id: 'ws_1',
  task_id:      task.task_id,
  run_id:       run.run_id,
  branch_name:  'feat/my-feature',
  path:         '/home/user/project/.worktrees/feat-my-feature',
})

// Mark ready after work is done
await markReady({ worktree_id: wt.worktree_id })

// Queue for merge (processed by integration_worker)
await enqueueMerge({ worktree_id: wt.worktree_id, priority: 10 })
```

---

## Database

Fulcrum uses SQLite with WAL mode, foreign keys, and FTS5. `runMigrations(db)` is fully idempotent.

**Tables:** `workspaces`, `projects`, `tasks`, `agent_runs`, `memories`, `advisory_locks`, `handoffs`, `events`, `epics`, `issues`, `prds`, `plans`, `task_relations`, `reviews`, `worktrees`, `artifacts`, `team_templates`, `team_instances`, `team_members`, `workflow_definitions`, `workflow_runs`, `workflow_step_states`, `sync_state`, `sync_conflicts`, `policy_rules`, `audit_log`, `daily_metrics`

**Virtual tables:** `tasks_fts`, `memories_fts`, `vec_memories` (when `sqlite-vec` is available)

```typescript
import { getDb, runMigrations, _configureDb, setDb } from '@fulcrum/core'

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

---

## Embedding & Recall

```typescript
import { initEmbedding, loadConfig } from '@fulcrum/core'

await initEmbedding(loadConfig())   // downloads models on first run to .fulcrum/models/
```

Default models (run locally via ONNX, no API key required):

| Role | Model |
|------|-------|
| Text embedder | `onnx-community/Qwen3-Embedding-0.6B-ONNX` |
| Code embedder | `onnx-community/Qwen3-Embedding-0.6B-ONNX` |
| Reranker | `onnx-community/bge-reranker-v2-m3-ONNX` |

---

## Configuration

`.fulcrum.json` in your project root:

```json
{
  "workspace_id": "my-workspace",
  "project_id":   "my-project",
  "port":         4721,
  "policy": {
    "wip_limit":                    5,
    "wip_limit_per_role":           { "software_engineer": 2 },
    "heartbeat_timeout_minutes":    10,
    "escalation_timeout_minutes":   30
  },
  "embedding": {
    "text": {
      "provider":   "local",
      "model":      "onnx-community/Qwen3-Embedding-0.6B-ONNX",
      "dimensions": 1024
    }
  },
  "vault": {
    "path":       "~/.fulcrum/vault",
    "l2_enabled": false
  }
}
```

| Env var | Overrides |
|---------|-----------|
| `FULCRUM_WORKSPACE_ID` | `workspace_id` |
| `FULCRUM_PROJECT_ID` | `project_id` |
| `FULCRUM_PORT` | `port` |
| `FULCRUM_VAULT_PATH` | `vault.path` |
| `PLANE_API_KEY` | Plane sync credentials |
| `PLANE_BASE_URL` | Plane API base URL |
| `PLANE_WORKSPACE_SLUG` | Plane workspace |
| `PLANE_PROJECT_ID` | Plane project |

---

## Janitor

The janitor runs as a background timer, marking stale runs and auto-escalating blocked ones:

```typescript
import { startJanitor, loadConfig } from '@fulcrum/core'

const stop = startJanitor('ws_1', loadConfig().policy)
// ...
stop()   // clears the interval
```

The janitor is overlapping-cycle safe — if a cycle takes longer than the interval, the next tick is skipped.

---

## Monitor Server

```typescript
import { startMonitorServer } from '@fulcrum/monitor'

const stop = await startMonitorServer({ workspace_id: 'ws_1', port: 7331 })
// stop() to shut down
```

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/status` | Health check |
| `GET` | `/metrics` | Daily + project metrics |
| `GET` | `/burndown` | Burndown data |
| `GET` | `/per_role` | Per-role aggregate metrics |
| `GET` | `/memory` | Memory write/recall metrics |
| `GET` | `/forecasting` | Trend forecasting |
| `GET` | `/events/stream` | Server-Sent Events stream |

---

## Running Tests

```bash
# All packages
pnpm test

# Single package
cd packages/core && pnpm test
cd packages/memory && pnpm test

# Watch mode
pnpm test:watch

# Embedding integration tests (downloads models on first run)
FULCRUM_EMBEDDING_TESTS=1 pnpm test
```

91 tests, 0 failures. Tests use an in-memory SQLite DB injected via `setDb()`.

---

## Project Structure

```
fulcrum/
├── packages/
│   ├── core/               # @fulcrum/core
│   │   └── src/
│   │       ├── db/         # Schema migrations, WAL config, client
│   │       ├── embedding/  # Local embedder, reranker, registry
│   │       ├── tests/      # Vitest test suite (91 tests)
│   │       ├── config.ts   # loadConfig, defaultConfig
│   │       ├── tasks.ts    # listTasks, createTask, updateTask
│   │       ├── runs.ts     # startAgentRun … escalateRun
│   │       ├── policy.ts   # checkPolicy
│   │       ├── memory.ts   # writeMemory, recallMemory
│   │       ├── janitor.ts  # runJanitorCycle, startJanitor
│   │       ├── status.ts   # getWorkspaceStatus, buildCosContext
│   │       ├── handoffs.ts # createHandoff … completeHandoff
│   │       ├── cos.ts      # buildWorldState, parseCoSResponse
│   │       ├── events.ts   # emitEvent
│   │       ├── types.ts    # All shared types and FulcrumError
│   │       └── index.ts    # Public API surface
│   │
│   ├── memory/             # @fulcrum/memory
│   │   └── src/
│   │       ├── vault/      # L0: client, watcher, git, formatter, state, index-builder
│   │       ├── kuzu/       # L2: client, schema, upsert, query (6-stage pipeline)
│   │       ├── extractors/ # Structured + semantic entity extraction, ingestion pipeline
│   │       ├── setup/      # rebuild, reconcile, activate, init
│   │       ├── tests/      # Vault, watcher, retrieval, merge-reconcile tests
│   │       ├── write.ts    # writeMemory, insertMemoryDirect
│   │       ├── recall.ts   # recallMemory
│   │       ├── dedup.ts    # contentHash, isDuplicate
│   │       ├── scoring.ts  # computeImportance, computeFreshness, rrfScore
│   │       └── types.ts    # MemoryKind, MemoryScope, WriteMemoryInput, …
│   │
│   ├── monitor/            # @fulcrum/monitor
│   │   └── src/
│   │       ├── metrics/    # rollup, per-role, memory, forecasting queries
│   │       ├── server.ts   # Hono HTTP server + SSE event stream
│   │       └── types.ts    # DailyMetrics, ProjectMetrics, AgentMetrics, …
│   │
│   ├── planning/           # @fulcrum/planning
│   │   └── src/
│   │       ├── epics.ts    # createEpic, updateEpic, listEpics
│   │       ├── issues.ts   # createIssue, updateIssue, listIssues
│   │       ├── prds.ts     # createPRD, updatePRD, listPRDs
│   │       ├── plans.ts    # createPlan, updatePlan, linkIssueToPlan
│   │       ├── relations.ts # addTaskRelation, getBlockers, …
│   │       └── reviews.ts  # createReview, updateReview, listReviews
│   │
│   ├── policy/             # @fulcrum/policy
│   │   └── src/
│   │       ├── engine.ts   # SYSTEM_INVARIANTS, evaluatePolicy
│   │       ├── rules.ts    # createPolicyRule, listPolicyRules
│   │       ├── secrets.ts  # checkSecrets, redactSecrets (9 patterns)
│   │       └── audit.ts    # logPolicyEvent, getAuditLog
│   │
│   ├── sync/               # @fulcrum/sync
│   │   └── src/
│   │       ├── manager.ts  # SyncManager, syncObject, syncAll
│   │       ├── conflicts.ts # listConflicts, resolveConflict
│   │       └── adapters/
│   │           └── plane/  # PlaneAPIClient, PlaneSyncAdapter
│   │
│   ├── teams/              # @fulcrum/teams
│   │   └── src/
│   │       ├── templates.ts # createTeamTemplate, listTemplates
│   │       ├── instances.ts # invokeTeam, heartbeatTeam, completeTeam, …
│   │       └── scheduler.ts # canStartTeam (cap enforcement)
│   │
│   ├── workflows/          # @fulcrum/workflows
│   │   └── src/
│   │       ├── registry.ts # registerWorkflow, listWorkflows, getWorkflow
│   │       ├── engine.ts   # nextReadySteps, initStepStates, computeStatusCategory
│   │       └── runs.ts     # startWorkflow, stepWorkflow, resumeWorkflow, cancelWorkflow
│   │
│   └── worktrees/          # @fulcrum/worktrees
│       └── src/
│           ├── worktrees.ts # allocateWorktree, markDirty, markReady, enqueueMerge
│           ├── artifacts.ts # createArtifact, updateArtifact, listArtifacts
│           └── reviews.ts   # createReview, updateReview, listReviews
│
├── docs/                   # Design specs and package docs
├── package.json            # pnpm workspace root
└── pnpm-workspace.yaml
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All contributions welcome.

> **Note for native module contributors:** `@fulcrum/memory` depends on `kuzu` (Rust native addon). pnpm 10 requires `onlyBuiltDependencies=kuzu` in `.npmrc` to allow the native build. Run `pnpm install` from the repo root — kuzu will compile on first install.

## Security

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities.

## License

[MIT](LICENSE) — Mo Abualruz
