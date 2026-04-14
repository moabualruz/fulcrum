# Fulcrum

**Local-first agent control plane for multi-agent TypeScript systems.**

Fulcrum is the persistence and coordination layer that keeps agents on track — tracking tasks, enforcing WIP limits, storing memory, and surfacing the right context to the chief-of-staff agent that orchestrates everything.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL%20+%20FTS5-003B57?logo=sqlite)](https://sqlite.org/)
[![Tests](https://img.shields.io/badge/tests-91%20passing-brightgreen)](#running-tests)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-F69220?logo=pnpm)](https://pnpm.io/)

---

## Why Fulcrum?

Multi-agent systems fail in predictable ways: agents go rogue, pile up stale work, duplicate effort, and lose context across sessions. Fulcrum solves this at the persistence layer, before any of that reaches your agent code.

- **Local-first** — SQLite on disk, zero network dependencies, zero cold starts
- **Hexagonal architecture** — pure domain functions, no transport concerns
- **WIP enforcement** — global and per-role concurrency limits prevent runaway parallelism
- **Three-layer memory** — L0 human-readable vault (git-backed markdown), L1 FTS5 keyword search, L2 Kuzu graph + HNSW vector search (opt-in)
- **Automatic janitor** — marks stale runs, auto-escalates blocked ones
- **Chief-of-staff context** — one call gives the orchestrator agent everything it needs

---

## Packages

| Package | Description |
|---------|-------------|
| [`@fulcrum/core`](packages/core) | Domain functions, SQLite schema, embedding providers |
| [`@fulcrum/memory`](packages/memory) | Three-layer memory stack — L0 git vault, L1 FTS5, L2 Kuzu graph + HNSW vector search |
| [`@fulcrum/monitor`](packages/monitor) | Real-time metrics dashboard — daily/project/agent metrics, burndown data, HTTP monitoring server |
| [`@fulcrum/planning`](packages/planning) | Project planning domain — epics, issues, PRDs, plans, task relations, code review workflows |
| [`@fulcrum/policy`](packages/policy) | Policy engine — system invariants, custom rules, secret guard (detect and redact), audit logging |
| [`@fulcrum/sync`](packages/sync) | Bidirectional sync adapter — Plane project management integration, conflict detection |
| [`@fulcrum/teams`](packages/teams) | Agent team orchestration — team templates, role slots, communication and budget policies |
| [`@fulcrum/workflows`](packages/workflows) | Workflow engine — define, register, and execute multi-step agent workflows |
| [`@fulcrum/worktrees`](packages/worktrees) | Code worktree lifecycle — worktree provisioning, artifact tracking, code review workflows |

---

## Quick Start

```bash
pnpm install
```

```bash
fulcrum memory init        # initialize vault + L1
fulcrum memory accelerate  # enable L2 (Kuzu + embeddings, optional)
```

```typescript
import {
  loadConfig, getDb, runMigrations,
  createTask, startAgentRun, checkPolicy,
  writeMemory, recallMemory,
  buildCosContext,
} from '@fulcrum/core'

// Bootstrap
const config = loadConfig()
const db = getDb()
runMigrations(db)

// Create a task
const task = await createTask({
  workspace_id: 'ws_1',
  project_id:   'proj_1',
  title:        'Implement feature X',
})

// Check policy before starting a run
const policy = await checkPolicy({
  workspace_id: 'ws_1',
  task_id:      task.task_id,
  role:         'implementer',
  policy:       config.policy,
})

if (policy.allowed) {
  const run = await startAgentRun({
    task_id:      task.task_id,
    workspace_id: 'ws_1',
    role:         'implementer',
  })
}

// Store and recall memory
await writeMemory({
  workspace_id: 'ws_1',
  project_id:   'proj_1',
  content:      'We use SQLite for local-first storage — no Postgres dependency.',
  tags:         ['architecture', 'database'],
})

const memories = await recallMemory({
  workspace_id: 'ws_1',
  project_id:   'proj_1',
  query:        'database choice',
})

// Get chief-of-staff context
const context = await buildCosContext({
  workspace_id: 'ws_1',
  project_id:   'proj_1',
})
```

---

## Core API

Fulcrum exposes 14 domain functions grouped into five areas:

### Tasks

```typescript
listTasks(input)     // List tasks, optionally filtered by status or project
createTask(input)    // Create a new queued task
updateTask(input)    // Update status, note, assignee — with optimistic locking
```

### Agent Runs

```typescript
startAgentRun(input)      // Start a run for a task (call checkPolicy first)
heartbeatAgentRun(input)  // Update progress (used by the janitor for stale detection)
getAgentRunStatus(input)  // Fetch a run by ID
completeAgentRun(input)   // Mark done with summary and artifacts
blockAgentRun(input)      // Mark blocked with a reason
escalateRun(input)        // Escalate to chief_of_staff — creates a CoS task
```

### Policy

```typescript
checkPolicy(input)
// Returns { allowed, reason?, current_wip?, limit?, blocking_tasks? }
// Never throws for policy denials — throws only for invalid config or unknown task
```

### Memory

```typescript
writeMemory(input)   // Persist a memory — auto-deduplicates by exact match or cosine similarity
recallMemory(input)  // Hybrid search: FTS5 → optional vector ANN → optional BGE reranker
```

### Status & Context

```typescript
getWorkspaceStatus(input)  // Running, blocked, stale run counts across a workspace
buildCosContext(input)     // Markdown context block for the chief-of-staff agent
listAgentProfiles()        // All 6 agent roles with their capabilities
```

---

## Agent Roles

| Role | Can Create Teams | Can Dispatch |
|------|-----------------|--------------|
| `chief_of_staff` | ✓ | ✓ |
| `implementer` | — | — |
| `tester` | — | — |
| `reviewer` | — | — |
| `researcher` | — | — |
| `planner` | — | — |

---

## Database

Fulcrum uses SQLite with WAL mode, foreign keys, and FTS5 full-text search. The schema is applied via `runMigrations(db)` and is fully idempotent.

**Tables:** `workspaces`, `projects`, `tasks`, `agent_runs`, `memories`, `advisory_locks`  
**Virtual tables:** `tasks_fts`, `memories_fts`, `vec_memories` (when `sqlite-vec` is available)

```typescript
import { getDb, runMigrations, _configureDb } from '@fulcrum/core'

// Production
const db = getDb()     // Opens .fulcrum/fulcrum.db, configures WAL + FK + busy_timeout
runMigrations(db)

// Tests — inject an in-memory DB
import Database from 'better-sqlite3'
import { setDb, _configureDb, runMigrations } from '@fulcrum/core'

const db = new Database(':memory:')
_configureDb(db)
runMigrations(db)
setDb(db)
```

---

## Embedding & Memory Recall

Memory recall uses a three-stage pipeline, each stage optional and degrading gracefully:

1. **FTS5 lexical search** — always available, workspace + project scoped
2. **Vector ANN search** — requires `sqlite-vec` and an embedding provider
3. **BGE reranker** — optional cross-encoder reranking of merged results

To enable semantic recall:

```typescript
import { initEmbedding, loadConfig } from '@fulcrum/core'

const config = loadConfig()   // reads .fulcrum.json
await initEmbedding(config)   // downloads models on first run to .fulcrum/models/
```

Default models (Hugging Face ONNX, runs locally, no API key):
- Embedder: `onnx-community/Qwen3-Embedding-0.6B-ONNX`
- Reranker: `onnx-community/bge-reranker-v2-m3-ONNX`

---

## Configuration

Place a `.fulcrum.json` in your project root (or use env vars):

```json
{
  "workspace_id": "my-workspace",
  "project_id":   "my-project",
  "port":         4721,
  "policy": {
    "wip_limit":                   5,
    "wip_limit_per_role":          { "implementer": 2 },
    "heartbeat_timeout_minutes":   10,
    "escalation_timeout_minutes":  30
  },
  "embedding": {
    "text": {
      "provider":   "local",
      "model":      "onnx-community/Qwen3-Embedding-0.6B-ONNX",
      "dimensions": 1024
    }
  }
}
```

| Env var | Overrides |
|---------|-----------|
| `FULCRUM_WORKSPACE_ID` | `workspace_id` |
| `FULCRUM_PROJECT_ID` | `project_id` |
| `FULCRUM_PORT` | `port` |

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

## Running Tests

```bash
cd packages/core
pnpm test          # run once
pnpm test:watch    # watch mode
```

91 tests, 0 failures. Tests use an in-memory SQLite DB injected via `setDb()`.

To run embedding integration tests (requires model download on first run):

```bash
FULCRUM_EMBEDDING_TESTS=1 pnpm test
```

---

## Project Structure

```
fulcrum/
├── packages/
│   └── core/               # @fulcrum/core — domain functions + SQLite
│       ├── src/
│       │   ├── db/         # Schema migrations, client
│       │   ├── embedding/  # Local embedder, reranker, registry
│       │   ├── tests/      # Vitest test suite (91 tests)
│       │   ├── config.ts   # loadConfig, defaultConfig
│       │   ├── tasks.ts    # listTasks, createTask, updateTask
│       │   ├── runs.ts     # startAgentRun … escalateRun
│       │   ├── policy.ts   # checkPolicy
│       │   ├── memory.ts   # writeMemory, recallMemory
│       │   ├── janitor.ts  # runJanitorCycle, startJanitor
│       │   ├── status.ts   # getWorkspaceStatus, buildCosContext
│       │   ├── types.ts    # All shared types and FulcrumError
│       │   └── index.ts    # Public API surface
│       └── package.json
├── package.json            # pnpm workspace root
└── pnpm-workspace.yaml
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All contributions welcome.

## Security

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities.

## License

[MIT](LICENSE) — Mo Abualruz
