# Fulcrum

**Local-first agent operating system for multi-agent TypeScript systems.**

Fulcrum is the persistence, coordination, and execution layer that keeps agents on track. It manages tasks, enforces WIP limits, routes work through teams and workflows, drives real git worktrees through a merge queue, runs subordinate agents via pluggable adapters, and maintains a three-layer semantic memory that survives across sessions.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL%20+%20FTS5-003B57?logo=sqlite)](https://sqlite.org/)
[![Tests](https://img.shields.io/badge/tests-1258%20passing-brightgreen)](#running-tests)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-F69220?logo=pnpm)](https://pnpm.io/)

---

## Why Fulcrum?

Multi-agent systems fail in predictable ways: agents go rogue, pile up stale work, duplicate effort, merge broken branches, and lose context across sessions. Fulcrum solves this at the persistence and execution layer, before any of that reaches your agent code.

- **Local-first** — SQLite on disk, zero network dependencies, zero cold starts
- **Pluggable agent executor** — `@fulcrum/worker` ships a built-in stub adapter and a generic subprocess adapter, and you can `registerAgentAdapter({ name, spawn })` to plug any CLI or SDK in behind the same lifecycle
- **Workflow runner** — declarative step graphs driven end-to-end by `runWorkflow()` with retries, exponential backoff, per-step timeouts, and state persistence across 29 step handlers
- **Real git merge queue** — `allocateWorktree` runs `git worktree add` for real, `processMergeQueue` runs `git merge --no-ff`, detects conflicts, aborts cleanly, and records conflict artifacts
- **Distributed tracing built-in** — `startSpan`/`endSpan` persist to `trace_events`, workflow runner / worker lifecycle / janitor / MCP handler are auto-instrumented, and opt-in OTLP export dual-emits to any OTel backend (Datadog, Honeycomb, Jaeger, Grafana Tempo)
- **Three-layer memory** — L0 git-backed markdown vault (Obsidian-compatible), L1 FTS5 keyword search, L2 Kuzu graph + HNSW vector search (opt-in)
- **24 canonical roles with capability helpers** — `isL1`, `canInvokeTeams`, `canMerge`, `canWriteCode`, `canEditFiles` are the single source of truth for role boundaries; no more hardcoded string comparisons scattered across the codebase
- **4 L1 invariants, enforced on every call** — `only_l1_invokes_teams`, `only_integration_worker_merges`, `no_task_bypass`, `chief_of_staff_no_direct_writes`
- **3 guard tests** — CHECK-drift guard, bare-ulid guard, and role-string guard prevent entire classes of bugs from ever shipping again
- **Automatic janitor** — marks stale runs, auto-escalates blocked ones, overlapping-cycle safe
- **Chief-of-staff context** — one call gives the orchestrator agent everything it needs to plan the next action

---

## Quick Start

### 1. Install

```bash
pnpm install && pnpm run setup
```

`setup` is a one-shot global install. It symlinks `fulcrum` to `~/.local/bin`, registers the user-scope Claude MCP server, merges the `PreToolUse` hook into `~/.claude/settings.json`, installs the Gemini extension into `~/.gemini/extensions/fulcrum/`, and runs `pi install` for the PI cockpit.

Want just one runtime?

```bash
pnpm run setup:claude     # Claude Code only
pnpm run setup:gemini     # Gemini CLI only
pnpm run setup:pi         # PI cockpit only
```

### 2. Run anywhere — auto-init

Every `fulcrum` command auto-initializes `$CWD` as a Fulcrum project on first run. On first invocation it creates:

- `.fulcrum/fulcrum.db` — the SQLite database (WAL + FTS5)
- `.fulcrum.json` — a config file with deterministic `workspace_id` / `project_id` derived from the absolute path
- A default workspace and project row so everything downstream works

No explicit init step. Just `cd` to a repo and run anything:

```bash
fulcrum task create --title "Implement OAuth callback"
fulcrum task list --status running
fulcrum board show
fulcrum workflow start --workflow-name implement_feature
fulcrum workflow run --wf-id wfr_01j...
fulcrum queue merge list
fulcrum queue merge process --workspace-id ws_1 --actor-role integration_worker
fulcrum agent spawn --target-role software_engineer --caller-role chief_of_staff \
  --task-id task_01j... --workspace-id ws_1 --project-id proj_1 --adapter subprocess
```

### 3. Use from TypeScript

```typescript
import {
  loadConfig, getDb, runMigrations,
  createTask, startAgentRun, completeAgentRun,
  checkPolicy,
  writeMemory, recallMemory,
  buildCosContext,
  startSpan, endSpan,
} from '@fulcrum/core'

const config = loadConfig()          // reads .fulcrum.json + env vars
const db = getDb()
runMigrations(db)

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
  const span = await startSpan({
    name: 'agent.run',
    workspace_id: 'ws_1',
    payload: { role: 'software_engineer' },
  })

  const run = await startAgentRun({
    task_id:      task.task_id,
    workspace_id: 'ws_1',
    role:         'software_engineer',
  })

  // ... agent does work ...

  await completeAgentRun({
    run_id:  run.run_id,
    summary: 'Implemented feature X with unit tests',
  })

  await endSpan({ span_id: span.span_id, status: 'ok' })
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Agent CLIs / Runtimes                         │
│    Claude Code  ·  Gemini CLI  ·  PI  ·  custom subprocess       │
│          (PreToolUse hooks call `fulcrum hook <runtime>`)        │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      @fulcrum/worker                             │
│   spawnAgent → policy gate → adapter.spawn → run lifecycle       │
│   Built-in: stub · subprocess    Pluggable: registerAgentAdapter │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                       @fulcrum/core                              │
│   tasks · runs · policy · memory · handoffs · events · CoS       │
│   roles · capabilities · telemetry spans · advisory locks        │
│                  SQLite (WAL + FTS5)                             │
└───┬──────────┬──────────┬──────────┬──────────┬─────────────────┘
    │          │          │          │          │
┌───▼──┐  ┌───▼───┐  ┌───▼──┐  ┌───▼───┐  ┌───▼──────┐
│memory│  │monitor│  │teams │  │policy │  │planning  │
│ L0   │  │HTTP + │  │slots │  │SYSTEM_│  │epics     │
│ L1   │  │SSE    │  │sched.│  │INVARI │  │issues    │
│ L2   │  │control│  │      │  │ANTS   │  │PRDs/plans│
│kuzu  │  │API    │  │      │  │audit  │  │          │
└──────┘  └───────┘  └──────┘  └───────┘  └──────────┘
┌──────────┐  ┌──────────────┐  ┌───────────────┐  ┌────────┐
│workflows │  │   worktrees  │  │     sync      │  │  cli   │
│runner +  │  │ real git     │  │ Plane adapter │  │ 14     │
│29 step   │  │ worktree +   │  │ conflict res. │  │ command│
│handlers  │  │ merge queue  │  │ secret scan   │  │ groups │
└──────────┘  └──────────────┘  └───────────────┘  └────────┘
```

**Dependency rule:** all packages depend on `@fulcrum/core`; `@fulcrum/policy` additionally depends on `@fulcrum/teams` for role constants; `@fulcrum/worker` depends on `@fulcrum/core`; step handlers in `@fulcrum/workflows` use lazy imports to avoid cross-package cycles.

---

## Packages

| Package | Description |
|---------|-------------|
| [`@fulcrum/core`](packages/core) | Domain functions, SQLite schema (29 migrations), role capability helpers, telemetry spans + OTel exporter, embedding providers, handoff protocol, event stream |
| [`@fulcrum/memory`](packages/memory) | Three-layer memory stack — L0 git vault, L1 FTS5 + scoring, L2 Kuzu graph + HNSW vector search |
| [`@fulcrum/monitor`](packages/monitor) | Real-time metrics dashboard — daily/project/agent metrics, burndown, SSE event stream, HTTP control API |
| [`@fulcrum/planning`](packages/planning) | Project planning domain — epics, issues, PRDs, plans, dependency graph, code review workflows |
| [`@fulcrum/policy`](packages/policy) | Policy engine — 4 system invariants, custom rules, secret guard (9 patterns, auto-redact), audit log |
| [`@fulcrum/sync`](packages/sync) | Bidirectional sync — Plane integration, conflict detection, secret scan before push, priority queue |
| [`@fulcrum/teams`](packages/teams) | Agent team orchestration — typed templates, slot policies, communication and budget classes |
| [`@fulcrum/worker`](packages/worker) | Pluggable agent executor — `AgentAdapter` contract, stub + subprocess adapters, `spawnAgent` lifecycle with policy gate and span instrumentation |
| [`@fulcrum/workflows`](packages/workflows) | Workflow engine — declarative step graphs, runner with retries/timeouts/backoff, 29 step handlers, run state machine |
| [`@fulcrum/worktrees`](packages/worktrees) | Worktree lifecycle — real `git worktree add` allocation, artifact tracking, review gating, integration merge queue with `git merge --no-ff` and conflict handling |
| [`@fulcrum/cli`](packages/cli) | `fulcrum` binary — 14 command groups, auto-init per project, hook handlers for Claude/Gemini/PI |

---

## Installation

### Global (one-shot)

```bash
pnpm install && pnpm run setup
```

### Per-runtime

```bash
pnpm run setup:claude     # Claude Code only
pnpm run setup:gemini     # Gemini CLI only
pnpm run setup:pi         # PI cockpit only
```

### Dry-run and verification

```bash
pnpm run setup:dry        # Plan the install — show every action without touching disk
pnpm run setup:check      # Verify an existing install (symlink, MCP entry, hook, extension)
```

### What gets installed where

| Target | Path | What it does |
|--------|------|--------------|
| CLI binary | `~/.local/bin/fulcrum` | Symlink to the wrapper that execs `node --import tsx/esm packages/cli/src/index.ts` |
| Claude MCP | `claude mcp add --scope user` | Registers Fulcrum as a user-scope MCP server so every Claude project sees the 13 control-plane tools |
| Claude hook | `~/.claude/settings.json` | Merges a `PreToolUse` hook that runs `fulcrum hook claude` before any tool_use, enforcing `chief_of_staff_no_direct_writes` and logging a `hook_executed` event |
| Gemini extension | `~/.gemini/extensions/fulcrum/` | Installs the extension manifest so Gemini CLI picks up Fulcrum automatically |
| PI cockpit | `pi install` | Installs Fulcrum's PI extension (`packages/extension/index.ts`) as a PI cockpit |

### Per-project auto-init

No explicit init step. Every `fulcrum` command auto-initializes `$CWD` as a Fulcrum project on first run:

- Creates `.fulcrum/fulcrum.db` (SQLite with WAL + FTS5, 29 migrations applied)
- Writes `.fulcrum.json` with deterministic `workspace_id` / `project_id` derived from the absolute path (running in the same directory twice always produces the same IDs)
- Inserts a default workspace and project row

The deterministic-ID trick means two agents running in the same checkout always see the same Fulcrum state, even if one ran through Claude and the other through Gemini.

---

## CLI Reference

### Command tree

```
fulcrum
├── memory
│   ├── init            Initialize L0 vault + L1 SQLite, optionally enable L2
│   ├── accelerate      Enable or rebuild L2 (Kuzu graph + HNSW vector search)
│   ├── rebuild         Rebuild L1 from L0 vault files
│   └── status          Show vault path and layer status
│
├── serve
│   ├── mcp             Start MCP server (stdio, JSON-RPC 2.0) — 13 control-plane tools
│   ├── mcp-http        Start MCP server (HTTP, StreamableHTTP transport, default port 4722)
│   ├── monitor         Start monitor + control API server (HTTP, default port 4721)
│   └── all             Start both MCP and monitor servers
│
├── doctor [--json]     Environment + configuration health check (8 checks, exits 1 on FAIL)
│
├── hook
│   ├── claude          Run Claude PreToolUse hook (reads JSON from stdin, exits 0 or 2)
│   ├── gemini          Run Gemini BeforeTool hook (normalises event, same logic)
│   └── pi              Run PI BeforeTool hook (normalises PI event, same logic)
│
├── workspaces
│   ├── list
│   └── create --name <name> [--id <id>]
│
├── projects
│   ├── list --workspace-id <id>
│   └── create --name <name> --workspace-id <id> [--id <id>]
│
├── task
│   ├── list [--workspace-id W] [--project-id P] [--status S] [--limit N]
│   ├── get --id T
│   ├── create --title T [--project-id P] [--description D] [--priority P] [--assigned-to R]
│   └── update --id T [--status S] [--note N] [--assigned-to R]
│
├── issue
│   ├── list [--workspace-id W] [--project-id P] [--status S]
│   ├── create --title T [--workspace-id W] [--project-id P] [--description D]
│   ├── get --id I
│   └── update --id I [--status S] [--title T]
│
├── epic
│   ├── list [--workspace-id W] [--project-id P]
│   ├── create --title T [--workspace-id W] [--project-id P]
│   └── get --id E
│
├── board show [--workspace-id W] [--project-id P]
│
├── queue
│   ├── merge list [--workspace-id W]
│   ├── merge process --workspace-id W --actor-role R [--project-id P]
│   └── review list [--workspace-id W] [--project-id P]
│
├── sync
│   ├── status [--workspace-id W]
│   ├── push --workspace-id W [--object-type T]
│   └── pull --workspace-id W [--object-type T]
│
├── team
│   ├── list [--workspace-id W]
│   ├── create --name N [--workspace-id W]
│   ├── invoke --template-id T --workspace-id W --caller-role R --purpose P [--project-id P]
│   └── instances --workspace-id W [--project-id P]
│
├── workflow
│   ├── list
│   ├── start --workflow-name N --workspace-id W [--project-id P]
│   ├── run --wf-id ID                 ← drives a workflow run end-to-end
│   ├── status --wf-id ID
│   └── resume --wf-id ID
│
├── agent
│   ├── list [--workspace-id W]
│   ├── status --run-id R
│   └── spawn --target-role R --caller-role C --task-id T --workspace-id W --project-id P [--adapter A]
│
└── --version  /  -v  /  version
```

All commands accept `--json` for machine-readable output.

### Examples

```bash
# Create and track a task
fulcrum task create --title "Add OAuth callback handler" --priority high
fulcrum task list --status running --json | jq '.[] | .display_id'

# Drive a workflow end-to-end
fulcrum workflow start --workflow-name implement_feature --workspace-id ws_1
fulcrum workflow run --wf-id wfr_01j...
fulcrum workflow status --wf-id wfr_01j...

# Merge queue
fulcrum queue merge list --workspace-id ws_1
fulcrum queue merge process --workspace-id ws_1 --actor-role integration_worker

# Spawn a subordinate agent via the subprocess adapter
FULCRUM_AGENT_SUBPROCESS_CMD="claude --dangerously-skip-permissions" \
  fulcrum agent spawn \
    --caller-role chief_of_staff \
    --target-role software_engineer \
    --task-id task_01j... \
    --workspace-id ws_1 --project-id proj_1 \
    --adapter subprocess

# Start the MCP server + monitor HTTP server together
fulcrum serve all --port 4721

# Environment health check
fulcrum doctor            # human-readable PASS/WARN/FAIL report
fulcrum doctor --json     # machine-readable JSON output
```

---

## Core API

### Tasks

```typescript
createTask(input)    // Create a queued task
listTasks(input)     // List tasks, optionally filtered by status, project, or assignee
updateTask(input)    // Update status, notes, assignee — with optimistic locking
```

### Workspaces & Projects

```typescript
createWorkspace(input) / getWorkspace(id) / listWorkspaces() / updateWorkspace(input)
createProject(input)  / getProject(id)  / listProjects(input) / updateProject(input)
```

### Agent Runs

```typescript
startAgentRun(input)      // Start a run (call checkPolicy first)
heartbeatAgentRun(input)  // Report progress (used by janitor for stale detection)
completeAgentRun(input)   // Mark done with summary and artifacts
blockAgentRun(input)      // Mark blocked with a reason
escalateRun(input)        // Escalate to chief_of_staff — auto-creates a CoS task
getAgentRunStatus(input)  // Fetch a run by ID
buildSpawnableRun(input)  // Build a SpawnableRun packet for the worker adapter
```

### Policy

```typescript
checkPolicy(input)
// Returns { allowed, reason?, current_wip?, limit?, blocking_tasks? }
// Never throws for policy denials — throws only for invalid config or unknown task
```

### Role Capabilities

Central role → capability lookup. Use these helpers instead of hardcoded string comparisons — the `role-string-guard` test enforces that no code outside `roles.ts` compares a role to a string literal.

```typescript
import {
  isL1, canInvokeTeams, canMerge, canWriteCode, canEditFiles,
  roleCapabilities, L1_ROLES,
} from '@fulcrum/core'

if (!canInvokeTeams(caller_role)) throw new FulcrumError('policy_denied')
if (!canMerge(actor_role))        throw new FulcrumError('policy_denied')

const caps = roleCapabilities('software_engineer')
// { is_l1: false, can_invoke_teams: false, can_merge: false,
//   can_edit_files: true, can_write_code: true }
```

| Role | is_l1 | can_invoke_teams | can_merge | can_edit_files | can_write_code |
|------|:-----:|:----------------:|:---------:|:--------------:|:--------------:|
| `chief_of_staff`      | yes | yes | no  | no  | no  |
| `integration_worker`  | no  | no  | yes | yes | yes |
| `software_engineer`   | no  | no  | no  | yes | yes |
| `code_reviewer`       | no  | no  | no  | no  | no  |
| `security_reviewer`   | no  | no  | no  | no  | no  |
| `architecture_reviewer` | no | no | no  | no  | no  |

### Memory

```typescript
writeMemory(input)   // Write to L0 vault + L1 SQLite, async L2 graph update
recallMemory(input)  // Hybrid: FTS5 → optional HNSW vector → optional BGE reranker
getMemory(id)
getMemoriesForTask(task_id)
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
createHandoff(input)
getHandoff(id)
listHandoffs(input)
claimHandoff(id, agent)
completeHandoff(id)
```

### Events

```typescript
emitEvent(event)  // Emit a typed domain event (task_created, run_started, memory_written, …)
```

### Telemetry

```typescript
import {
  startSpan, endSpan, getTrace,
  initOtel, shutdownOtel, getOtelTracer,
} from '@fulcrum/core'

const span = await startSpan({
  name: 'workflow.run',
  workspace_id: 'ws_1',
  payload: { wf_id: 'wfr_1', role: 'software_engineer', model: 'claude-opus-4-6' },
})
// ... do work ...
await endSpan({ span_id: span.span_id, status: 'ok', payload: { steps_executed: 7 } })

const trace = await getTrace({ trace_id: span.trace_id })  // all spans for the trace
```

See [Telemetry](#telemetry) below for OTLP export and auto-instrumentation details.

### Locks

```typescript
acquireLock(input)
releaseLock(lock_id)
listLocks(input)
cleanupExpiredLocks(workspace_id)
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

**Memory kinds (16 total):**

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

**Memory scopes:** `global`, `project`, `file`, `task`

### L1 — FTS5 Full-Text Search (always on)

Hybrid scoring formula applied to all FTS5 results:

```
score = importance × freshness × log(1 + access_count)
```

- Content deduplication by SHA-256 hash
- Cross-workspace scope (with related-workspace affinity boost)
- Graceful FTS5 fallback to LIKE on SQLite parse errors (e.g., unterminated strings)

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
// { l1Count, l2Count, errors }
```

**Vault ↔ L1/L2 sync after branch merge:**

```typescript
import { reconcileMergedBranch } from '@fulcrum/memory/setup'

await reconcileMergedBranch(vaultPath, taskId)
// Diffs merge commit, upserts changed files to L1+L2, removes deleted, appends MERGE log entry
```

---

## Agent Roles

Fulcrum ships 24 canonical roles. See [Role Capabilities](#role-capabilities) above for the programmatic lookup.

| Role | Description | Can Invoke Teams | Can Merge |
|------|-------------|:----------------:|:---------:|
| `chief_of_staff` | L1 orchestrator — plans work, dispatches teams | yes | — |
| `context_gatherer` | Collects context before planning | — | — |
| `prd_planner` | Writes PRDs from requirements | — | — |
| `implementation_planner` | Breaks epics into tasks | — | — |
| `issue_decomposer` | Decomposes issues into sub-tasks | — | — |
| `architecture_reviewer` | Reviews system design (read-only) | — | — |
| `research_worker` | Web search and information gathering | — | — |
| `software_engineer` | General-purpose implementation | — | — |
| `refactor_worker` | Code refactoring and cleanup | — | — |
| `browser_worker` | Browser automation | — | — |
| `data_engineer` | Data pipeline work | — | — |
| `ml_engineer` | ML model and training work | — | — |
| `devops_engineer` | Infrastructure and CI/CD | — | — |
| `code_reviewer` | Reviews pull requests (read-only) | — | — |
| `qa_engineer` | Testing and quality assurance | — | — |
| `security_reviewer` | Security audits (read-only) | — | — |
| `integration_worker` | Merges worktrees — the **only** role with `can_merge` | — | yes |
| `documentation_writer` | Writes and updates docs | — | — |
| `memory_curator` | Curates and prunes memory vault | — | — |
| `tech_lead` | Technical leadership and unblocking | — | — |
| `product_manager` | Manages roadmap and priorities | — | — |
| `analyst` | Data analysis and reporting | — | — |
| `orchestrator` | Generic sub-orchestration | — | — |
| `custom` | Escape hatch for user-defined roles | — | — |

### A2A Agent Cards

`buildA2ACard` produces a standard [A2A protocol](https://google.github.io/A2A/) `AgentCard` from an `AgentDefinition`:

```typescript
import { buildA2ACard } from '@fulcrum/core'

const card = buildA2ACard(agentDefinition, 'https://agents.example.com/run')
// → { name, description, url, version, capabilities, skills, ... }
```

Known capability → skill mappings: `code_generation`, `code_review`, `planning`, `research`, `memory`, `task_management`, `orchestration`. Unknown capabilities fall back to a generic role skill.

---

## Teams

Define a typed team template, then invoke it:

```typescript
import { createTeamTemplate, invokeTeam } from '@fulcrum/teams'

await createTeamTemplate({
  workspace_id: 'ws_1',
  name: 'implementation_squad',
  slots: [
    { role: 'chief_of_staff',    min: 1, max: 1 },
    { role: 'software_engineer', min: 1, max: 3 },
    { role: 'code_reviewer',     min: 1, max: 1 },
  ],
  communication_policy: 'hub_and_spoke',
  budget_class: 'medium',
  quality_class: 'standard',
})

const team = await invokeTeam({
  workspace_id: 'ws_1',
  template_name: 'implementation_squad',
  task_id: task.task_id,
  purpose: 'implement_auth_feature',
})
```

Team scheduling caps: global (8 concurrent), per-project (4), per-template (2). Only roles with `can_invoke_teams` (i.e., `chief_of_staff`) can invoke teams — enforced by the policy engine via `canInvokeTeams()`.

---

## Workflows

`@fulcrum/workflows` ships a real runner (`runWorkflow`) that drives a workflow run from start to finish: pick ready steps, execute them through 29 step handlers, persist state after every transition, retry failures with exponential backoff, and terminate with a final status.

### Defining a workflow

```typescript
import { registerWorkflow } from '@fulcrum/workflows'

registerWorkflow({
  name: 'implement_feature',
  version: '1.0',
  steps: [
    { step_id: 's1', step_type: 'prompt_user',    name: 'Clarify requirements', config: {} },
    { step_id: 's2', step_type: 'create_task',    name: 'Break down work',
      config: { title: 'Implement X' }, depends_on: ['s1'] },
    { step_id: 's3', step_type: 'spawn_agent',    name: 'Implement',
      config: { role: 'software_engineer' }, depends_on: ['s2'] },
    { step_id: 's4', step_type: 'wait_for_review', name: 'Code review', config: {}, depends_on: ['s3'] },
    { step_id: 's5', step_type: 'complete',       name: 'Done',       config: {}, depends_on: ['s4'] },
  ],
})
```

### Driving it with the runner

```typescript
import { runWorkflow } from '@fulcrum/workflows'

// Seed the workflow_runs row (via registry helpers or direct DB insert),
// then let the runner take it all the way to a terminal state:
const result = await runWorkflow({
  wf_id: 'wfr_01j...',
  workspace_id: 'ws_1',
  max_iterations: 1000,          // safety cap
  default_timeout_ms: 600_000,   // 10 min per step
  default_max_retries: 3,        // retry count per step
})
// {
//   wf_id: 'wfr_01j...',
//   final_status: 'completed' | 'blocked' | 'failed',
//   steps_executed: 7,
//   duration_ms: 2841,
// }
```

Under the hood, the runner:

1. Loads the run + step defs from `workflow_runs` (steps stored as JSON in the `steps` column)
2. Computes the set of currently-ready steps via `nextReadySteps()`
3. Executes each ready step through `executeStep()` with a timeout race
4. Retries failures up to `max_retries` with exponential backoff (1s, 2s, 4s, 8s, capped at 30s)
5. Persists step state after every transition
6. Emits `workflow.run` and `workflow.step` spans for telemetry
7. Terminates with `completed`, `blocked`, or `failed`

### 29 step handlers

**Core**
- `create_task` · `create_issue` · `create_epic`

**Memory**
- `write_memory` · `read_memory`

**Artifacts**
- `write_artifact` · `read_artifact` · `review_artifact`

**Control flow**
- `branch` · `loop` · `halt` · `escalate` · `prompt_user`

**Async gates**
- `wait_for_task` · `wait_for_review` · `wait_for_artifact`

**Agents**
- `spawn_agent` · `invoke_team`

**Scripts & tools**
- `run_script` · `call_mcp_tool` · `run_tool`

**Introspection & validation**
- `read_project` · `evaluate_policy` · `gate` · `validate_schema`

**Advanced**
- `parallel` · `complete` · `search_code` · `search_web`

See `docs/guides/workflow-authoring.md` for a detailed tutorial on building workflows, composing handlers, and writing custom step logic.

---

## Worker / Agent Executor

`@fulcrum/worker` is the pluggable execution layer that runs subordinate agents. It decouples "what role does the work" from "what CLI/SDK actually executes it" via a tiny `AgentAdapter` contract.

### The AgentAdapter contract

```typescript
import type { AgentAdapter, SpawnContext, WorkerResult } from '@fulcrum/worker'

export interface AgentAdapter {
  name: string
  spawn(ctx: SpawnContext): Promise<WorkerResult>
}

export interface SpawnContext {
  run_id: string
  workspace_id: string
  project_id: string
  task_id: string
  role: AgentRole
  model: string | null
  handoff: HandoffPacket | null
  worktree_path: string | null
  heartbeat: (current_step: string, progress_pct?: number) => Promise<void>
}

export interface WorkerResult {
  status: 'completed' | 'blocked'
  summary?: string
  artifact_paths?: string[]
  tests_passed?: number
  tests_failed?: number
  error?: string
}
```

Adapters never touch `@fulcrum/core` directly — they just describe how to run an agent given a context, and the lifecycle driver (`spawnAgent`) handles policy, run rows, heartbeats, telemetry, and terminal state.

### Built-in adapters

| Name | When to use | Configuration |
|------|-------------|---------------|
| `stub` | Tests and local dev. Reads canned `WorkerResult` JSON so tests can seed deterministic results. | `FULCRUM_AGENT_STUB_DIR` — a directory where `<run_id>.json` holds a canned result |
| `subprocess` | Running any external CLI (Claude, Gemini, PI, a custom script) as a Fulcrum agent. Parses `WorkerResult` JSON from stdout; non-JSON stdout becomes a plain-text summary. | `FULCRUM_AGENT_SUBPROCESS_CMD` — the full command line to exec |

### Registering a custom adapter

```typescript
import { registerAgentAdapter, spawnAgent } from '@fulcrum/worker'

registerAgentAdapter({
  name: 'my-cli',
  async spawn(ctx) {
    await ctx.heartbeat('my_cli_started', 0)
    // ... run your agent however you like ...
    await ctx.heartbeat('my_cli_finished', 100)
    return {
      status: 'completed',
      summary: 'did the thing',
      artifact_paths: ['out/patch.diff'],
      tests_passed: 12,
      tests_failed: 0,
    }
  },
})
```

### spawnAgent lifecycle

```typescript
import { spawnAgent } from '@fulcrum/worker'

const { run_id, result } = await spawnAgent({
  workspace_id: 'ws_1',
  project_id:   'proj_1',
  task_id:      'task_01j...',
  caller_role:  'chief_of_staff',       // must satisfy canInvokeTeams
  target_role:  'software_engineer',
  adapter:      'subprocess',           // or 'stub', or your own
  handoff:      optionalHandoffPacket,
  worktree_path: optionalWorktreePath,
})
```

Flow:

1. **Policy gate** — `canInvokeTeams(caller_role)` must return true, otherwise `FulcrumError('policy_denied')`
2. **Adapter resolution** — `input.adapter` → `FULCRUM_AGENT_ADAPTER` env → `'stub'`
3. **Run row** — `startAgentRun()` creates the `agent_runs` row
4. **Span** — `startSpan('agent.run', { role, model, adapter })`
5. **Adapter execution** — the adapter's `spawn()` runs, and every heartbeat it emits writes through to `heartbeatAgentRun()` and appends an event
6. **Terminal state** — `WorkerResult.status === 'completed'` triggers `completeAgentRun()`, `'blocked'` triggers `blockAgentRun()`, and any thrown error is funneled to `blockAgentRun()` so runs never leak in `running` state
7. **Span end** — `endSpan(status: 'ok' | 'error')`

See `docs/guides/worker-adapters.md` for a full walkthrough on writing a custom adapter (input serialization, heartbeat patterns, error handling).

---

## Policy Engine

### System Invariants (cannot be overridden)

Priority 1000, evaluated before any DB-defined rules. All four check capabilities via `roleCapabilities()`, not hardcoded string comparisons — the `role-string-guard` test enforces this.

| Rule | Description |
|------|-------------|
| `only_l1_invokes_teams` | Only roles with `can_invoke_teams` may create or invoke teams (§15) |
| `only_integration_worker_merges` | Only roles with `can_merge` may process the merge queue (§17) |
| `no_task_bypass` | `start_run` requires an existing task (no orphan runs) |
| `chief_of_staff_no_direct_writes` | L1 orchestrators must not directly edit files, write code, or merge — they coordinate, they don't execute |

### Custom Rules

```typescript
import { createPolicyRule, evaluatePolicy } from '@fulcrum/policy'

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
// { found: true, matches: [{ pattern: 'api_key', value: 'sk-...' }] }

const safe = redactSecrets(text)
// Replaces secrets with [REDACTED_API_KEY], [REDACTED_AWS_ACCESS_KEY], etc.
```

Detects: API keys, AWS credentials, private keys, OAuth tokens, Slack tokens, JWTs, password key-value pairs, credential URLs.

### Hook System

Each of `fulcrum hook claude|gemini|pi` reads a tool-call event from stdin, normalizes it to a canonical shape (tool name + params + actor role), logs it as a `hook_executed` event, and enforces the `chief_of_staff_no_direct_writes` invariant. Installing Fulcrum via `pnpm run setup` wires it into `~/.claude/settings.json` as a `PreToolUse` hook and into `~/.gemini/extensions/fulcrum/` as a Gemini extension, so the hook runs before every tool call automatically.

```bash
# What the hook actually does — called by the agent runtime
echo '{"tool":"Write","params":{"path":"src/foo.ts"},"role":"chief_of_staff"}' \
  | fulcrum hook claude
# exit 2, stderr: "POLICY_DENIED: chief_of_staff_no_direct_writes"
```

---

## Doctor

`fulcrum doctor` runs a battery of environment and configuration health checks:

```bash
fulcrum doctor          # human-readable output
fulcrum doctor --json   # JSON array of { name, status, message }
```

| Check | PASS | WARN | FAIL |
|-------|------|------|------|
| Node.js version | ≥ 20 | — | < 20 |
| `.fulcrum.json` | Present + valid | Missing | Invalid / missing fields |
| Data directory | Exists | Will be created on first use | — |
| `better-sqlite3` | Loads | — | Cannot load |
| Database liveness | `SELECT 1` OK | — | Error |
| `@modelcontextprotocol/sdk` | Loads | — | Cannot load |
| Environment variables | Any of `FULCRUM_DATA_DIR`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` set | None set | — |
| Agent integration files | Any of `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` found | None found | — |

Exit code is 0 when all checks pass or warn; 1 when any check fails.

---

## Sync (Plane Integration)

```typescript
import { syncObject, resolveConflict } from '@fulcrum/sync'

await syncObject({
  workspace_id: 'ws_1',
  object_type:  'issue',
  object_id:    issue.issue_id,
  local_data:   issue,
})

await resolveConflict({
  conflict_id: conflict.conflict_id,
  resolution:  'local_wins',   // or 'remote_wins' / 'manual'
})
```

Required env vars: `PLANE_API_KEY`, `PLANE_BASE_URL`, `PLANE_WORKSPACE_SLUG`, `PLANE_PROJECT_ID`.

---

## Worktrees

`@fulcrum/worktrees` is **not** a stub. It runs real `git` subprocesses and maintains a real merge queue with conflict detection and rollback.

### Allocation

```typescript
import { allocateWorktree } from '@fulcrum/worktrees'

const wt = await allocateWorktree({
  workspace_id: 'ws_1',
  project_id:   'proj_1',
  task_id:      task.task_id,
  run_id:       run.run_id,
  agent_role:   'software_engineer',
  base_branch:  'main',
  // branch_name optional — auto-generated from role + task
})
```

Behavior:

- **Git projects**: runs `git worktree add <project_root>/.fulcrum-worktrees/<worktree_id> -b <branch> <base_branch>` under the project root
- **Non-git projects**: falls back to `write_mode='sequential'` (no worktree, agents serialize in-place)
- Rejects if the branch already exists or the base branch is missing
- Emits `worktree_allocated` event + `worktree.allocate` span

### Marking ready + queuing

```typescript
import { markReady, enqueueMerge } from '@fulcrum/worktrees'

await markReady({ worktree_id: wt.worktree_id })
await enqueueMerge({ worktree_id: wt.worktree_id, priority: 10 })
```

### Processing the merge queue

```typescript
import { processMergeQueue } from '@fulcrum/worktrees'

const result = await processMergeQueue({
  workspace_id: 'ws_1',
  actor_role:   'integration_worker',
  project_id:   'proj_1',       // optional
})
// { merged: [...], skipped: [...], conflicts: [...], results: [...] }
```

Processing rules:

- **Policy gate**: only roles with `canMerge()` (i.e., `integration_worker`) may dequeue
- **FIFO** by `updated_at` (time the worktree entered `ready_for_merge`)
- **Gate artifacts**: worktree must have both a `review_report` and a `test_report` artifact with `status='final'`. Missing gates produce a `policy_denied` event and the worktree is skipped
- **Real merge**: runs `git merge --no-ff <branch>` in the project root against the base branch
- **Conflict**: on merge failure, runs `git merge --abort`, creates a `merge_conflict_report` artifact with the git output, sets the worktree to `status='conflict'`, and emits `merge_conflicted`
- **Success**: runs `git worktree remove --force <path>`, sets `status='merged'`, and emits `merge_completed`
- **Non-git / sequential**: nothing to merge, the worktree just transitions to `merged`

---

## Telemetry

Fulcrum ships distributed tracing by default. Every span is stored locally in the `trace_events` table, and if you set one env var, they dual-emit to any OTLP backend.

### Local spans

```typescript
import { startSpan, endSpan, getTrace } from '@fulcrum/core'

const parent = await startSpan({
  name: 'workflow.run',
  workspace_id: 'ws_1',
  payload: { wf_id: 'wfr_1' },
})

const child = await startSpan({
  name: 'workflow.step',
  workspace_id: 'ws_1',
  parent_span_id: parent.span_id,
  payload: { step_id: 's1', step_type: 'spawn_agent' },
})

await endSpan({ span_id: child.span_id, status: 'ok' })
await endSpan({ span_id: parent.span_id, status: 'ok', payload: { steps_executed: 7 } })

const trace = await getTrace({ trace_id: parent.trace_id })  // all spans in the trace
```

Root spans have `trace_id === span_id`. Payloads are shallow-merged on `endSpan` so you can attach start-time metadata on `startSpan` and end-time metrics on `endSpan` without losing either.

### Auto-instrumentation

| Span name | Where it lives |
|-----------|---------------|
| `workflow.run`         | `runWorkflow()` — wraps the whole run |
| `workflow.step`        | `runWorkflow()` — per step, child of `workflow.run` |
| `agent.run`            | `spawnAgent()` — wraps the adapter execution |
| `janitor.cycle`        | `runJanitorCycle()` — per tick |
| `mcp.tool`             | MCP server handler — per tool invocation |
| `worktree.allocate`    | `allocateWorktree()` |
| `worktree.merge`       | `processMergeQueue()` |

### Opt-in OTLP exporter

Set `OTEL_EXPORTER_OTLP_ENDPOINT` and Fulcrum will dual-emit every span to your OTel collector alongside the local DB write:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

```typescript
import { initOtel, shutdownOtel } from '@fulcrum/core'

await initOtel()     // no-op if OTEL_EXPORTER_OTLP_ENDPOINT is not set
// ... app runs ...
await shutdownOtel() // flush exporter on shutdown
```

Works with Datadog, Honeycomb, Jaeger, Grafana Tempo, New Relic, and anything else that speaks OTLP/HTTP. Agent-related payloads use the `gen_ai.*` semantic conventions:

| Fulcrum payload key | OTel attribute |
|---------------------|----------------|
| `role` / `target_role` | `gen_ai.agent.name` |
| `model`                | `gen_ai.request.model` |
| `adapter`              | `gen_ai.system` (`fulcrum.stub`, `fulcrum.subprocess`, …) |

See `docs/guides/telemetry.md` for exporter configuration, attribute mapping, and querying patterns.

---

## Monitor Server

```typescript
import { startMonitorServer } from '@fulcrum/monitor'

const stop = await startMonitorServer({ workspace_id: 'ws_1', port: 7331 })
// stop() to shut down
```

### Read endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/status` | Health check |
| `GET` | `/metrics` | Daily + project metrics |
| `GET` | `/burndown` | Burndown data |
| `GET` | `/analytics/per-role` | Per-role aggregate metrics |
| `GET` | `/analytics/memory` | Memory write/recall metrics |
| `GET` | `/analytics/forecast` | Trend forecasting |
| `GET` | `/analytics/summary` | High-level analytics rollup |
| `GET` | `/events/stream` | Server-Sent Events stream |
| `GET` | `/board` | Kanban board snapshot |
| `GET` | `/agents` · `/agents/:id` | Agent run list / detail (paginated) |
| `GET` | `/merge-queue` | Current merge queue |
| `GET` | `/review-queue` | Current review queue |
| `GET` | `/artifacts` | Artifacts by workspace / project |
| `GET` | `/memory-trace` | Memory read/write trace |
| `GET` | `/policy/events` | Recent policy decisions |
| `GET` | `/sync/state` | Plane sync state |
| `GET` | `/teams` | Team templates + instances |
| `GET` | `/replay/:run_id` | Replay an agent run's events |
| `GET` | `/tasks` · `/workspaces` · `/projects` | Read models (tasks paginated) |

List endpoints that support pagination (`/tasks`, `/agents`, `/artifacts`, `/memory-trace`, `/teams`) accept `?limit=N&cursor=OFFSET` and return:
```json
{ "data": [...], "pagination": { "total": 42, "limit": 20, "offset": 0, "next_cursor": 20 } }
```
`next_cursor` is `null` when all results are exhausted. Maximum `limit` is 200.

### Control endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/tasks` | Create a task |
| `POST` | `/runs` | Start a run (policy-checked) |
| `POST` | `/runs/:id/heartbeat` | Heartbeat a run |
| `POST` | `/runs/:id/complete` | Complete a run |
| `POST` | `/runs/:id/block` | Block a run |
| `POST` | `/memory/recall` | Hybrid recall across L1/L2 |
| `POST` | `/memory/write` | Write a memory |
| `POST` | `/cos-context` | Build the CoS context block |
| `POST` | `/policy/check` | Evaluate policy against an actor + resource |

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
| `FULCRUM_AGENT_ADAPTER` | Default worker adapter name (`stub` / `subprocess` / custom) |
| `FULCRUM_AGENT_STUB_DIR` | Directory with canned `WorkerResult` JSON for the stub adapter |
| `FULCRUM_AGENT_SUBPROCESS_CMD` | Command line for the subprocess adapter |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Enable OTLP span export to a collector |
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

The janitor is overlapping-cycle safe — if a cycle takes longer than the interval, the next tick is skipped. Every cycle emits a `janitor.cycle` span.

The janitor also runs **memory decay** each cycle: memories with `importance < 0.5` that haven't been accessed in 7+ days are decayed by a multiplicative `0.9^weeksElapsed` factor (floor `0.01`). Pass `runDecay: false` to opt out for a specific invocation.

---

## Database

Fulcrum uses SQLite with WAL mode, foreign keys, and FTS5. `runMigrations(db)` is fully idempotent and ships **33 migrations** (including `content_type` column on `memories`).

**Pragmas set on every connection:** `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`, `synchronous=NORMAL`, `cache_size=-8000` (8 MB).

**Transaction helper:**

```typescript
import { withTransaction } from '@fulcrum/core'

const result = withTransaction(() => {
  getDb().prepare('INSERT INTO tasks ...').run(...)
  return taskId
})
// Uses BEGIN IMMEDIATE — safe under concurrent WAL readers.
// Rolls back automatically on any thrown error.
```

**Liveness check:**

```typescript
import { checkDbHealth } from '@fulcrum/core'

const health = checkDbHealth()
// { ok: true, latencyMs: 1 }  or  { ok: false, error: '...' }
```

**Tables:** `workspaces`, `projects`, `tasks`, `agent_runs`, `memories`, `advisory_locks`, `handoffs`, `events`, `epics`, `issues`, `prds`, `plans`, `task_relations`, `task_labels`, `issue_labels`, `plan_issues`, `prd_plans`, `reviews`, `worktrees`, `artifacts`, `artifact_contracts`, `team_templates`, `team_instances`, `team_members`, `workflow_runs`, `sync_states`, `sync_conflicts`, `sync_queue`, `policy_rules`, `policy_events`, `display_id_sequences`, `agentrun_artifacts`, `review_targets`, `task_memory_links`, `artifact_memory_links`, `analytics_daily`, `analytics_cycle`, `analytics_project`, `analytics_agent`, `analytics_team`, `memory_entities`, `code_chunks`, `graph_entities`, `graph_edges`, `graph_episodes`, `trace_events`, `agent_definitions`, `schema_migrations`

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

`writeMemory` auto-selects the embedder based on `content_type`:

```typescript
await writeMemory({
  content: 'function add(a, b) { return a + b }',
  content_type: 'code',   // routes to code embedder; default is 'text'
  workspace_id: 'ws_1',
  project_id: 'proj_1',
})
```

**Repo map** — `@fulcrum/memory` ships an aider-style repo map builder for passing relevant symbol context to agents:

```typescript
import { scanAndBuildRepoMap } from '@fulcrum/memory'

const map = await scanAndBuildRepoMap('/path/to/project')
// map.summary — compact "path.ts  [funcName:1, ClassName:10]" per-file lines
// map.files   — RepoFileEntry[] with symbols[], language, path
```

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

**1258 tests passing across 11 packages.** Tests use an in-memory SQLite DB injected via `setDb()`.

| Package | Tests |
|---------|:-----:|
| `@fulcrum/core`       | 524  |
| `@fulcrum/memory`     | 217  |
| `@fulcrum/planning`   | 102  |
| `@fulcrum/policy`     | 100  |
| `@fulcrum/worktrees`  | 41   |
| `@fulcrum/teams`      | 35   |
| `@fulcrum/monitor`    | 35   |
| `@fulcrum/workflows`  | 35   |
| `@fulcrum/cli`        | 136  |
| `@fulcrum/sync`       | 20   |
| `@fulcrum/worker`     | 13   |

---

## Guards

Three guard tests protect against entire classes of bugs. Each round of gap analysis found a class of bug, added a guard, then future rounds didn't find that class again. **The guards are the durable value** — any of them failing in CI is a bright red line that a recurring bug is trying to come back.

### 1. CHECK-drift guard

`packages/core/src/tests/check-constraints.test.ts`

Asserts that **14 enum columns** across the schema carry their expected `CHECK` constraints. Several early migrations rebuilt tables via `CREATE TABLE ... SELECT` which silently drops CHECK constraints — a class of bug that repeatedly slipped through review because nothing surfaced the drift at test time. The guard snapshots each CHECK against the column's enum type and fails if a rebuild drops or narrows it.

### 2. Bare-ulid guard

`packages/core/src/tests/ulid-guard.test.ts`

Grep-based guard that forbids first-class ID generation bypassing `newId()` anywhere in the codebase. Bare ULIDs broke cross-table correlation and telemetry because they missed the typed prefix (`task_`, `run_`, `span_`, …). The guard scans every file for the bare ULID regex and the direct `ulid()` import.

### 3. Role-string guard

`packages/core/src/tests/role-string-guard.test.ts`

Grep-based guard that forbids hardcoded role comparisons (e.g., `role === 'chief_of_staff'`, `role === 'integration_worker'`) **outside** `roles.ts`. All role logic must go through `isL1`, `canInvokeTeams`, `canMerge`, `canWriteCode`, `canEditFiles`, or `roleCapabilities`. This prevents role-boundary drift — the kind of bug where a new role is added and only 8 of 12 check sites get updated.

---

## Project Structure

```
fulcrum/
├── packages/
│   ├── core/               # @fulcrum/core
│   │   └── src/
│   │       ├── db/         # Schema migrations (29), WAL config, client
│   │       ├── embedding/  # Local embedder, reranker, registry
│   │       ├── telemetry/  # spans.ts, otel.ts
│   │       ├── tests/      # Vitest suite — 432 tests, includes 3 guards
│   │       ├── config.ts
│   │       ├── tasks.ts
│   │       ├── runs.ts
│   │       ├── policy.ts
│   │       ├── memory.ts
│   │       ├── janitor.ts
│   │       ├── status.ts
│   │       ├── handoffs.ts
│   │       ├── cos-context.ts · cos-parser.ts
│   │       ├── events.ts
│   │       ├── roles.ts    # Role capability helpers (single source of truth)
│   │       ├── locks.ts    # Advisory locks
│   │       ├── ids.ts      # newId() — the only ULID entry point
│   │       ├── types.ts    # All shared types and FulcrumError
│   │       └── index.ts    # Public API surface
│   │
│   ├── memory/             # @fulcrum/memory
│   │   └── src/
│   │       ├── vault/      # L0: client, watcher, git, formatter, state, index-builder
│   │       ├── kuzu/       # L2: client, schema, upsert, query (6-stage pipeline)
│   │       ├── extractors/ # Structured + semantic entity extraction
│   │       ├── setup/      # rebuild, reconcile, activate, init
│   │       ├── tests/      # 175 tests
│   │       ├── write.ts
│   │       ├── recall.ts
│   │       ├── dedup.ts
│   │       ├── scoring.ts
│   │       └── types.ts
│   │
│   ├── monitor/            # @fulcrum/monitor
│   │   └── src/
│   │       ├── metrics/
│   │       ├── server.ts   # Hono HTTP server + SSE + control API
│   │       └── types.ts
│   │
│   ├── planning/           # @fulcrum/planning
│   │   └── src/
│   │       ├── epics.ts
│   │       ├── issues.ts
│   │       ├── prds.ts
│   │       ├── plans.ts
│   │       ├── relations.ts
│   │       └── reviews.ts
│   │
│   ├── policy/             # @fulcrum/policy
│   │   └── src/
│   │       ├── engine.ts   # SYSTEM_INVARIANTS (4), evaluatePolicy
│   │       ├── rules.ts
│   │       ├── secrets.ts  # 9 patterns
│   │       └── audit.ts
│   │
│   ├── sync/               # @fulcrum/sync
│   │   └── src/
│   │       ├── manager.ts
│   │       ├── conflicts.ts
│   │       └── adapters/plane/
│   │
│   ├── teams/              # @fulcrum/teams
│   │   └── src/
│   │       ├── templates.ts
│   │       ├── instances.ts
│   │       └── scheduler.ts
│   │
│   ├── worker/             # @fulcrum/worker          ← NEW
│   │   └── src/
│   │       ├── adapter.ts     # registerAgentAdapter, getAgentAdapter
│   │       ├── lifecycle.ts   # spawnAgent — policy + run + adapter + spans
│   │       ├── stub.ts        # built-in stub adapter
│   │       ├── subprocess.ts  # built-in subprocess adapter
│   │       ├── types.ts       # AgentAdapter, SpawnContext, WorkerResult
│   │       └── tests/
│   │
│   ├── workflows/          # @fulcrum/workflows
│   │   └── src/
│   │       ├── registry.ts
│   │       ├── engine.ts         # nextReadySteps, step state machine
│   │       ├── runner.ts         # runWorkflow — driver loop
│   │       ├── step-executor.ts  # 29 step handlers
│   │       ├── workflows.ts      # startWorkflow / stepWorkflow (interactive path)
│   │       └── tests/
│   │
│   ├── worktrees/          # @fulcrum/worktrees
│   │   └── src/
│   │       ├── worktrees.ts      # allocateWorktree, processMergeQueue (real git)
│   │       └── tests/
│   │
│   └── cli/                # @fulcrum/cli
│       └── src/
│           ├── index.ts          # 14 command groups, auto-init, hook handlers
│           └── tests/
│
├── agent-integration/      # Runtime installers
│   ├── install.ts          # pnpm setup entry point
│   ├── claude/             # Claude Code hook + CLAUDE.md
│   ├── codex/              # OpenAI Codex CLI — AGENTS.md + mcp-config.json
│   ├── gemini/             # Gemini extension + GEMINI.md
│   ├── opencode/           # opencode — opencode.md + config.json
│   └── pi/                 # PI cockpit extension
│
├── docs/                   # Design specs and guides
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
