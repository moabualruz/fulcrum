# @fulcrum/core

Core persistence and orchestration layer for Fulcrum agent systems. Provides SQLite-backed task management, agent run lifecycle, policy enforcement, workspace status, handoffs, events, and embedding providers.

## What it does

- **Tasks** — create, update, list tasks with WIP limit enforcement per workspace/agent role
- **Agent Runs** — full lifecycle (start → heartbeat → complete/block/escalate) with status tracking
- **Policy** — per-workspace rules: WIP limits, spawn permissions, allowed roles, output gates
- **Workspace Status** — aggregated view: task counts, WIP headroom, active agents, CoS context
- **Handoffs** — structured knowledge transfer packets between agents (claim/complete flow)
- **Events** — typed event bus for agent lifecycle and task state changes
- **Embeddings** — pluggable text/code embedding providers (Ollama, OpenAI, BGE reranker)
- **Janitor** — background cycle: expires stale runs, enforces WIP limits, cleans up orphaned state

## Setup

```typescript
import { loadConfig, runMigrations, getDb } from '@fulcrum/core'

const config = loadConfig()           // reads ~/.fulcrum/config.json or defaults
runMigrations()                       // idempotent SQLite schema setup
const db = getDb()                    // singleton better-sqlite3 instance
```

## Usage

```typescript
import {
  createTask, updateTask, listTasks,
  startAgentRun, heartbeatAgentRun, completeAgentRun, blockAgentRun,
  checkPolicy, getWorkspaceStatus,
  createHandoff, claimHandoff, completeHandoff,
  writeMemory, recallMemory,
} from '@fulcrum/core'

// Create a task
const task = createTask({
  workspace_id: 'ws_main',
  project_id: 'proj_1',
  title: 'Implement auth module',
  agent_type: 'implementer',
})

// Start an agent run
const run = await startAgentRun({
  task_id: task.task_id,
  workspace_id: 'ws_main',
  role: 'software_engineer',
  pi_profile: 'claude-cli/claude-opus-4-6',
})

// Heartbeat (keeps run alive)
heartbeatAgentRun(run.run_id)

// Complete
completeAgentRun(run.run_id, { summary: 'Auth module implemented' })

// Check policy before spawning
const policy = checkPolicy({ workspace_id: 'ws_main', action: 'spawn', agent_role: 'implementer' })
if (!policy.allowed) console.log(policy.reason)
```

## API

### Tasks
| Function | Description |
|---|---|
| `createTask(input)` | Create a task with WIP limit check |
| `updateTask(taskId, patch)` | Update task status, title, or metadata |
| `listTasks(workspaceId, filter?)` | List tasks filtered by status, agent type, or project |

### Agent Runs
| Function | Description |
|---|---|
| `startAgentRun(input)` | Start a run, claim WIP slot, validate workspace isolation |
| `heartbeatAgentRun(runId)` | Extend run TTL (call every N seconds) |
| `completeAgentRun(runId, result)` | Mark complete, release WIP slot |
| `blockAgentRun(runId, reason)` | Block run awaiting input |
| `escalateRun(runId, reason)` | Escalate to human/supervisor |
| `getAgentRunStatus(runId)` | Get current run state |
| `buildSpawnableRun(runId)` | Build a `SpawnableRun` packet for Pi executor |

### Policy
| Function | Description |
|---|---|
| `checkPolicy(input)` | Evaluate workspace policy for an action |

### Status
| Function | Description |
|---|---|
| `getWorkspaceStatus(workspaceId)` | Aggregated workspace view for CoS context |
| `buildCosContext(workspaceId)` | Build CoS context string for agent prompts |
| `buildWorldState(input)` | Full CoS world state with runs, tasks, and handoffs |
| `listAgentProfiles(workspaceId)` | List active agent profiles |

### Handoffs
| Function | Description |
|---|---|
| `createHandoff(input)` | Create a handoff packet |
| `getHandoff(handoffId)` | Get a single handoff by ID |
| `claimHandoff(handoffId, agentId)` | Claim a handoff for processing |
| `completeHandoff(handoffId, result)` | Mark handoff as resolved |
| `listHandoffs(workspaceId, filter?)` | List pending/claimed handoffs |

### Memory
| Function | Description |
|---|---|
| `writeMemory(input)` | Write a memory entry to SQLite |
| `recallMemory(input)` | Full-text search over memories |

### Embeddings
| Function | Description |
|---|---|
| `initEmbedding(config)` | Initialize embedding providers |
| `getTextEmbedder()` | Get configured text embedding function |
| `getCodeEmbedder()` | Get code-specific embedding function |
| `getReranker()` | Get BGE or similar reranker |
| `resetProviders()` | Reset all embedding provider state |

### Events
| Function | Description |
|---|---|
| `emitEvent(input)` | Emit a typed `FulcrumEvent` |

### Janitor
| Function | Description |
|---|---|
| `runJanitorCycle()` | Run one cleanup cycle synchronously |
| `startJanitor()` | Start background janitor on an interval |

### DB / Config
| Function | Description |
|---|---|
| `loadConfig()` | Load `FulcrumConfig` from `~/.fulcrum/config.json` |
| `defaultConfig` | Sensible defaults for local development |
| `getDb()` | Get the singleton `better-sqlite3` instance |
| `runMigrations()` | Apply all pending schema migrations |
| `newId(prefix)` | Generate a prefixed ULID |

### CoS Parsing
| Function | Description |
|---|---|
| `parseCoSResponse(text)` | Parse structured CoS response from LLM output |
| `applyCoSResponse(response)` | Apply parsed CoS response actions to the database |

## Database tables owned

This package owns tables: `schema_migrations`, `workspaces`, `projects`, `tasks`, `task_relations`, `task_labels`, `agent_runs`, `advisory_locks`, `display_id_sequences`, `events`, `epics`, `issues`, `issue_labels`, `prds`, `plans`, `plan_issues`, `prd_plans`, `policy_rules`, `agent_definitions`, `agent_profiles`.

> **Cross-package exception:** `core` also writes rows to the `memories` table (via `safeWriteMemory` in `runs.ts` and `cos-parser.ts`) for internal lifecycle events. This is intentional — `@fulcrum/memory` cannot be a dependency of `core` (would be circular). All other memory reads/writes go through `@fulcrum/memory`.
