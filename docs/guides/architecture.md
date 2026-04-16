# Architecture

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Agent CLIs / Runtimes                         │
│    Claude Code  ·  Gemini CLI  ·  PI  ·  custom subprocess       │
│          (PreToolUse hooks call `fulcrum hook <runtime>`)        │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      @moabualruz/fulcrum-worker                             │
│   spawnAgent → policy gate → adapter.spawn → run lifecycle       │
│   Built-in: stub · subprocess    Pluggable: registerAgentAdapter │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                       @moabualruz/fulcrum-core                              │
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

**Dependency rule:** all packages depend on `@moabualruz/fulcrum-core`; `@moabualruz/fulcrum-policy` must NOT depend on `@moabualruz/fulcrum-teams` (the teams package uses `setTeamOps`/`getTeamOps` inversion-of-control to avoid this cycle); `@moabualruz/fulcrum-worker` depends on `@moabualruz/fulcrum-core`; step handlers in `@moabualruz/fulcrum-workflows` use lazy imports to avoid cross-package cycles. Hook types (`HookCli`, `HookContext`, etc.) live in `@moabualruz/fulcrum-core` so non-CLI packages can reference the hook contract without pulling in the CLI.

---

## Package Ownership

| Package | Responsibility |
|---------|---------------|
| `@moabualruz/fulcrum-core` | Domain functions, SQLite schema (52 migrations), role capability helpers, telemetry spans + OTel exporter, embedding providers, handoff protocol, in-process event bus, hook types |
| `@moabualruz/fulcrum-memory` | Three-layer memory stack — L0 git vault, L1 FTS5 + scoring, L2 Kuzu graph + HNSW vector search |
| `@moabualruz/fulcrum-monitor` | Real-time metrics dashboard — daily/project/agent metrics, burndown, SSE event stream, HTTP control API |
| `@moabualruz/fulcrum-planning` | Project planning domain — epics, issues, PRDs, plans, dependency graph, code review workflows |
| `@moabualruz/fulcrum-policy` | Policy engine — 5 system invariants, custom rules, secret guard (12 named patterns), audit log |
| `@moabualruz/fulcrum-sync` | Bidirectional sync — Plane integration with retry/backoff, conflict detection, secret scan before push |
| `@moabualruz/fulcrum-teams` | Agent team orchestration — typed templates, slot policies, communication/budget/quality/latency classes |
| `@moabualruz/fulcrum-worker` | Pluggable agent executor — `AgentAdapter` contract, stub + subprocess + claude-code adapters, `spawnAgent` lifecycle |
| `@moabualruz/fulcrum-workflows` | Workflow engine — declarative step graphs, runner with structured `RetryPolicy`, 29 step handlers |
| `@moabualruz/fulcrum-worktrees` | Worktree lifecycle — real `git worktree add` allocation, artifact tracking, review gating, merge queue |
| `@moabualruz/fulcrum-cli` | `fulcrum` binary — 21 command groups, 23 MCP tools, auto-init per project, hook handlers |

---

## Guard Tests

Three guard tests protect against entire classes of recurring bugs. Each was added when an audit round found a new class of bug — future rounds didn't find that class again.

### 1. CHECK-drift guard

`packages/core/src/tests/check-constraints.test.ts`

Asserts that **14 enum columns** across the schema carry their expected `CHECK` constraints. Several early migrations rebuilt tables via `CREATE TABLE ... SELECT` which silently drops CHECK constraints. The guard snapshots each CHECK against the column's enum type and fails if a rebuild drops or narrows it.

### 2. Bare-ulid guard

`packages/core/src/tests/ulid-guard.test.ts`

Grep-based guard that forbids first-class ID generation bypassing `newId()` anywhere in the codebase. Bare ULIDs broke cross-table correlation and telemetry because they missed the typed prefix (`task_`, `run_`, `span_`, …). The guard scans every file for the bare ULID regex and the direct `ulid()` import.

### 3. Role-string guard

`packages/core/src/tests/role-string-guard.test.ts`

Grep-based guard that forbids hardcoded role comparisons (e.g., `role === 'chief_of_staff'`) **outside** `roles.ts`. All role logic must go through `isL1`, `canInvokeTeams`, `canMerge`, `canWriteCode`, `canEditFiles`, or `roleCapabilities`. This prevents role-boundary drift when new roles are added.

---

## Project Structure

```
fulcrum/
├── packages/
│   ├── core/               # @moabualruz/fulcrum-core
│   │   └── src/
│   │       ├── db/         # Schema migrations (52), WAL config, client
│   │       ├── embedding/  # Local embedder, reranker, registry
│   │       ├── telemetry/  # spans.ts, otel.ts
│   │       ├── tests/      # Vitest suite — 534 tests, includes 3 guards
│   │       ├── config.ts
│   │       ├── tasks.ts
│   │       ├── runs.ts
│   │       ├── policy.ts
│   │       ├── memory.ts
│   │       ├── janitor.ts
│   │       ├── status.ts
│   │       ├── handoffs.ts
│   │       ├── cos-context.ts · cos-parser.ts
│   │       ├── events.ts   # emitEvent — writes to DB and fires event-bus
│   │       ├── event-bus.ts # In-process pub/sub (getEventBus, setEventBus, resetEventBus)
│   │       ├── hooks.ts    # 6 pure hook types re-exported to non-CLI packages
│   │       ├── team-ops.ts # setTeamOps/getTeamOps IoC — breaks core↔teams cycle
│   │       ├── roles.ts    # Role capability helpers (single source of truth)
│   │       ├── locks.ts    # Advisory locks
│   │       ├── ids.ts      # newId() — the only ULID entry point
│   │       ├── types.ts    # All shared types, FulcrumError, EmitEventInput
│   │       └── index.ts    # Public API surface
│   │
│   ├── memory/             # @moabualruz/fulcrum-memory
│   │   └── src/
│   │       ├── vault/      # L0: client, watcher, git, formatter, state, index-builder
│   │       ├── kuzu/       # L2: client, schema, upsert, query (7-stage pipeline)
│   │       │   ├── schema.ts       # Memory + Entity nodes; USES/IS_A/PART_OF/... relations
│   │       │   ├── client.ts       # KuzuClient, getKuzuClient
│   │       │   └── entity-store.ts # resolveEntity, incrementMentionCount
│   │       ├── extractors/ # Structured + semantic entity extraction
│   │       ├── setup/      # rebuild, reconcile, activate, init (uses readRawConfig from core)
│   │       ├── ingest.ts   # ingestFile — writes Memory nodes + import USES edges for TS/JS
│   │       ├── write.ts
│   │       ├── recall.ts   # embedQuery ?? embed.bind(); sigmoid reranker; BM25 sparse rescue
│   │       ├── dedup.ts
│   │       ├── scoring.ts
│   │       └── types.ts
│   │
│   ├── monitor/            # @moabualruz/fulcrum-monitor
│   │   └── src/
│   │       ├── metrics/
│   │       ├── server.ts   # Hono HTTP server + SSE + control API
│   │       └── types.ts
│   │
│   ├── planning/           # @moabualruz/fulcrum-planning
│   │   └── src/
│   │       ├── epics.ts · issues.ts · prds.ts · plans.ts · relations.ts · reviews.ts
│   │
│   ├── policy/             # @moabualruz/fulcrum-policy
│   │   └── src/
│   │       ├── engine.ts   # SYSTEM_INVARIANTS (5), evaluatePolicy
│   │       ├── rules.ts
│   │       ├── secrets.ts  # 12 patterns, range-based dedup
│   │       └── audit.ts
│   │
│   ├── sync/               # @moabualruz/fulcrum-sync
│   │   └── src/
│   │       ├── manager.ts · conflicts.ts
│   │       └── adapters/plane/
│   │
│   ├── teams/              # @moabualruz/fulcrum-teams
│   │   └── src/
│   │       ├── templates.ts · instances.ts · scheduler.ts
│   │
│   ├── worker/             # @moabualruz/fulcrum-worker
│   │   └── src/
│   │       ├── adapter.ts     # registerAgentAdapter, getAgentAdapter
│   │       ├── lifecycle.ts   # spawnAgent — policy + run + adapter + spans
│   │       ├── stub.ts        # built-in stub adapter
│   │       ├── subprocess.ts  # built-in subprocess adapter
│   │       ├── claude-code.ts # claude-code adapter
│   │       └── types.ts       # AgentAdapter, SpawnContext, WorkerResult
│   │
│   ├── workflows/          # @moabualruz/fulcrum-workflows
│   │   └── src/
│   │       ├── registry.ts
│   │       ├── engine.ts         # nextReadySteps, step state machine
│   │       ├── runner.ts         # runWorkflow — calls checkWorkflowPeers on entry
│   │       ├── check-peers.ts    # advisory peer-dep check (@moabualruz/fulcrum-planning, teams, worker)
│   │       └── step-executor.ts  # 29 step handlers
│   │
│   ├── worktrees/          # @moabualruz/fulcrum-worktrees
│   │   └── src/
│   │       └── worktrees.ts      # allocateWorktree, processMergeQueue (real git)
│   │
│   └── cli/                # @moabualruz/fulcrum-cli
│       └── src/
│           ├── index.ts          # 21 command groups, auto-init
│           ├── hooks.ts          # normalizeHookEvent, runPreHook, runPostHook
│           │                     # (types imported from @moabualruz/fulcrum-core)
│           ├── mcp-server.ts     # JSON-RPC 2.0 MCP server; HTTP StreamableHTTP transport
│           └── mcp-tools.ts      # TOOL_SCHEMAS — single source of truth for all 23 tools
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
